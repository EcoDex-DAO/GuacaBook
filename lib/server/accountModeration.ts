import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountOperation, ManagedAccount } from "../accounts";
import { BUCKET } from "../cloud";
type Dependencies = {
  publicClient: (token: string) => SupabaseClient;
  privilegedClient: () => SupabaseClient;
};

// Only the account's prefix is traversed. Empty the first page repeatedly so
// removing files cannot cause offset pagination to skip objects.
async function removeAccountFiles(client: SupabaseClient, prefix: string) {
  const bucket = client.storage.from(BUCKET);
  for (;;) {
    const { data, error } = await bucket.list(prefix, { limit: 100, sortBy: { column: "name", order: "asc" } });
    if (error) throw error;
    if (!data?.length) return;
    const files: string[] = [];
    for (const item of data) {
      const path = `${prefix}/${item.name}`;
      if (item.id) files.push(path);
      else await removeAccountFiles(client, path);
    }
    if (files.length) {
      const { error } = await bucket.remove(files);
      if (error) throw error;
    }
  }
}

export async function handleAccountModeration(request: Request, dependencies: Dependencies): Promise<Response> {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json({ error: "origin" }, { status: 403 });
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer "))
    return Response.json({ error: "authentication" }, { status: 401 });
  try {
    const token = authorization.slice(7);
    const client = dependencies.publicClient(token);
    const { data: { user }, error: authError } = await client.auth.getUser(token);
    if (authError || !user) return Response.json({ error: "authentication" }, { status: 401 });
    const { data: allowed, error: permissionError } = await client.rpc("can_manage_accounts");
    if (permissionError || allowed !== true) return Response.json({ error: "administrator" }, { status: 403 });
    const body = await request.json().catch(() => null);
    const operations: AccountOperation[] = ["suspend", "activate", "ban", "unban", "delete"];
    if (!body || !operations.includes(body.action) || typeof body.userId !== "string" || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(body.userId))
      return Response.json({ error: "input" }, { status: 400 });
    const { data: accounts, error: listError } = await client.rpc("admin_list_accounts");
    if (listError) throw listError;
    const target = (accounts as ManagedAccount[]).find(a => a.account_id === body.userId);
    if (!target) return Response.json({ error: "account" }, { status: 404 });
    if (target.protected || target.account_id === user.id)
      return Response.json({ error: "protected" }, { status: 403 });
    if (body.confirmEmail !== target.email)
      return Response.json({ error: "confirmation" }, { status: 400 });
    // Fail before changing anything if the required server credentials are absent.
    const privileged = dependencies.privilegedClient();
    if (body.action === "unban" || body.action === "activate") {
      // Keep DB access blocked until Auth has been successfully restored.
      if (target.deletion_pending || (body.action === "activate" && target.banned))
        return Response.json({ error: "state" }, { status: 409 });
      const { error } = await privileged.auth.admin.updateUserById(target.account_id, { ban_duration: "none" });
      if (error) throw error;
    }
    const { error: moderationError } = await client.rpc("admin_moderate_account", {
      target_user: target.account_id, operation: body.action,
    });
    if (moderationError) {
      if (moderationError.code === "PGRST202") return Response.json({ error: "migration_required" }, { status: 503 });
      throw moderationError;
    }
    if (body.action === "ban") {
      const { error } = await privileged.auth.admin.updateUserById(target.account_id, { ban_duration: "876000h" });
      if (error) throw error;
    }
    if (body.action === "delete") {
      await removeAccountFiles(privileged, target.account_id);
      const { error } = await privileged.auth.admin.deleteUser(target.account_id, false);
      if (error) throw error;
    }
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // A failed ban/deletion remains blocked in the DB, and can be retried.
    return Response.json({ error: "configuration_or_service" }, { status: 502 });
  }
}
