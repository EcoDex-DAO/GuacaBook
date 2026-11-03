import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { objectPath, prepareCloudDataset } from "../lib/cloud";
import { emptyDataset } from "../lib/dataset";
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222",
  admin = "33333333-3333-4333-8333-333333333333";
test("PostgreSQL : isolation réelle des lignes, stockage privé, privilèges et consentement serveur", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated;
 create schema auth; create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id bigint generated always as identity,bucket_id text,name text);
 create function storage.foldername(text) returns text[] language sql immutable as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;
 alter table storage.objects enable row level security;
 grant usage on schema storage to authenticated;grant select,insert,update,delete on storage.objects to authenticated;grant usage,select on all sequences in schema storage to authenticated;
 insert into auth.users values('${a}'),('${b}'),('${admin}');`);
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/001_private_collection.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(`insert into public.research_admins values('${admin}');`);
    async function as(id: string) {
      await db.exec(
        `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`,
      );
    }
    const dataset = JSON.stringify({
      profile: "A",
      birds: [],
      photos: [{ id: "photo" }],
      consent: true,
    });
    await as(a);
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
      (await db.query("select * from public.contributor_datasets")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from storage.objects")).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          "update public.contributor_datasets set revision=revision+1 where owner_id=$1 returning owner_id",
          [a],
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.query(
        "insert into public.contributor_datasets(owner_id,dataset) values($1,$2)",
        [a, dataset],
      ),
    );
    await assert.rejects(
      db.query(
        "insert into storage.objects(bucket_id,name) values('guacabook-photos',$1)",
        [`${a}/forged`],
      ),
    );
    await assert.rejects(
      db.query("insert into public.research_admins values($1)", [b]),
    );
    await db.query(
      "insert into public.contributor_datasets(owner_id,dataset) values($1,$2)",
      [
        b,
        JSON.stringify({ profile: "B", birds: [], photos: [], consent: false }),
      ],
    );
    await db.query(
      "insert into storage.objects(bucket_id,name) values('guacabook-photos',$1)",
      [`${b}/photo`],
    );
    await assert.rejects(db.query("select public.submit_dataset(1)"));
    await assert.rejects(
      db.query(
        "update public.contributor_datasets set dataset=jsonb_set(dataset,'{profile}','{}'),revision=2",
      ),
    );
    await as(a);
    await assert.rejects(
      db.query("update public.contributor_datasets set status='submitted'"),
    );
    await assert.rejects(
      db.query("update public.contributor_datasets set revision=5"),
    );
    const submitted = await db.query<{ submit_dataset: number }>(
      "select public.submit_dataset(1)",
    );
    assert.equal(Number(submitted.rows[0].submit_dataset), 2);
    const row = (
      await db.query<{
        license: string;
        consented_at: string;
        consent_version: string;
      }>("select * from public.contributor_datasets")
    ).rows[0];
    assert.equal(row.license, "CC BY 4.0");
    assert.ok(row.consented_at);
    assert.equal(row.consent_version, "guacabook-photo-v1");
    await assert.rejects(db.query("select public.submit_dataset(1)"));
    await db.query(
      "update public.contributor_datasets set dataset=jsonb_set(dataset,'{consent}','false'),revision=3",
    );
    assert.equal(
      (
        await db.query<{ status: string }>(
          "select status from public.contributor_datasets",
        )
      ).rows[0].status,
      "draft",
    );
    await assert.rejects(db.query("select public.submit_dataset(3)"));
    await as(admin);
    assert.equal(
      (await db.query("select * from public.contributor_datasets")).rows.length,
      2,
    );
    assert.equal(
      (await db.query("select * from storage.objects")).rows.length,
      2,
    );
    assert.equal(
      (
        await db.query(
          "update public.contributor_datasets set revision=revision+1 returning owner_id",
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (await db.query("delete from storage.objects returning name")).rows
        .length,
      0,
    );
    await db.exec("reset role;set role anon;");
    await assert.rejects(db.query("select * from public.contributor_datasets"));
  } finally {
    await db.close();
  }
});
test("la sérialisation ne stocke aucun Blob et bloque les chemins et fichiers non acceptés", () => {
  const photo = {
    id: b,
    name: "test.png",
    blob: new Blob(["test"], { type: "image/png" }),
    width: 1,
    height: 1,
    capturedAt: "",
    sessionId: "",
    boxes: [],
    quality: "unreviewed" as const,
  };
  const out = prepareCloudDataset({ ...emptyDataset, photos: [photo] }, a);
  assert.equal(out.photos[0].objectPath, `${a}/${b}`);
  assert.equal("blob" in out.photos[0], false);
  assert.throws(() => objectPath(a, "../secret"));
  assert.throws(() =>
    prepareCloudDataset(
      {
        ...emptyDataset,
        photos: [{ ...photo, blob: new Blob(["x"], { type: "text/html" }) }],
      },
      a,
    ),
  );
});

test("le chargement distant neutralise les chemins de noms de fichier pour les exports", async () => {
  const { loadCloudDataset } = await import("../lib/cloud");
  const client = {
    storage: {
      from: () => ({
        download: async () => ({
          data: new Blob(["x"], { type: "image/png" }),
          error: null,
        }),
      }),
    },
  } as unknown as import("@supabase/supabase-js").SupabaseClient;
  const row = {
    owner_id: a,
    revision: 1,
    status: "draft",
    updated_at: "",
    consented_at: null,
    dataset: {
      ...emptyDataset,
      photos: [
        {
          id: b,
          objectPath: `${a}/${b}`,
          mimeType: "image/png",
          name: "../../escape.png",
          width: 1,
          height: 1,
          boxes: [],
          capturedAt: "",
          sessionId: "",
          quality: "unreviewed",
        },
      ],
    },
  } as import("../lib/cloud").CloudRow;
  const loaded = await loadCloudDataset(client, row);
  assert.equal(loaded.photos[0].name.includes("/"), false);
});
