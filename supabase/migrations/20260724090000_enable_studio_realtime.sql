-- Abilita gli aggiornamenti in tempo reale senza modificare tabelle,
-- trigger, policy RLS, utenti o permessi esistenti.
do $$
declare
  table_name text;
  realtime_tables text[] := array[
    'contacts',
    'counterparties',
    'cases',
    'case_counterparties',
    'events',
    'case_activities',
    'case_titles',
    'hearing_updates',
    'invoices',
    'payments',
    'enforcement_actions',
    'audit_log',
    'profiles'
  ];
begin
  foreach table_name in array realtime_tables loop
    if exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = table_name
        and c.relkind = 'r'
    ) and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        table_name
      );
    end if;
  end loop;
end
$$;
