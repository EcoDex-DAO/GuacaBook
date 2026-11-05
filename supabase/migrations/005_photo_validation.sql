-- Review whole photos independently from contributor-controlled annotation JSON.
begin;
update public.account_types set label='Vérificateur' where id='reviewer' and builtin;
create table public.photo_reviews (
 owner_id uuid not null references auth.users(id) on delete cascade,
 photo_id text not null,
 dataset_revision bigint not null,
 photo_snapshot jsonb not null,
 birds_snapshot jsonb not null,
 source_sha256 text not null check(source_sha256 ~ '^[0-9a-f]{64}$'),
 decision text not null check(decision in ('accepted','rejected')),
 reviewer_id uuid references auth.users(id) on delete set null,
 reviewed_at timestamptz not null default now(),
 check(reviewer_id is null or reviewer_id<>owner_id),
 primary key(owner_id,photo_id)
);
alter table public.photo_reviews enable row level security;
revoke all on public.photo_reviews from anon,authenticated;
grant select on public.photo_reviews to authenticated;
create policy photo_review_read on public.photo_reviews for select to authenticated
 using(public.is_active_account() and (owner_id=auth.uid() or public.is_research_admin()));
create function public.review_photo(target_owner uuid,expected_revision bigint,target_photo text,new_decision text,expected_sha256 text)
returns void language plpgsql security definer set search_path='' as $$
declare collection public.contributor_datasets; photo jsonb; birds jsonb;
begin
 if not public.is_research_admin() or target_owner=auth.uid() then raise exception 'Independent reviewer required' using errcode='42501'; end if;
 if new_decision is null or new_decision not in ('accepted','rejected') then raise exception 'Invalid decision'; end if;
 if expected_sha256 is null or expected_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'Source hash required'; end if;
 select * into collection from public.contributor_datasets where owner_id=target_owner for share;
 if not found or collection.revision<>expected_revision then raise exception 'Collection changed; reload before review'; end if;
 if (select count(*) from jsonb_array_elements(collection.dataset->'photos') p where p->>'id'=target_photo)<>1 then raise exception 'Unknown or duplicate photo'; end if;
 select p into photo from jsonb_array_elements(collection.dataset->'photos') p where p->>'id'=target_photo;
 if new_decision='accepted' and (collection.dataset->>'consent') is distinct from 'true' then raise exception 'Research consent required'; end if;
 if new_decision='accepted' and (photo->>'completed') is distinct from 'true' then raise exception 'Finish annotations before approval'; end if;
 select coalesce(jsonb_agg(b order by b->>'id'),'[]'::jsonb) into birds from jsonb_array_elements(collection.dataset->'birds') b
 where b->>'id'=photo->>'birdId' or exists(select 1 from jsonb_array_elements(photo->'boxes') box where box->>'birdId'=b->>'id');
 insert into public.photo_reviews(owner_id,photo_id,dataset_revision,photo_snapshot,birds_snapshot,source_sha256,decision,reviewer_id,reviewed_at)
 values(target_owner,target_photo,expected_revision,photo-'name'-'objectPath'-'mimeType',birds,expected_sha256,new_decision,auth.uid(),clock_timestamp())
 on conflict(owner_id,photo_id) do update set dataset_revision=excluded.dataset_revision,photo_snapshot=excluded.photo_snapshot,birds_snapshot=excluded.birds_snapshot,
 source_sha256=excluded.source_sha256,decision=excluded.decision,reviewer_id=excluded.reviewer_id,reviewed_at=excluded.reviewed_at;
 -- Reviewing a whole photo also reviews its region annotations atomically.
 insert into public.annotation_reviews(owner_id,dataset_revision,annotation_id,source_sha256,decision,reviewer_id,reviewed_at)
 select target_owner,expected_revision,b->>'id',expected_sha256,new_decision,auth.uid(),clock_timestamp()
 from jsonb_array_elements(photo->'boxes') b where b->>'category'='periocular_region'
 on conflict(owner_id,dataset_revision,annotation_id) do update set source_sha256=excluded.source_sha256,decision=excluded.decision,reviewer_id=excluded.reviewer_id,reviewed_at=excluded.reviewed_at;
end $$;
revoke all on function public.review_photo(uuid,bigint,text,text,text) from public;
grant execute on function public.review_photo(uuid,bigint,text,text,text) to authenticated;
commit;
