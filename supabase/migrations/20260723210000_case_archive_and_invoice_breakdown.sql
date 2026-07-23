begin;

alter table public.cases
  add column if not exists archive_box_number text,
  add column if not exists archive_year integer;

alter table public.invoices
  add column if not exists general_expenses_amount numeric(12,2) not null default 0,
  add column if not exists cpa_amount numeric(12,2) not null default 0,
  add column if not exists vat_enabled boolean not null default true,
  add column if not exists exempt_expenses_amount numeric(12,2) not null default 0,
  add column if not exists withholding_enabled boolean not null default true,
  add column if not exists withholding_amount numeric(12,2) not null default 0;

commit;
