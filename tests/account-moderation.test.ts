import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { handleAccountModeration } from "../lib/server/accountModeration";
const root = "11111111-1111-4111-8111-111111111111";
const target = "22222222-2222-4222-8222-222222222222";
function request(action = "delete", extra: Record<string, unknown> = {}) {
  return new Request("https://guacabook.test/api/admin/accounts", { method: "POST", headers: {
    origin: "https://guacabook.test", authorization: "Bearer test-token", "Content-Type": "application/json",
  }, body: JSON.stringify({ action, userId: target, confirmEmail: "person@example.com", ...extra }) });
}
function fixture({ allowed = true, protectedAccount = false, own = false, failStorage = false, pending = false } = {}) {
  const events: string[] = [];
  const files = new Set([`${target}/first`, `${target}/nested/second`]);
  let privilegedCalls = 0;
  const account = { account_id: own ? root : target, email: "person@example.com", protected: protectedAccount, active: true, deletion_pending: pending };
  const publicClient = {
    auth: { getUser: async () => ({ data: { user: { id: root } }, error: null }) },
    rpc: async (name: string, args?: any) => {
      if (name === "can_manage_accounts") return { data: allowed, error: null };
      if (name === "admin_list_accounts") return { data: [account], error: null };
      events.push(`db:${args.operation}`);
      if (args.operation === "delete") account.deletion_pending = true;
      return { error: null };
    },
  };
  const privileged = {
    auth: { admin: {
      updateUserById: async (_: string, data: any) => { events.push(`auth:${data.ban_duration}`); return { error: null }; },
      deleteUser: async (id: string, soft: boolean) => { assert.equal(id, target); assert.equal(soft, false); events.push("auth:delete"); return { error: null }; },
    } },
    storage: { from: () => ({
      list: async (prefix: string) => {
        events.push(`list:${prefix}`);
        if (failStorage) return { error: new Error("Storage unavailable") };
        const items = new Map<string, { name: string; id: string | null }>();
        for (const path of files) {
          if (!path.startsWith(prefix + "/")) continue;
          const rest = path.slice(prefix.length + 1), name = rest.split("/")[0];
          items.set(name, { name, id: rest.includes("/") ? null : "object-id" });
        }
        return { data: [...items.values()], error: null };
      },
      remove: async (paths: string[]) => { events.push("storage:remove"); paths.forEach(path => { assert.ok(path.startsWith(target + "/")); files.delete(path); }); return { error: null }; },
    }) },
  };
  return { events, account, files, dependencies: {
    publicClient: () => publicClient as unknown as SupabaseClient,
    privilegedClient: () => { privilegedCalls++; return privileged as unknown as SupabaseClient; },
  }, get privilegedCalls() { return privilegedCalls; } };
}
test("moderation rejects non-admins, protected/own accounts and missing confirmation before privileged access", async () => {
  for (const setup of [{ allowed: false }, { protectedAccount: true }, { own: true }]) {
    const f = fixture(setup);
    const result = await handleAccountModeration(request("delete", setup.own ? { userId: root } : {}), f.dependencies);
    assert.equal(result.status, 403);
    assert.equal(f.privilegedCalls, 0);
  }
  const f = fixture();
  assert.equal((await handleAccountModeration(request("delete", { confirmEmail: "wrong@example.com" }), f.dependencies)).status, 400);
  assert.equal(f.privilegedCalls, 0);
  const crossOrigin = request(); crossOrigin.headers.set("origin", "https://attacker.test");
  assert.equal((await handleAccountModeration(crossOrigin, f.dependencies)).status, 403);
});
test("deletion blocks access, removes nested account files, then hard-deletes Auth", async () => {
  const f = fixture();
  assert.equal((await handleAccountModeration(request(), f.dependencies)).status, 200);
  assert.equal(f.events[0], "db:delete");
  assert.equal(f.events.at(-1), "auth:delete");
  assert.equal(f.files.size, 0);
});
test("failed deletion remains blocked, preserves Auth and can be retried", async () => {
  const f = fixture({ failStorage: true });
  assert.equal((await handleAccountModeration(request(), f.dependencies)).status, 502);
  assert.equal(f.account.deletion_pending, true);
  assert.equal(f.events.includes("auth:delete"), false);
  const retry = fixture({ pending: true });
  assert.equal((await handleAccountModeration(request(), retry.dependencies)).status, 200);
});
test("ban blocks existing JWTs before Auth; unban leaves activation explicit", async () => {
  const f = fixture();
  assert.equal((await handleAccountModeration(request("ban"), f.dependencies)).status, 200);
  assert.deepEqual(f.events, ["db:ban", "auth:876000h"]);
  const unban = fixture();
  assert.equal((await handleAccountModeration(request("unban"), unban.dependencies)).status, 200);
  assert.deepEqual(unban.events, ["auth:none", "db:unban"]);
});
