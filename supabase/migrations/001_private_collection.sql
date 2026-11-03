-- Run once in Supabase SQL Editor. No service-role key is used by the application.
begin;
create table public.research_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.research_admins enable row level security;
revoke all on public.research_admins from anon, authenticated;

create function public.is_research_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.research_admins where user_id = auth.uid());
$$;
revoke all on function public.is_research_admin() from public;
grant execute on function public.is_research_admin() to authenticated;

create table public.contributor_datasets (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  dataset jsonb not null check(jsonb_typeof(dataset)='object' and dataset ? 'photos' and dataset ? 'birds' and dataset ? 'profile' and dataset ? 'consent' and jsonb_typeof(dataset->'profile')='string' and jsonb_typeof(dataset->'consent')='boolean' and jsonb_typeof(dataset->'photos')='array' and jsonb_typeof(dataset->'birds')='array'),
  revision bigint not null default 1 check(revision>0),
  status text not null default 'draft' check(status in ('draft','submitted')),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  consented_at timestamptz,
  consent_version text,
  license text
);
alter table public.contributor_datasets enable row level security;
revoke all on public.contributor_datasets from anon, authenticated;
grant select on public.contributor_datasets to authenticated;
grant insert(owner_id,dataset,revision) on public.contributor_datasets to authenticated;
grant update(dataset,revision) on public.contributor_datasets to authenticated;
create policy dataset_read on public.contributor_datasets for select to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_research_admin()));
create policy dataset_insert on public.contributor_datasets for insert to authenticated
  with check(owner_id = (select auth.uid()) and revision=1);
create policy dataset_update on public.contributor_datasets for update to authenticated
  using(owner_id = (select auth.uid())) with check(owner_id = (select auth.uid()));

create function public.check_dataset_revision() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.owner_id <> old.owner_id or new.revision <> old.revision + 1 then
    raise exception 'Invalid owner or revision';
  end if;
  new.updated_at := clock_timestamp();
  if new.dataset is distinct from old.dataset then
    new.status := 'draft';
    new.submitted_at := null;
    new.consented_at := null;
    new.consent_version := null;
    new.license := null;
  end if;
  return new;
end;
$$;
create trigger dataset_revision before update on public.contributor_datasets
for each row execute function public.check_dataset_revision();

-- Consent timestamp, license and status are written by the server, not arbitrary client fields.
create function public.submit_dataset(expected_revision bigint) returns bigint
language plpgsql security definer set search_path = '' as $$
declare result bigint;
begin
  update public.contributor_datasets
  set revision=revision+1, status='submitted', submitted_at=clock_timestamp(),
      consented_at=clock_timestamp(), consent_version='guacabook-photo-v1', license='CC BY 4.0'
  where owner_id=auth.uid() and revision=expected_revision
    and dataset->>'consent'='true' and jsonb_array_length(dataset->'photos')>0
  returning revision into result;
  if result is null then raise exception 'Consent required, empty dataset or revision conflict'; end if;
  return result;
end;
$$;
revoke all on function public.submit_dataset(bigint) from public;
grant execute on function public.submit_dataset(bigint) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('guacabook-photos','guacabook-photos',false,15728640,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy guacabook_photo_read on storage.objects for select to authenticated
using(bucket_id='guacabook-photos' and ((storage.foldername(name))[1]=(select auth.uid())::text or (select public.is_research_admin())));
create policy guacabook_photo_insert on storage.objects for insert to authenticated
with check(bucket_id='guacabook-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
-- Objects are immutable; no UPDATE/upsert policy, including for administrators.
create policy guacabook_photo_delete on storage.objects for delete to authenticated
using(bucket_id='guacabook-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
commit;
