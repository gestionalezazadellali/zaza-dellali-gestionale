import { supabase } from "./supabase";

export type CounterpartyRecord = {
  id: number;
  studio_id: string;
  name: string;
  normalized_name: string;
  counterparty_type: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string;
  fiscal_code: string | null;
  vat_number: string | null;
  email: string | null;
  pec: string | null;
  phone: string | null;
  mobile_phone: string | null;
  organization: string | null;
  job_title: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  province: string | null;
  notes: string | null;
  needs_review: boolean;
  active: boolean;
  deleted_at: string | null;
  deleted_by: string | null;
  delete_reason: string | null;
};

export type CounterpartyInput = {
  first_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
  fiscal_code?: string | null;
  vat_number?: string | null;
  email?: string | null;
  pec?: string | null;
  phone?: string | null;
  mobile_phone?: string | null;
  organization?: string | null;
  job_title?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  province?: string | null;
  notes?: string | null;
  counterparty_type?: string | null;
  needs_review?: boolean;
};

export type CaseCounterpartyRecord = {
  link_id: number;
  case_id: number;
  counterparty_id: number;
  created_at: string;
  created_by: string | null;
  counterparty: CounterpartyRecord;
};

export type CounterpartyCaseRecord = {
  link_id: number;
  case_id: number;
  title: string | null;
  claimant_name_raw: string | null;
  defendant_name_raw: string | null;
  rg_number: string | null;
  court_type: string | null;
  court_city: string | null;
  status: string | null;
  deleted_at: string | null;
};

export type CaseSaveInput = {
  client_contact_id: number;
  title: string;
  case_type: string;
  claimant_name_raw: string | null;
  court_type: string | null;
  court_city: string | null;
  section: string | null;
  rg_number: string | null;
  judge_name: string | null;
  status: string;
  archive_box_number?: string | null;
  archive_year?: number | null;
  closing_date?: string | null;
  opening_date: string | null;
  description: string | null;
  notes: string | null;
  needs_review: boolean;
  active: boolean;
  counterparty_id?: number | null;
  defendant_name_raw?: string | null;
};

type CounterpartyPayload = {
  name: string;
  normalized_name: string;
  counterparty_type: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string;
  fiscal_code: string | null;
  vat_number: string | null;
  email: string | null;
  pec: string | null;
  phone: string | null;
  mobile_phone: string | null;
  organization: string | null;
  job_title: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  province: string | null;
  notes: string | null;
  needs_review: boolean;
  active: boolean;
};

type PermissionName =
  | "can_view_clients"
  | "can_edit_clients"
  | "can_view_cases"
  | "can_edit_cases";

const counterpartyFields = `
  id,
  studio_id,
  name,
  normalized_name,
  counterparty_type,
  first_name,
  last_name,
  display_name,
  fiscal_code,
  vat_number,
  email,
  pec,
  phone,
  mobile_phone,
  organization,
  job_title,
  address,
  city,
  postal_code,
  province,
  notes,
  needs_review,
  active,
  deleted_at,
  deleted_by,
  delete_reason
`;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class CounterpartyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CounterpartyValidationError";
  }
}

