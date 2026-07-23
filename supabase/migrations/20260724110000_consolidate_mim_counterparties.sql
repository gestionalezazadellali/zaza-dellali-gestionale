-- Consolida sotto un'unica controparte tutte le denominazioni riconducibili
-- al Ministero dell'Istruzione e all'amministrazione scolastica.
-- Lo script è atomico: un errore annulla l'intera operazione.

begin;

create temporary table _mim_context (
  studio_id uuid not null,
  canonical_id bigint not null,
  canonical_name text not null
) on commit drop;

insert into _mim_context (studio_id, canonical_id, canonical_name)
select
  studio_id,
  id,
  'M.I.M. - MINISTERO DELL''ISTRUZIONE E DEL MERITO'
from public.counterparties
where id = 6
  and studio_id = '3c02b261-ba03-4dd9-b098-5c70b6348d2c'::uuid;

do $$
begin
  if (select count(*) from _mim_context) <> 1 then
    raise exception
      'Controparte MIM ufficiale non trovata: operazione annullata.';
  end if;
end
$$;

create temporary table _mim_targets (
  counterparty_id bigint primary key
) on commit drop;

insert into _mim_targets (counterparty_id)
select current_counterparty.id
from public.counterparties as current_counterparty
cross join _mim_context as current_context
where current_counterparty.studio_id = current_context.studio_id
  and (
    current_counterparty.id = current_context.canonical_id
    or concat_ws(
      ' ',
      current_counterparty.name,
      current_counterparty.display_name,
      current_counterparty.normalized_name,
      current_counterparty.organization
    ) ~* (
      'minister.{0,40}istru'
      || '|(^|[^a-z])(miur|mim)([^a-z]|$)'
      || '|uffici.{0,25}scolastic'
      || '|(^|[^a-z])(usr|usp|ust)([^a-z]|$)'
      || '|ambit.{0,20}territorial'
      || '|provveditorat.{0,20}studi'
      || '|istituzion.{0,15}scolastic'
      || '|istituto.{0,20}(comprensivo|scolastico|statale|superiore|tecnico|professionale|magistrale|istruzione)'
      || '|(^|[^a-z])(scuol|liceo|convitto|educandato)([^a-z]|$)'
      || '|circol.{0,15}didattic'
      || '|direzion.{0,15}didattic'
      || '|dipartiment.{0,30}sistema educativo'
    )
  )
  and concat_ws(
    ' ',
    current_counterparty.name,
    current_counterparty.display_name,
    current_counterparty.normalized_name
  ) !~* 'istituto nazionale.{0,20}previdenza|(^|[^a-z])inps([^a-z]|$)';

create temporary table _mim_affected_cases (
  case_id bigint primary key
) on commit drop;

insert into _mim_affected_cases (case_id)
select distinct current_case.id
from public.cases as current_case
cross join _mim_context as current_context
where current_case.studio_id = current_context.studio_id
  and (
    current_case.counterparty_id in (
      select counterparty_id from _mim_targets
    )
    or exists (
      select 1
      from public.case_counterparties as current_link
      where current_link.case_id = current_case.id
        and current_link.counterparty_id in (
          select counterparty_id from _mim_targets
        )
    )
    or coalesce(current_case.defendant_name_raw, '') ~* (
      'minister.{0,40}istru'
      || '|(^|[^a-z])(miur|mim)([^a-z]|$)'
      || '|uffici.{0,25}scolastic'
      || '|(^|[^a-z])(usr|usp|ust)([^a-z]|$)'
      || '|ambit.{0,20}territorial'
      || '|provveditorat.{0,20}studi'
      || '|istituzion.{0,15}scolastic'
      || '|istituto.{0,20}(comprensivo|scolastico|statale|superiore|tecnico|professionale|magistrale|istruzione)'
      || '|(^|[^a-z])(scuol|liceo|convitto|educandato)([^a-z]|$)'
      || '|circol.{0,15}didattic'
      || '|direzion.{0,15}didattic'
    )
  )
  and coalesce(current_case.defendant_name_raw, '') !~*
    'istituto nazionale.{0,20}previdenza|(^|[^a-z])inps([^a-z]|$)';

