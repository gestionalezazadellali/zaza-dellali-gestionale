alter table public.contacts
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid,
  add column if not exists delete_reason text;

create index if not exists contacts_studio_deleted_at_idx
  on public.contacts (studio_id, deleted_at);

create or replace function public.enforce_contact_soft_delete_permission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.deleted_at is distinct from new.deleted_at
    and auth.uid() is not null
    and not exists (
      select 1
      from public.user_permissions
      where user_id = auth.uid()
        and can_edit_clients = true
    )
  then
    raise exception 'Non disponi del permesso per eliminare o ripristinare i clienti.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists contacts_soft_delete_permission on public.contacts;

create trigger contacts_soft_delete_permission
before update of deleted_at on public.contacts
for each row
execute function public.enforce_contact_soft_delete_permission();
