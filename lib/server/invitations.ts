import type { SupabaseClient } from "@supabase/supabase-js";
import type { ManagedAccount } from "../accounts";
type Dependencies = {
  publicClient: (token: string) => SupabaseClient;
  privilegedClient: () => SupabaseClient;
};
export async function handleInvitation(
  request: Request,
  dependencies: Dependencies,
): Promise<Response> {
  const origin = new URL(request.url).origin;
  if (request.headers.get("origin") !== origin)
    return Response.json({ error: "origin" }, { status: 403 });
  const bearer = request.headers.get("authorization");
  if (!bearer?.startsWith("Bearer "))
    return Response.json({ error: "authentication" }, { status: 401 });
  const token = bearer.slice(7);
  try {
    const client = dependencies.publicClient(token);
    const {
      data: { user },
      error: authError,
    } = await client.auth.getUser(token);
    if (authError || !user)
      return Response.json({ error: "authentication" }, { status: 401 });
    const { data: allowed, error: permissionError } = await client.rpc(
      "can_manage_accounts",
    );
    if (permissionError || allowed !== true)
      return Response.json({ error: "administrator" }, { status: 403 });
    const body = await request.json().catch(() => null);
    if (!body || !["invite", "reset"].includes(body.action))
      return Response.json({ error: "input" }, { status: 400 });
    const { data: accounts, error: listError } = await client.rpc(
      "admin_list_accounts",
    );
    if (listError) throw listError;
    let email: string, typeId: string | undefined;
    if (body.action === "invite") {
      email =
        typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      typeId = body.typeId;
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return Response.json({ error: "email" }, { status: 400 });
      if (
        (accounts as ManagedAccount[]).some(
          (a) => a.email.toLowerCase() === email,
        )
      )
        return Response.json({ error: "existing" }, { status: 409 });
      const { data: types, error } = await client.rpc(
        "admin_list_account_types",
      );
      if (error || !Array.isArray(types) || !types.some((t) => t.id === typeId))
        return Response.json({ error: "type" }, { status: 400 });
    } else {
      const account = (accounts as ManagedAccount[]).find(
        (a) => a.account_id === body.userId,
      );
      if (!account || !account.active)
        return Response.json({ error: "account" }, { status: 400 });
      if (account.protected && account.account_id !== user.id)
        return Response.json({ error: "protected" }, { status: 403 });
      email = account.email;
    }
    // The privileged client is never created before the caller's live permissions are checked.
    const privileged = dependencies.privilegedClient();
    const redirectTo = `${origin}/auth/${body.action === "invite" ? "invite" : "recover"}`;
    const deliverEmail = body.action === "invite" && body.delivery === "email";
    let invitedUserId: string;
    let link: string | undefined;
    if (deliverEmail) {
      const { data, error } = await privileged.auth.admin.inviteUserByEmail(
        email,
        { redirectTo },
      );
      if (error || !data.user) throw error || new Error("Missing invited user");
      invitedUserId = data.user.id;
    } else {
      const { data, error } = await privileged.auth.admin.generateLink({
        type: body.action === "invite" ? "invite" : "recovery",
        email,
        options: { redirectTo },
      });
      if (error || !data.properties?.action_link || !data.user)
        throw error || new Error("Missing link");
      invitedUserId = data.user.id;
      link = data.properties.action_link;
    }
    if (body.action === "invite") {
      // All new accounts start suspended. Only this authorized operation activates the invitee.
      const { error } = await client.rpc("admin_set_account", {
        target_user: invitedUserId,
        new_type: typeId,
        new_active: true,
      });
      if (error) throw error;
    }
    return Response.json(deliverEmail ? { sent: true } : { link }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "configuration_or_service" },
      { status: 502 },
    );
  }
}