-- Rende uniforme l'anagrafica ufficiale.
update public.counterparties as canonical
set
  name = current_context.canonical_name,
  display_name = current_context.canonical_name,
  normalized_name = public.normalize_counterparty_name(
    current_context.canonical_name
  ),
  organization = current_context.canonical_name,
  active = true,
  deleted_at = null,
  deleted_by = null,
  delete_reason = null,
  needs_review = false
from _mim_context as current_context
where canonical.id = current_context.canonical_id
  and canonical.studio_id = current_context.studio_id;

-- Aggiorna tutte le pratiche, comprese quelle visualizzate nelle schede clienti.
update public.cases as current_case
set
  counterparty_id = current_context.canonical_id,
  defendant_name_raw = current_context.canonical_name
from _mim_context as current_context
where current_case.studio_id = current_context.studio_id
  and current_case.id in (
    select case_id from _mim_affected_cases
  );

-- Sostituisce i vecchi collegamenti MIM/MIUR/scuola con un solo collegamento
-- attivo alla controparte ufficiale, lasciando intatte eventuali altre
-- controparti non scolastiche della stessa pratica.
delete from public.case_counterparties as current_link
using _mim_context as current_context
where current_link.studio_id = current_context.studio_id
  and current_link.case_id in (
    select case_id from _mim_affected_cases
  )
  and current_link.counterparty_id in (
    select counterparty_id from _mim_targets
  );

insert into public.case_counterparties (
  studio_id,
  case_id,
  counterparty_id
)
select
  current_context.studio_id,
  affected_case.case_id,
  current_context.canonical_id
from _mim_affected_cases as affected_case
cross join _mim_context as current_context
where not exists (
  select 1
  from public.case_counterparties as existing_link
  where existing_link.case_id = affected_case.case_id
    and existing_link.counterparty_id = current_context.canonical_id
    and existing_link.deleted_at is null
);

-- Elimina definitivamente soltanto le anagrafiche consolidate, dopo il
-- trasferimento di tutti i collegamenti.
delete from public.counterparties as duplicate
using _mim_context as current_context
where duplicate.studio_id = current_context.studio_id
  and duplicate.id in (
    select counterparty_id from _mim_targets
  )
  and duplicate.id <> current_context.canonical_id;

-- Controlli bloccanti: se uno fallisce, il COMMIT non viene eseguito.
do $$
begin
  if exists (
    select 1
    from public.cases as current_case
    cross join _mim_context as current_context
    where current_case.id in (
      select case_id from _mim_affected_cases
    )
      and (
        current_case.counterparty_id <> current_context.canonical_id
        or current_case.defendant_name_raw <> current_context.canonical_name
      )
  ) then
    raise exception
      'Alcune pratiche non sono state consolidate: operazione annullata.';
  end if;

  if exists (
    select 1
    from public.case_counterparties as current_link
    cross join _mim_context as current_context
    where current_link.case_id in (
      select case_id from _mim_affected_cases
    )
      and current_link.counterparty_id = current_context.canonical_id
      and current_link.deleted_at is null
    group by current_link.case_id
    having count(*) <> 1
  ) then
    raise exception
      'Collegamenti MIM duplicati rilevati: operazione annullata.';
  end if;

  if (
    select count(*) from _mim_affected_cases
  ) <> (
    select count(*)
    from public.case_counterparties as current_link
    cross join _mim_context as current_context
    where current_link.case_id in (
      select case_id from _mim_affected_cases
    )
      and current_link.counterparty_id = current_context.canonical_id
      and current_link.deleted_at is null
  ) then
    raise exception
      'Mancano collegamenti MIM su alcune pratiche: operazione annullata.';
  end if;
end
$$;

commit;

-- Riepilogo visibile nel SQL Editor dopo l'esecuzione.
select
  (select count(*)
   from public.counterparties
   where id = 6
     and deleted_at is null) as controparti_mim_ufficiali,
  (select count(*)
   from public.cases
   where studio_id = '3c02b261-ba03-4dd9-b098-5c70b6348d2c'::uuid
     and counterparty_id = 6) as pratiche_collegate_al_mim,
  (select count(*)
   from public.case_counterparties
   where studio_id = '3c02b261-ba03-4dd9-b098-5c70b6348d2c'::uuid
     and counterparty_id = 6
     and deleted_at is null) as collegamenti_mim_attivi;
