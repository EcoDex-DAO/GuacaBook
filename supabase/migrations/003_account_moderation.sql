-- Run after 001 and 002 in the Supabase SQL editor.
begin;
alter table public.account_profiles
  add column banned boolean not null default false,
  add column deletion_pending boolean not null default false;

create or replace function public.is_active_account() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.account_profiles p where p.user_id=auth.uid() and p.active and not p.banned and not p.deletion_pending);
$$;
create or replace function public.can_manage_accounts() returns boolean language sql stable security definer set search_path='' as $$
 select public.is_active_account() and exists(select 1 from public.account_profiles p join public.account_types t on t.id=p.type_id where p.user_id=auth.uid() and t.can_manage_accounts);
$$;
create or replace function public.is_research_admin() returns boolean language sql stable security definer set search_path='' as $$
 select public.is_active_account() and exists(select 1 from public.account_profiles p join public.account_types t on t.id=p.type_id where p.user_id=auth.uid() and t.can_review_data);
$$;
create or replace function public.my_account() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('user_id',p.user_id,'type_id',p.type_id,'label',t.label,
 'active',public.is_active_account(),'protected',p.protected,'banned',p.banned,'deletion_pending',p.deletion_pending,
 'can_manage_accounts',t.can_manage_accounts and public.is_active_account(),
 'can_review_data',t.can_review_data and public.is_active_account(),
 'has_password',coalesce(u.encrypted_password,'')<>'')
 from public.account_profiles p join public.account_types t on t.id=p.type_id join auth.users u on u.id=p.user_id where p.user_id=auth.uid();
$$;
drop function public.admin_list_accounts();
create function public.admin_list_accounts() returns table(account_id uuid,email text,type_id text,active boolean,protected boolean,created_at timestamptz,email_confirmed_at timestamptz,has_password boolean,banned boolean,deletion_pending boolean)
language plpgsql security definer set search_path='' as $$
begin
 perform public.require_account_manager();
 return query select p.user_id,u.email::text,p.type_id,p.active,p.protected,u.created_at,u.email_confirmed_at,coalesce(u.encrypted_password,'')<>'',p.banned,p.deletion_pending
 from public.account_profiles p join auth.users u on u.id=p.user_id order by u.created_at desc;
end $$;
revoke all on function public.admin_list_accounts() from public;
grant execute on function public.admin_list_accounts() to authenticated;

create or replace function public.admin_set_account(target_user uuid,new_type text,new_active boolean) returns void language plpgsql security definer set search_path='' as $$
declare target public.account_profiles;
begin
 perform public.require_account_manager();
 select * into target from public.account_profiles where user_id=target_user for update;
 if not found then raise exception 'Unknown account'; end if;
 if target.protected and (new_type<>'admin' or not new_active) then raise exception 'Protected administrator'; end if;
 if target.banned or target.deletion_pending then raise exception 'Account is banned or being deleted'; end if;
 if target_user=auth.uid() and (not new_active or not exists(select 1 from public.account_types where id=new_type and can_manage_accounts)) then raise exception 'Cannot remove your own administrative access'; end if;
 update public.account_profiles set type_id=new_type,active=new_active where user_id=target_user;
end $$;

-- This RPC blocks existing JWTs before any privileged Auth/Storage operations.
create function public.admin_moderate_account(target_user uuid,operation text) returns void language plpgsql security definer set search_path='' as $$
declare target public.account_profiles;
begin
 perform public.require_account_manager();
 if operation not in ('suspend','activate','ban','unban','delete') then raise exception 'Unknown operation'; end if;
 select * into target from public.account_profiles where user_id=target_user for update;
 if not found then raise exception 'Unknown account'; end if;
 if target.protected or target_user=auth.uid() then raise exception 'Protected account or own account'; end if;
 if target.deletion_pending and operation<>'delete' then raise exception 'Deletion must be completed'; end if;
 if operation='suspend' then
   update public.account_profiles set active=false where user_id=target_user;
 elsif operation='activate' then
   if target.banned then raise exception 'Unban account first'; end if;
   update public.account_profiles set active=true where user_id=target_user;
 elsif operation='ban' then
   update public.account_profiles set active=false,banned=true where user_id=target_user;
 elsif operation='unban' then
   update public.account_profiles set active=false,banned=false where user_id=target_user;
 else
   update public.account_profiles set active=false,deletion_pending=true where user_id=target_user;
 end if;
end $$;
revoke all on function public.admin_moderate_account(uuid,text) from public;
grant execute on function public.admin_moderate_account(uuid,text) to authenticated;
commit;
