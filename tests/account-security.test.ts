import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { handleInvitation } from "../lib/server/invitations";
import type { SupabaseClient } from "@supabase/supabase-js";
const root = "33333333-3333-4333-8333-333333333333",
  a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222",
  spoof = "44444444-4444-4444-8444-444444444444";
test("PostgreSQL : administrateur protégé, types et comptes administrables uniquement par les admins, suspension effective", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;
 create schema auth;create table auth.users(id uuid primary key,email text,created_at timestamptz default now(),email_confirmed_at timestamptz,encrypted_password text,raw_user_meta_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id bigint generated always as identity,bucket_id text,name text);
 create function storage.foldername(text) returns text[] language sql immutable as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;
 alter table storage.objects enable row level security;
 grant usage on schema storage to authenticated;grant select,insert,update,delete on storage.objects to authenticated;grant usage,select on all sequences in schema storage to authenticated;
 insert into auth.users(id,email,email_confirmed_at,encrypted_password,raw_user_meta_data) values
 ('${root}','ecodexdao@gmail.com',now(),'password-hash','{}'),('${a}','a@example.com',now(),'password-hash','{}'),('${b}','b@example.com',now(),'password-hash','{"is_admin":true}');`);
    for (const file of [
      "001_private_collection.sql",
      "002_account_management.sql",
      "003_account_moderation.sql",
    ])
      await db.exec(
        await readFile(
          new URL(`../supabase/migrations/${file}`, import.meta.url),
          "utf8",
        ),
      );
    async function as(id: string) {
      await db.exec(
        `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false)`,
      );
    }
    await as(root);
    assert.equal(
      (
        await db.query<{ can_manage_accounts: boolean }>(
          "select public.can_manage_accounts()",
        )
      ).rows[0].can_manage_accounts,
      true,
    );
    assert.equal(
      (await db.query("select * from public.admin_list_accounts()")).rows
        .length,
      3,
    );
    await assert.rejects(
      db.query("select public.admin_set_account($1,$2,false)", [root, "admin"]),
    );
    await assert.rejects(
      db.query("select public.admin_set_account($1,$2,true)", [
        root,
        "contributor",
      ]),
    );
    await assert.rejects(
      db.query(
        "select public.admin_save_account_type('admin','Admin',false,false)",
      ),
    );
    await assert.rejects(
      db.query("select public.admin_delete_account_type('contributor')"),
    );
    await db.query("select public.admin_set_account($1,'admin',true)", [b]);
    await as(b);
    for (const operation of ["suspend", "ban", "delete"]) {
      await assert.rejects(db.query("select public.admin_moderate_account($1,$2)", [b, operation]));
      await assert.rejects(db.query("select public.admin_moderate_account($1,$2)", [root, operation]));
    }
    await as(root);
    await db.query("select public.admin_moderate_account($1,'suspend')", [b]);
    await db.query("select public.admin_set_account($1,'contributor',true)", [b]);
    await as(a);
    await assert.rejects(
      db.query("select * from public.admin_list_accounts()"),
    );
    await assert.rejects(
      db.query(
        "select public.admin_save_account_type('evil','Evil',true,true)",
      ),
    );
    await assert.rejects(
      db.query("update public.account_profiles set type_id='admin'"),
    );
    await assert.rejects(
      db.query("select public.admin_set_account($1,$2,true)", [a, "admin"]),
    );
    const dataset = JSON.stringify({
      profile: "A",
      consent: true,
      birds: [],
      photos: [{ id: "photo" }],
    });
    await db.query(
      "insert into public.contributor_datasets(owner_id,dataset) values($1,$2)",
      [a, dataset],
    );
    await db.query(
      "insert into storage.objects(bucket_id,name) values('guacabook-photos',$1)",
      [`${a}/photo`],
    );
    await as(b);
    assert.equal(
      (
        await db.query<{ can_manage_accounts: boolean }>(
          "select public.can_manage_accounts()",
        )
      ).rows[0].can_manage_accounts,
      false,
    );
    assert.equal(
      (await db.query("select * from public.contributor_datasets")).rows.length,
      0,
    );
    await as(root);
    await db.query(
      "select public.admin_save_account_type('scientist','Scientist',true,false)",
    );
    await db.query("select public.admin_set_account($1,'scientist',true)", [b]);
    await as(b);
    assert.equal(
      (await db.query("select * from public.contributor_datasets")).rows.length,
      1,
    );
    await assert.rejects(
      db.query("select * from public.admin_list_accounts()"),
    );
    await as(root);
    await assert.rejects(
      db.query("select public.admin_delete_account_type('scientist')"),
    );
    await db.query("select public.admin_set_account($1,'contributor',false)", [
      a,
    ]);
    await as(a);
    assert.equal(
      (await db.query("select * from public.contributor_datasets")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from storage.objects")).rows.length,
      0,
    );
    await assert.rejects(db.query("select public.submit_dataset(1)"));
    await assert.rejects(
      db.query(
        "insert into public.contributor_datasets(owner_id,dataset) values($1,$2)",
        [a, dataset],
      ),
    );
    await db.exec("reset role");
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at,encrypted_password,raw_user_meta_data) values($1,'spoof@example.com',now(),'hash','{\"is_admin\":true,\"role\":\"admin\"}')",
      [spoof],
    );
    await as(spoof);
    const profile = (
      await db.query<{
        my_account: { active: boolean; can_manage_accounts: boolean };
      }>("select public.my_account()")
    ).rows[0].my_account;
    assert.equal(profile.active, false);
    assert.equal(profile.can_manage_accounts, false);
    await assert.rejects(
      db.query("select * from public.admin_list_accounts()"),
    );
    await as(root);
    await db.query("select public.admin_set_account($1,'contributor',true)", [
      b,
    ]);
    await db.query("select public.admin_delete_account_type('scientist')");
    await assert.rejects(db.query("select public.admin_moderate_account($1,'ban')", [root]));
    await db.query("select public.admin_moderate_account($1,'ban')", [b]);
    await assert.rejects(db.query("select public.admin_set_account($1,'contributor',true)", [b]));
    await as(b);
    const bannedProfile = (await db.query<{ my_account: { active: boolean; banned: boolean } }>("select public.my_account()")).rows[0].my_account;
    assert.equal(bannedProfile.banned, true);
    assert.equal(bannedProfile.active, false);
    assert.equal((await db.query("select * from public.contributor_datasets")).rows.length, 0);
    await assert.rejects(db.query("select public.admin_moderate_account($1,'activate')", [b]));
    await as(root);
    await db.query("select public.admin_moderate_account($1,'unban')", [b]);
    assert.equal((await db.query<{ active: boolean }>("select active from public.admin_list_accounts() where account_id=$1", [b])).rows[0].active, false);
    await db.query("select public.admin_moderate_account($1,'activate')", [b]);
    await db.query("select public.admin_moderate_account($1,'delete')", [b]);
    await assert.rejects(db.query("select public.admin_moderate_account($1,'activate')", [b]));
    await assert.rejects(db.query("select public.admin_set_account($1,'contributor',true)", [b]));
    await as(b);
    assert.equal((await db.query("select * from storage.objects")).rows.length, 0);
    await assert.rejects(db.query("select public.submit_dataset(1)"));
    await db.exec("reset role;set role anon");
    await assert.rejects(db.query("select public.my_account()"));
  } finally {
    await db.close();
  }
});
function request(
  body: unknown,
  token = true,
  origin = "https://app.example.com",
) {
  return new Request("https://app.example.com/api/admin/invitations", {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer token" } : {}),
    },
    body: JSON.stringify(body),
  });
}
function dependencies({
  allowed = true,
  accounts = [] as unknown[],
  valid = true,
} = {}) {
  let privilegedCalls = 0;
  const calls: unknown[] = [];
  const client = {
    auth: {
      getUser: async () => ({
        data: { user: valid ? { id: root } : null },
        error: null,
      }),
    },
    rpc: async (name: string, args: unknown) => {
      calls.push([name, args]);
      return {
        error: null,
        data:
          name === "can_manage_accounts"
            ? allowed
            : name === "admin_list_accounts"
              ? accounts
              : name === "admin_list_account_types"
                ? [{ id: "contributor" }]
                : null,
      };
    },
  } as unknown as SupabaseClient;
  return {
    calls,
    get privilegedCalls() {
      return privilegedCalls;
    },
    publicClient: () => client,
    privilegedClient: () => {
      privilegedCalls++;
      return {
        auth: {
          admin: {
            inviteUserByEmail: async (email: string, options: unknown) => {
              calls.push({ email, options, delivery: "email" });
              return { data: { user: { id: a } }, error: null };
            },
            generateLink: async (input: unknown) => {
              calls.push(input);
              return {
                data: {
                  user: { id: a },
                  properties: {
                    action_link:
                      "https://auth.example.com/verify?token=secret-invite",
                  },
                },
                error: null,
              };
            },
          },
        },
      } as unknown as SupabaseClient;
    },
  };
}
test("API : les identifiants privilégiés ne sont jamais utilisés sans authentification et permission admin actuelles", async () => {
  for (const [req, dep, status] of [
    [request({}, false), dependencies(), 401],
    [request({}, true, "https://evil.example.com"), dependencies(), 403],
    [request({}, true), dependencies({ valid: false }), 401],
    [request({}, true), dependencies({ allowed: false }), 403],
  ] as const) {
    assert.equal((await handleInvitation(req, dep)).status, status);
    assert.equal(dep.privilegedCalls, 0);
  }
});
test("API : invitation ciblée, rôle activé côté serveur et redirection imposée à notre origine", async () => {
  const dep = dependencies();
  const result = await handleInvitation(
    request({
      action: "invite",
      email: "A@example.com",
      typeId: "contributor",
      redirectTo: "https://evil.example.com",
    }),
    dep,
  );
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.equal(dep.privilegedCalls, 1);
  assert.ok(
    dep.calls.some(
      (x: any) =>
        x.type === "invite" &&
        x.email === "a@example.com" &&
        x.options.redirectTo === "https://app.example.com/auth/invite",
    ),
  );
  assert.ok(
    dep.calls.some(
      (x: any) =>
        Array.isArray(x) &&
        x[0] === "admin_set_account" &&
        x[1].target_user === a &&
        x[1].new_type === "contributor",
    ),
  );
});
test("API : les comptes existants et la récupération du compte protégé par un autre admin sont refusés", async () => {
  const existing = dependencies({
    accounts: [{ account_id: a, email: "a@example.com", active: true }],
  });
  assert.equal(
    (
      await handleInvitation(
        request({
          action: "invite",
          email: "a@example.com",
          typeId: "contributor",
        }),
        existing,
      )
    ).status,
    409,
  );
  assert.equal(existing.privilegedCalls, 0);
  const protectedAccount = dependencies({
    accounts: [
      {
        account_id: a,
        email: "ecodexdao@gmail.com",
        active: true,
        protected: true,
      },
    ],
  });
  assert.equal(
    (
      await handleInvitation(
        request({ action: "reset", userId: a }),
        protectedAccount,
      )
    ).status,
    403,
  );
  assert.equal(protectedAccount.privilegedCalls, 0);
});

test("API : l’envoi par e-mail utilise Auth Admin et n’expose aucun lien dans la réponse", async () => {
  const dep = dependencies();
  const result = await handleInvitation(
    request({
      action: "invite",
      delivery: "email",
      email: "test@example.com",
      typeId: "contributor",
    }),
    dep,
  );
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { sent: true });
  assert.ok(
    dep.calls.some(
      (x: any) => x.delivery === "email" && x.email === "test@example.com",
    ),
  );
});
