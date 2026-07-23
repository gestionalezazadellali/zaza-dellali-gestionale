-- Accesso con username, nickname modificabile e permessi granulari.
-- La migrazione conserva utenti, ruoli, policy, trigger e dati esistenti.

alter table public.profiles
  add column if not exists username text;

update public.profiles
set username = lower(
  regexp_replace(
    coalesce(nullif(split_part(email, '@', 1), ''), 'utente-' || left(id::text, 8)),
    '[^a-zA-Z0-9._-]+',
    '.',
    'g'
  )
)
where username is null or btrim(username) = '';

-- Evita collisioni tra eventuali omonimi già presenti prima della migrazione.
with duplicates as (
  select
    id,
    username,
    row_number() over (partition by lower(username) order by id) as position
  from public.profiles
)
update public.profiles p
set username = p.username || '-' || left(p.id::text, 6)
from duplicates d
where p.id = d.id and d.position > 1;

create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username))
  where username is not null;

alter table public.user_permissions
  add column if not exists can_manage_counterparties boolean not null default false,
  add column if not exists can_manage_case_activities boolean not null default false,
  add column if not exists can_manage_payments boolean not null default false,
  add column if not exists can_delete_clients boolean not null default false,
  add column if not exists can_delete_cases boolean not null default false,
  add column if not exists can_delete_counterparties boolean not null default false,
  add column if not exists can_delete_events boolean not null default false,
  add column if not exists can_restore_trash boolean not null default false,
  add column if not exists can_permanently_delete boolean not null default false,
  add column if not exists can_configure_backups boolean not null default false,
  add column if not exists can_run_backups boolean not null default false,
  add column if not exists can_restore_backups boolean not null default false,
  add column if not exists can_view_audit_log boolean not null default false;

-- L'amministratore esistente mantiene tutti i privilegi.
update public.user_permissions permissions
set
  can_manage_counterparties = true,
  can_manage_case_activities = true,
  can_manage_payments = true,
  can_delete_clients = true,
  can_delete_cases = true,
  can_delete_counterparties = true,
  can_delete_events = true,
  can_restore_trash = true,
  can_permanently_delete = true,
  can_configure_backups = true,
  can_run_backups = true,
  can_restore_backups = true,
  can_view_audit_log = true
from public.profiles profile
where profile.id = permissions.user_id
  and profile.role = 'admin';

-- Mantiene allineato il nickname usato nell'app con i metadati Auth.
create or replace function public.sync_profile_nickname_to_auth_metadata()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if new.display_name is distinct from old.display_name then
    update auth.users
    set raw_user_meta_data =
      coalesce(raw_user_meta_data, '{}'::jsonb) ||
      jsonb_build_object('display_name', new.display_name)
    where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_sync_nickname_to_auth on public.profiles;
create trigger profiles_sync_nickname_to_auth
after update of display_name on public.profiles
for each row
execute function public.sync_profile_nickname_to_auth_metadata();

create or replace function public.current_user_has_permission(permission_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles profile
    left join public.user_permissions permissions
      on permissions.user_id = profile.id
    where profile.id = auth.uid()
      and profile.active
      and profile.deleted_at is null
      and (
        profile.role = 'admin'
        or coalesce((to_jsonb(permissions) ->> permission_name)::boolean, false)
      )
  );
$$;

grant execute on function public.current_user_has_permission(text)
  to authenticated;

drop policy if exists backup_settings_permission_access
  on public.backup_settings;
create policy backup_settings_permission_access
  on public.backup_settings
  for all
  to authenticated
  using (
    public.current_user_has_permission('can_configure_backups')
    or public.current_user_has_permission('can_run_backups')
    or public.current_user_has_permission('can_restore_backups')
  )
  with check (
    public.current_user_has_permission('can_configure_backups')
    or public.current_user_has_permission('can_run_backups')
    or public.current_user_has_permission('can_restore_backups')
  );

drop policy if exists backup_runs_permission_access
  on public.backup_runs;
create policy backup_runs_permission_access
  on public.backup_runs
  for all
  to authenticated
  using (
    public.current_user_has_permission('can_run_backups')
    or public.current_user_has_permission('can_restore_backups')
  )
  with check (
    public.current_user_has_permission('can_run_backups')
    or public.current_user_has_permission('can_restore_backups')
  );

drop policy if exists audit_log_permission_select
  on public.audit_log;
create policy audit_log_permission_select
  on public.audit_log
  for select
  to authenticated
  using (public.current_user_has_permission('can_view_audit_log'));

-- Verifica finale: mostra lo username assegnato all'amministratore esistente.
select
  username,
  display_name as nickname,
  email as email_contatto,
  role
from public.profiles
where role = 'admin'
  and deleted_at is null
order by display_name;