export function normalizeCounterpartyName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("it")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function validateCounterpartyInput(
  input: CounterpartyInput
): CounterpartyPayload {
  const firstName = clean(input.first_name);
  const lastName = clean(input.last_name);
  const organization = clean(input.organization);
  const displayName =
    clean(input.display_name) ||
    [firstName, lastName].filter(Boolean).join(" ") ||
    organization;

  if (!displayName) {
    throw new CounterpartyValidationError(
      "Inserisci almeno nome e cognome, denominazione o nominativo visualizzato."
    );
  }

  assertMaxLength("Nominativo visualizzato", displayName, 300);

  const email = clean(input.email);
  const pec = clean(input.pec);

  if (email && !emailPattern.test(email)) {
    throw new CounterpartyValidationError("Indirizzo email non valido.");
  }

  if (pec && !emailPattern.test(pec)) {
    throw new CounterpartyValidationError("Indirizzo PEC non valido.");
  }

  const payload: CounterpartyPayload = {
    name: displayName,
    normalized_name: normalizeCounterpartyName(displayName),
    counterparty_type: clean(input.counterparty_type) || "da_classificare",
    first_name: firstName,
    last_name: lastName,
    display_name: displayName,
    fiscal_code: clean(input.fiscal_code),
    vat_number: clean(input.vat_number),
    email,
    pec,
    phone: clean(input.phone),
    mobile_phone: clean(input.mobile_phone),
    organization,
    job_title: clean(input.job_title),
    address: clean(input.address),
    city: clean(input.city),
    postal_code: clean(input.postal_code),
    province: clean(input.province)?.toLocaleUpperCase("it") ?? null,
    notes: clean(input.notes),
    needs_review: input.needs_review ?? false,
    active: true,
  };

  assertOptionalLengths(payload);
  return payload;
}

export async function searchCounterparties({
  studioId,
  query = "",
  includeDeleted = false,
  onlyDeleted = false,
  limit = 50,
}: {
  studioId: string;
  query?: string;
  includeDeleted?: boolean;
  onlyDeleted?: boolean;
  limit?: number;
}) {
  validateStudioId(studioId);
  await requirePermission("can_view_clients");

  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const searchValue = sanitizeSearchValue(query);

  let request = supabase
    .from("counterparties")
    .select(counterpartyFields)
    .eq("studio_id", studioId);

  if (onlyDeleted) {
    request = request.not("deleted_at", "is", null);
  } else if (!includeDeleted) {
    request = request.is("deleted_at", null);
  }

  if (searchValue) {
    const pattern = `%${searchValue}%`;
    request = request.or(
      [
        `display_name.ilike.${pattern}`,
        `name.ilike.${pattern}`,
        `normalized_name.ilike.${pattern}`,
        `first_name.ilike.${pattern}`,
        `last_name.ilike.${pattern}`,
        `fiscal_code.ilike.${pattern}`,
        `vat_number.ilike.${pattern}`,
        `email.ilike.${pattern}`,
        `pec.ilike.${pattern}`,
        `phone.ilike.${pattern}`,
        `mobile_phone.ilike.${pattern}`,
        `organization.ilike.${pattern}`,
        `city.ilike.${pattern}`,
      ].join(",")
    );
  }

  const { data, error } = await request
    .order("display_name", { ascending: true })
    .limit(safeLimit);

  if (error) throw error;
  return (data ?? []) as CounterpartyRecord[];
}

export async function getCounterparty(
  studioId: string,
  counterpartyId: number,
  { includeDeleted = false }: { includeDeleted?: boolean } = {}
) {
  validateStudioId(studioId);
  validateId("controparte", counterpartyId);
  await requirePermission("can_view_clients");

  let request = supabase
    .from("counterparties")
    .select(counterpartyFields)
    .eq("studio_id", studioId)
    .eq("id", counterpartyId);

  if (!includeDeleted) {
    request = request.is("deleted_at", null);
  }

  const { data, error } = await request.maybeSingle();
  if (error) throw error;
  return data as CounterpartyRecord | null;
}

export async function createCounterparty(
  studioId: string,
  input: CounterpartyInput
) {
  validateStudioId(studioId);
  await requirePermission("can_edit_clients");
  const payload = validateCounterpartyInput(input);

  const { data, error } = await supabase
    .from("counterparties")
    .insert({ studio_id: studioId, ...payload })
    .select(counterpartyFields)
    .single();

  if (error) throw error;
  return data as CounterpartyRecord;
}

