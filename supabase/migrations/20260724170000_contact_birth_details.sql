begin;

alter table public.contacts
  add column if not exists birth_place text,
  add column if not exists birth_date date;

commit;
