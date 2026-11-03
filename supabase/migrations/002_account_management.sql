-- Requires migration 001. Run once, after creating and confirming ecodexdao@gmail.com in Authentication.
begin;
create table public.account_types (
 id text primary key check(id ~ '^[a-z][a-z0-9_-]{2,60}$'),
 label text not null check(length(trim(label)) between 1 and 80),
 can_review_data boolean not null default false,
 can_manage_accounts boolean not null default false,
 builtin boolean not null default false,
 check(not can_manage_accounts or can_review_data)
);
insert into public.account_types values
 ('admin','Administrateur',true,true,true),
 ('contributor','Contributeur',false,false,true),
 ('reviewer','Réviseur',true,false,true);
create table public.account_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 type_id text not null references public.account_types(id) default 'contributor',
 active boolean not null default false,
 protected boolean not null default false
);
alter table public.account_types enable row level security;
alter table public.account_profiles enable row level security;
revoke all on public.account_types,public.account_profiles from anon,authenticated;
-- Preserve existing accounts and existing project administrators.
insert into public.account_profiles(user_id,type_id,active)
select u.id,case when exists(select 1 from public.research_admins r where r.user_id=u.id) then 'admin' else 'contributor' end,true from auth.users u;
-- Pin the initial administrator by verified Auth UUID, never by editable client metadata.
do $$ declare root_id uuid; begin
 select id into root_id from auth.users where lower(email)='ecodexdao@gmail.com' and email_confirmed_at is not null;
 if root_id is null then raise exception 'Create and confirm ecodexdao@gmail.com in Supabase Authentication before running migration 002'; end if;
 update public.account_profiles set type_id='admin',active=true,protected=true where user_id=root_id;
end $$;
create function public.provision_account_profile() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 -- Public signups, including forged user_metadata, never grant access or permissions.
 insert into public.account_profiles(user_id) values(new.id) on conflict do nothing;
 return new;
end $$;
revoke all on function public.provision_account_profile() from public;
create trigger guacabook_account_created after insert on auth.users for each row execute function public.provision_account_profile();
create function public.is_active_account() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.account_profiles p where p.user_id=auth.uid() and p.active);
$$;
create function public.can_manage_accounts() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.account_profiles p join public.account_types t on t.id=p.type_id where p.user_id=auth.uid() and p.active and t.can_manage_accounts);
$$;
create or replace function public.is_research_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.account_profiles p join public.account_types t on t.id=p.type_id where p.user_id=auth.uid() and p.active and t.can_review_data);
$$;
revoke all on function public.is_active_account(),public.can_manage_accounts() from public;
grant execute on function public.is_active_account(),public.can_manage_accounts() to authenticated;
create function public.my_account() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('user_id',p.user_id,'type_id',p.type_id,'label',t.label,'active',p.active,'protected',p.protected,
 'can_manage_accounts',t.can_manage_accounts and p.active,'can_review_data',t.can_review_data and p.active,
 'has_password',coalesce(u.encrypted_password,'')<>'')
 from public.account_profiles p join public.account_types t on t.id=p.type_id join auth.users u on u.id=p.user_id where p.user_id=auth.uid();
$$;
revoke all on function public.my_account() from public;
grant execute on function public.my_account() to authenticated;
create function public.require_account_manager() returns void language plpgsql security definer set search_path='' as $$
begin if not public.can_manage_accounts() then raise exception 'Administrator required' using errcode='42501'; end if; end $$;
revoke all on function public.require_account_manager() from public;
create function public.admin_list_accounts() returns table(account_id uuid,email text,type_id text,active boolean,protected boolean,created_at timestamptz,email_confirmed_at timestamptz,has_password boolean)
language plpgsql security definer set search_path='' as $$
begin
 perform public.require_account_manager();
 return query select p.user_id,u.email::text,p.type_id,p.active,p.protected,u.created_at,u.email_confirmed_at,coalesce(u.encrypted_password,'')<>'' from public.account_profiles p join auth.users u on u.id=p.user_id order by u.created_at desc;