export async function updateCounterparty(
  studioId: string,
  counterpartyId: number,
  input: CounterpartyInput
) {
  validateStudioId(studioId);
  validateId("controparte", counterpartyId);
  await requirePermission("can_edit_clients");
  const payload = validateCounterpartyInput(input);

  const { data, error } = await supabase
    .from("counterparties")
    .update(payload)
    .eq("studio_id", studioId)
    .eq("id", counterpartyId)
    .is("deleted_at", null)
    .select(counterpartyFields)
    .single();

  if (error) throw error;
  return data as CounterpartyRecord;
}

export async function softDeleteCounterparty(
  studioId: string,
  counterpartyId: number,
  reason = "Eliminata dalla scheda controparte"
) {
  validateStudioId(studioId);
  validateId("controparte", counterpartyId);
  const userId = await requirePermission("can_edit_clients");

  const { data, error } = await supabase
    .from("counterparties")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: userId,
      delete_reason: clean(reason) || "Eliminata dalla scheda controparte",
    })
    .eq("studio_id", studioId)
    .eq("id", counterpartyId)
    .is("deleted_at", null)
    .select(counterpartyFields)
    .single();

  if (error) throw error;
  return data as CounterpartyRecord;
}

export async function restoreCounterparty(
  studioId: string,
  counterpartyId: number
) {
  validateStudioId(studioId);
  validateId("controparte", counterpartyId);
  await requirePermission("can_edit_clients");

  const { data, error } = await supabase
    .from("counterparties")
    .update({
      deleted_at: null,
      deleted_by: null,
      delete_reason: null,
    })
    .eq("studio_id", studioId)
    .eq("id", counterpartyId)
    .not("deleted_at", "is", null)
    .select(counterpartyFields)
    .single();

  if (error) throw error;
  return data as CounterpartyRecord;
}

export async function listCaseCounterparties(
  studioId: string,
  caseId: number
) {
  validateStudioId(studioId);
  validateId("pratica", caseId);
  await requirePermission("can_view_cases");

  const { data, error } = await supabase
    .from("case_counterparties")
    .select(
      `
        id,
        case_id,
        counterparty_id,
        created_at,
        created_by,
        counterparties (${counterpartyFields})
      `
    )
    .eq("studio_id", studioId)
    .eq("case_id", caseId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).flatMap((item) => {
    const related = Array.isArray(item.counterparties)
      ? item.counterparties[0]
      : item.counterparties;

    if (!related) return [];

    return [
      {
        link_id: item.id,
        case_id: item.case_id,
        counterparty_id: item.counterparty_id,
        created_at: item.created_at,
        created_by: item.created_by,
        counterparty: related,
      } as CaseCounterpartyRecord,
    ];
  });
}

export async function listCounterpartyCases(
  studioId: string,
  counterpartyId: number,
  { includeDeletedCases = false }: { includeDeletedCases?: boolean } = {}
) {
  validateStudioId(studioId);
  validateId("controparte", counterpartyId);
  await requirePermission("can_view_clients");

  let request = supabase
    .from("case_counterparties")
    .select(
      `
        id,
        case_id,
        cases (
          id,
          title,
          claimant_name_raw,
          defendant_name_raw,
          rg_number,
          court_type,
          court_city,
          status,
          deleted_at
        )
      `
    )
    .eq("studio_id", studioId)
    .eq("counterparty_id", counterpartyId)
    .is("deleted_at", null);

  if (!includeDeletedCases) {
    request = request.is("cases.deleted_at", null);
  }

  const { data, error } = await request.order("created_at", {
    ascending: false,
  });

  if (error) throw error;

  return (data ?? []).flatMap((item) => {
    const relatedCase = Array.isArray(item.cases)
      ? item.cases[0]
      : item.cases;

    if (!relatedCase) return [];

    return [
      {
        link_id: item.id,
        case_id: item.case_id,
        title: relatedCase.title,
        claimant_name_raw: relatedCase.claimant_name_raw,
        defendant_name_raw: relatedCase.defendant_name_raw,
        rg_number: relatedCase.rg_number,
        court_type: relatedCase.court_type,
        court_city: relatedCase.court_city,
        status: relatedCase.status,
        deleted_at: relatedCase.deleted_at,
      } as CounterpartyCaseRecord,
    ];
  });
}

