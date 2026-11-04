-- V1 review decisions are separate from contributor-editable collection JSON.
begin;
create table public.annotation_reviews (
 owner_id uuid not null references auth.users(id) on delete cascade,
 dataset_revision bigint not null,
 annotation_id text not null,
 source_sha256 text not null check(source_sha256 ~ '^[0-9a-f]{64}$'),
 decision text not null check(decision in ('accepted','rejected')),
 reviewer_id uuid references auth.users(id) on delete set null,
 reviewed_at timestamptz not null default now(),
 primary key(owner_id,dataset_revision,annotation_id)
);
alter table public.annotation_reviews enable row level security;
revoke all on public.annotation_reviews from anon,authenticated;
grant select on public.annotation_reviews to authenticated;
create policy review_read on public.annotation_reviews for select to authenticated
using(public.is_active_account() and (owner_id=auth.uid() or public.is_research_admin()));
create function public.review_annotation(target_owner uuid,expected_revision bigint,target_annotation text,new_decision text,expected_sha256 text)
returns void language plpgsql security definer set search_path='' as $$
declare collection public.contributor_datasets;
begin
 if not public.is_research_admin() then raise exception 'Research reviewer required' using errcode='42501'; end if;
 if expected_sha256 is null or expected_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'Source hash required'; end if;
 if new_decision not in ('accepted','rejected') then raise exception 'Invalid decision'; end if;
 select * into collection from public.contributor_datasets where owner_id=target_owner for share;
 if not found or collection.revision<>expected_revision then raise exception 'Collection changed; reload before review'; end if;
 if (select count(*) from jsonb_array_elements(collection.dataset->'photos') p cross join lateral jsonb_array_elements(p->'boxes') b where b->>'id'=target_annotation)<>1 then raise exception 'Annotation identifiers must be unique'; end if;
 if not exists(select 1 from jsonb_array_elements(collection.dataset->'photos') p cross join lateral jsonb_array_elements(p->'boxes') b
  where b->>'id'=target_annotation and b->>'category'='periocular_region') then raise exception 'Unknown periocular annotation'; end if;
 insert into public.annotation_reviews(owner_id,dataset_revision,annotation_id,decision,reviewer_id,reviewed_at,source_sha256)
 values(target_owner,expected_revision,target_annotation,new_decision,auth.uid(),clock_timestamp(),expected_sha256)
 on conflict(owner_id,dataset_revision,annotation_id) do update set decision=excluded.decision,reviewer_id=excluded.reviewer_id,reviewed_at=excluded.reviewed_at,source_sha256=excluded.source_sha256;
end $$;
revoke all on function public.review_annotation(uuid,bigint,text,text,text) from public;
grant execute on function public.review_annotation(uuid,bigint,text,text,text) to authenticated;
commit;