end $$;
create function public.admin_list_account_types() returns setof public.account_types language plpgsql security definer set search_path='' as $$
begin perform public.require_account_manager(); return query select * from public.account_types order by id; end $$;
create function public.admin_set_account(target_user uuid,new_type text,new_active boolean) returns void language plpgsql security definer set search_path='' as $$
declare target public.account_profiles;
begin
 perform public.require_account_manager();
 select * into target from public.account_profiles where user_id=target_user for update;
 if not found then raise exception 'Unknown account'; end if;
 if target.protected and (new_type<>'admin' or not new_active) then raise exception 'Protected administrator'; end if;
 if target_user=auth.uid() and (not new_active or not exists(select 1 from public.account_types where id=new_type and can_manage_accounts)) then raise exception 'Cannot remove your own administrative access'; end if;
 update public.account_profiles set type_id=new_type,active=new_active where user_id=target_user;
end $$;
create function public.admin_save_account_type(type_key text,type_label text,review_data boolean,manage_accounts boolean) returns void language plpgsql security definer set search_path='' as $$
declare current_type public.account_types;
begin
 perform public.require_account_manager();
 select * into current_type from public.account_types where id=type_key for update;
 if found and not manage_accounts and exists(select 1 from public.account_profiles where user_id=auth.uid() and type_id=type_key) then raise exception 'Cannot remove your own administrative access'; end if;
 if found and current_type.builtin and (current_type.can_review_data<>review_data or current_type.can_manage_accounts<>manage_accounts) then raise exception 'Built-in permissions are fixed'; end if;
 insert into public.account_types(id,label,can_review_data,can_manage_accounts) values(type_key,trim(type_label),review_data,manage_accounts)
 on conflict(id) do update set label=excluded.label,can_review_data=excluded.can_review_data,can_manage_accounts=excluded.can_manage_accounts;
end $$;
create function public.admin_delete_account_type(type_key text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.require_account_manager();
 if exists(select 1 from public.account_types where id=type_key and builtin) then raise exception 'Built-in type cannot be deleted'; end if;
 delete from public.account_types where id=type_key; -- FK rejects assigned types.
end $$;
revoke all on function public.admin_list_accounts(),public.admin_list_account_types(),public.admin_set_account(uuid,text,boolean),public.admin_save_account_type(text,text,boolean,boolean),public.admin_delete_account_type(text) from public;
grant execute on function public.admin_list_accounts(),public.admin_list_account_types(),public.admin_set_account(uuid,text,boolean),public.admin_save_account_type(text,text,boolean,boolean),public.admin_delete_account_type(text) to authenticated;
-- Suspension also applies to existing JWTs, database writes and private files.
drop policy dataset_read on public.contributor_datasets;
drop policy dataset_insert on public.contributor_datasets;
drop policy dataset_update on public.contributor_datasets;
create policy dataset_read on public.contributor_datasets for select to authenticated using(public.is_active_account() and (owner_id=auth.uid() or public.is_research_admin()));
create policy dataset_insert on public.contributor_datasets for insert to authenticated with check(public.is_active_account() and owner_id=auth.uid() and revision=1);
create policy dataset_update on public.contributor_datasets for update to authenticated using(public.is_active_account() and owner_id=auth.uid()) with check(public.is_active_account() and owner_id=auth.uid());
drop policy guacabook_photo_read on storage.objects;
drop policy guacabook_photo_insert on storage.objects;
drop policy guacabook_photo_delete on storage.objects;
create policy guacabook_photo_read on storage.objects for select to authenticated using(bucket_id='guacabook-photos' and public.is_active_account() and ((storage.foldername(name))[1]=auth.uid()::text or public.is_research_admin()));
create policy guacabook_photo_insert on storage.objects for insert to authenticated with check(bucket_id='guacabook-photos' and public.is_active_account() and (storage.foldername(name))[1]=auth.uid()::text);
create policy guacabook_photo_delete on storage.objects for delete to authenticated using(bucket_id='guacabook-photos' and public.is_active_account() and (storage.foldername(name))[1]=auth.uid()::text);
create or replace function public.submit_dataset(expected_revision bigint) returns bigint language plpgsql security definer set search_path='' as $$
declare result bigint;
begin
 update public.contributor_datasets set revision=revision+1,status='submitted',submitted_at=clock_timestamp(),consented_at=clock_timestamp(),consent_version='guacabook-photo-v1',license='CC BY 4.0'
 where owner_id=auth.uid() and public.is_active_account() and revision=expected_revision and dataset->>'consent'='true' and jsonb_array_length(dataset->'photos')>0 returning revision into result;
 if result is null then raise exception 'Inactive account, consent missing or revision conflict'; end if;
 return result;
end $$;
commit;