export async function saveCaseWithCounterparties({
  studioId,
  caseId = null,
  caseData,
  counterpartyIds,
}: {
  studioId: string;
  caseId?: number | null;
  caseData: CaseSaveInput;
  counterpartyIds: number[];
}) {
  validateStudioId(studioId);
  if (caseId !== null) validateId("pratica", caseId);
  validateId("cliente", caseData.client_contact_id);

  const uniqueIds = [...new Set(counterpartyIds)];
  uniqueIds.forEach((id) => validateId("controparte", id));
  await requirePermission("can_edit_cases");

  const { data, error } = await supabase.rpc(
    "save_case_with_counterparties",
    {
      p_case: { studio_id: studioId, ...caseData },
      p_counterparty_ids: uniqueIds,
      p_case_id: caseId,
    }
  );

  if (error) {
    throw new Error(
      error.message
        ? `Salvataggio annullato: ${error.message}`
        : "Salvataggio annullato: impossibile salvare la pratica e i collegamenti con le controparti."
    );
  }

  const savedCaseId = Number(data);
  validateId("pratica salvata", savedCaseId);

  const { error: archiveError } = await supabase
    .from("cases")
    .update({
      archive_box_number: caseData.archive_box_number ?? null,
      archive_year: caseData.archive_year ?? null,
      closing_date: caseData.closing_date ?? null,
    })
    .eq("id", savedCaseId)
    .eq("studio_id", studioId);

  if (archiveError) {
    throw new Error(
      `Pratica salvata, ma dati di archiviazione non aggiornati: ${archiveError.message}`
    );
  }
  return savedCaseId;
}

function clean(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function assertMaxLength(label: string, value: string | null, max: number) {
  if (value && value.length > max) {
    throw new CounterpartyValidationError(
      `${label}: lunghezza massima ${max} caratteri.`
    );
  }
}

function assertOptionalLengths(payload: CounterpartyPayload) {
  assertMaxLength("Nome", payload.first_name, 150);
  assertMaxLength("Cognome", payload.last_name, 150);
  assertMaxLength("Codice fiscale", payload.fiscal_code, 32);
  assertMaxLength("Partita IVA", payload.vat_number, 32);
  assertMaxLength("Email", payload.email, 320);
  assertMaxLength("PEC", payload.pec, 320);
  assertMaxLength("Telefono", payload.phone, 64);
  assertMaxLength("Cellulare", payload.mobile_phone, 64);
  assertMaxLength("Società / organizzazione", payload.organization, 300);
  assertMaxLength("Qualifica", payload.job_title, 200);
  assertMaxLength("Indirizzo", payload.address, 500);
  assertMaxLength("Città", payload.city, 150);
  assertMaxLength("CAP", payload.postal_code, 16);
  assertMaxLength("Provincia", payload.province, 10);
  assertMaxLength("Note", payload.notes, 10_000);
}

function validateStudioId(studioId: string) {
  if (!studioId.trim()) {
    throw new CounterpartyValidationError("Studio non identificato.");
  }
}

function validateId(label: string, value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new CounterpartyValidationError(`Identificativo ${label} non valido.`);
  }
}

function sanitizeSearchValue(value: string) {
  return value
    .trim()
    .replace(/[^\p{L}\p{N}@+_.\-\s]/gu, " ")
    .replace(/\s+/g, " ")
    .slice(0, 100);
}

async function requirePermission(permission: PermissionName) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error("Utente non autenticato.");

  const { data, error } = await supabase
    .from("user_permissions")
    .select(permission)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw error;

  const permissionRecord = data as Record<string, boolean> | null;
  if (!permissionRecord?.[permission]) {
    throw new Error("Non disponi del permesso richiesto.");
  }

  return user.id;
}
