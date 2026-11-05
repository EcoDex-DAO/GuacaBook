import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
const owner='11111111-1111-4111-8111-111111111111',reviewer='22222222-2222-4222-8222-222222222222',admin='33333333-3333-4333-8333-333333333333';
test('PostgreSQL: independent photo approvals, contributor isolation, stale revisions and suspended reviewers',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create table auth.users(id uuid primary key,email text,created_at timestamptz default now(),email_confirmed_at timestamptz default now(),encrypted_password text,raw_user_meta_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id bigint generated always as identity,bucket_id text,name text);
 create function storage.foldername(text) returns text[] language sql immutable as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;
 alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,update,delete on storage.objects to authenticated;
 insert into auth.users(id,email,encrypted_password,raw_user_meta_data) values('${owner}','a@example.com','hash','{}'),('${reviewer}','b@example.com','hash','{}'),('${admin}','ecodexdao@gmail.com','hash','{}');`);
 for(const file of ['001_private_collection.sql','002_account_management.sql','003_account_moderation.sql','004_annotation_reviews.sql','005_photo_validation.sql'])await db.exec(await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8'));
 const as=async(id:string)=>db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false)`);
 await as(admin);await db.query('select public.admin_set_account($1,$2,true)',[reviewer,'reviewer']);
 await as(owner);await db.query('insert into public.contributor_datasets(owner_id,dataset) values($1,$2)',[owner,JSON.stringify({profile:'A',consent:true,birds:[],photos:[{id:'p',completed:true,boxes:[{id:'region',category:'periocular_region',birdId:''}]},{id:'draft',completed:false,boxes:[]}]})]);
 const call=()=>db.query('select public.review_photo($1,1,$2,$3,$4)',[owner,'p','accepted','a'.repeat(64)]);
 await assert.rejects(call());await assert.rejects(db.query("insert into public.photo_reviews(owner_id,photo_id) values($1,'p')",[owner]));
 await as(reviewer);assert.equal((await db.query('select * from public.contributor_datasets')).rows.length,1);
 await call();assert.equal((await db.query('select * from public.photo_reviews')).rows.length,1);assert.equal((await db.query('select * from public.annotation_reviews')).rows.length,1);
 await assert.rejects(db.query('select public.review_photo($1,2,$2,$3,$4)',[owner,'p','accepted','a'.repeat(64)]));
 await assert.rejects(db.query('select public.review_photo($1,1,$2,$3,$4)',[reviewer,'p','accepted','a'.repeat(64)]));
 await assert.rejects(db.query('select public.review_photo($1,1,$2,$3,$4)',[owner,'draft','accepted','a'.repeat(64)]));
 assert.equal((await db.query('update public.contributor_datasets set revision=revision+1 where owner_id=$1 returning owner_id',[owner])).rows.length,0);
 await as(owner);assert.equal((await db.query('select * from public.photo_reviews')).rows.length,1);
 await assert.rejects(db.query("update public.photo_reviews set decision='accepted'"));
 await as(admin);await db.query('select public.admin_set_account($1,$2,false)',[reviewer,'reviewer']);
 await as(reviewer);await assert.rejects(call());assert.equal((await db.query('select * from public.photo_reviews')).rows.length,0);
 }finally{await db.close();}
});
