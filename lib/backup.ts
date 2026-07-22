import type { SupabaseClient } from "@supabase/supabase-js";

export const BACKUP_FORMAT_VERSION = "2.0";
export const BACKUP_PAGE_SIZE = 1000;

type BackupRow = Record<string, unknown>;

type TableScope =
  | "studio_id"
  | "studio_primary_key"
  | "profile_ids"
  | "invoice_ids";

export type BackupTableDefinition = {
  name: string;
  primaryKey: string;
  scope: TableScope;
  watermarkColumn?: string;
};

export const BACKUP_TABLES: BackupTableDefinition[] = [
  { name: "studios", primaryKey: "id", scope: "studio_primary_key" },
  {
    name: "profiles",
    primaryKey: "id",
    scope: "studio_id",
    watermarkColumn: "updated_at",
  },
  {
    name: "user_permissions",
    primaryKey: "user_id",
    scope: "profile_ids",
    watermarkColumn: "updated_at",
  },
  {
    name: "contacts",
    primaryKey: "id",
    scope: "studio_id",
    watermarkColumn: "updated_at",
  },
  {
    name: "counterparties",
    primaryKey: "id",
    scope: "studio_id",
    watermarkColumn: "updated_at",
  },
  {
    name: "cases",
    primaryKey: "id",
    scope: "studio_id",
    watermarkColumn: "updated_at",
  },
  {
    name: "events",
    primaryKey: "id",
    scope: "studio_id",
    watermarkColumn: "updated_at",
  },
  {
    name: "hearing_updates",
    primaryKey: "id",
    scope: "studio_id",
    watermarkColumn: "updated_at",
  },
  {
    name: "case_activities",
    primaryKey: "id",
    scope: "studio_id",
    watermarkColumn: "updated_at",
  },
  {
    name: "case_documents",
    primaryKey: "id",
    scope: "studio_id",
    watermarkColumn: "updated_at",
  },
  {
    name: "case_titles",
    primaryKey: "id",
    scope: "studio_id",
    watermarkColumn: "updated_at",
  },
  {
    name: "enforcement_actions",
    primaryKey: "id",
    scope: "studio_id",
    watermarkColumn: "updated_at",
  },
  {
    name: "invoices",
    primaryKey: "id",
    scope: "studio_id",
    watermarkColumn: "updated_at",
  },
  {
    name: "payments",
    primaryKey: "id",
    scope: "invoice_ids",
    watermarkColumn: "updated_at",
  },
  {
    name: "backup_settings",
    primaryKey: "id",
    scope: "studio_id",
    watermarkColumn: "updated_at",
  },
  {
    name: "backup_runs",
    primaryKey: "id",
    scope: "studio_id",
  },
];

export type BackupData = Record<string, BackupRow[]>;

export type BackupTableManifest = {
  record_count: number;
  min_id: string | number | null;
  max_id: string | number | null;
  active_count: number | null;
  soft_deleted_count: number | null;
  max_updated_at: string | null;
  data_sha256: string;
};

export type BackupIntegrityResult = {
  status: "passed" | "failed";
  checks: Record<string, boolean>;
  references_checked: number;
  missing_references: string[];
  warnings: string[];
};

export type BackupManifest = {
  format_version: string;
  project_ref: string;
  studio_id: string;
  started_at_utc: string;
  completed_at_utc: string;
  backup_file_name: string;
  backup_sha256: string;
  tables: Record<string, BackupTableManifest>;
  integrity: BackupIntegrityResult;
  restore_order: string[];
  warnings: string[];
};

export type BackupPayload = {
  application: string;
  format_version: string;
  project_ref: string;
  studio_id: string;
  generated_at: string;
  data: BackupData;
};

export type BackupBundle = {
  fileName: string;
  content: string;
  sha256: string;
  sha256Content: string;
  manifestFileName: string;
  manifestContent: string;
  integrityReportFileName: string;
  integrityReportContent: string;
  manifest: BackupManifest;
  payload: BackupPayload;
};

type SnapshotContext = {
  profileIds: Array<string | number>;
  invoiceIds: Array<string | number>;
};

function chunks<T>(values: T[], size = 100): T[][] {
  if (values.length === 0) return [];
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function comparable(value: unknown): string | number {
  if (typeof value === "number" || typeof value === "string") return value;
  throw new Error(`Chiave primaria non confrontabile: ${String(value)}`);
}

function comparePrimaryKeys(left: unknown, right: unknown) {
  const leftValue = comparable(left);
  const rightValue = comparable(right);
  if (typeof leftValue === "number" && typeof rightValue === "number") {
    return leftValue - rightValue;
  }
  return String(leftValue).localeCompare(String(rightValue));
}

function scopeValues(
  definition: BackupTableDefinition,
  context: SnapshotContext
): Array<Array<string | number> | null> {
  if (definition.scope === "profile_ids") {
    return chunks(context.profileIds);
  }
  if (definition.scope === "invoice_ids") {
    return chunks(context.invoiceIds);
  }
  return [null];
}

async function fetchTableRows(
  client: SupabaseClient,
  definition: BackupTableDefinition,
  studioId: string,
  context: SnapshotContext
): Promise<BackupRow[]> {
  const scopes = scopeValues(definition, context);
  if (scopes.length === 0) return [];

  const rows: BackupRow[] = [];

  for (const values of scopes) {
    let cursor: string | number | null = null;

    while (true) {
      let query = client.from(definition.name).select("*");
      if (definition.scope === "studio_primary_key") {
        query = query.eq(definition.primaryKey, studioId);
      } else if (definition.scope === "studio_id") {
        query = query.eq("studio_id", studioId);
      } else if (definition.scope === "profile_ids") {
        query = query.in("user_id", values ?? []);
      } else {
        query = query.in("invoice_id", values ?? []);
      }
      query = query
        .order(definition.primaryKey, { ascending: true })
        .limit(BACKUP_PAGE_SIZE);

      if (cursor !== null) {
        query = query.gt(definition.primaryKey, cursor);
      }

      const { data, error } = await query;
      if (error) {
        throw new Error(`${definition.name}: ${error.message}`);
      }

      const page = (data ?? []) as BackupRow[];
      rows.push(...page);

      if (page.length < BACKUP_PAGE_SIZE) break;

      const lastValue = page.at(-1)?.[definition.primaryKey];
      if (lastValue === undefined || lastValue === null) {
        throw new Error(
          `${definition.name}: cursore mancante nell'ultima riga della pagina.`
        );
      }

      const nextCursor = comparable(lastValue);
      if (cursor !== null && comparePrimaryKeys(nextCursor, cursor) <= 0) {
        throw new Error(
          `${definition.name}: paginazione non progressiva sul cursore.`
        );
      }
      cursor = nextCursor;
    }
  }

  rows.sort((left, right) =>
    comparePrimaryKeys(
      left[definition.primaryKey],
      right[definition.primaryKey]
    )
  );

  const ids = rows.map((row) => comparable(row[definition.primaryKey]));
  if (new Set(ids.map(String)).size !== ids.length) {
    throw new Error(`${definition.name}: ID duplicati tra le pagine.`);
  }

  return rows;
}

export async function exportStudioData(
  client: SupabaseClient,
  studioId: string
): Promise<BackupData> {
  const result: BackupData = {};
  const context: SnapshotContext = { profileIds: [], invoiceIds: [] };

  for (const definition of BACKUP_TABLES) {
    const rows = await fetchTableRows(client, definition, studioId, context);
    result[definition.name] = rows;

    if (definition.name === "profiles") {
      context.profileIds = rows.map((row) => comparable(row.id));
    }
    if (definition.name === "invoices") {
      context.invoiceIds = rows.map((row) => comparable(row.id));
    }
  }

  return result;
}

function maxTimestamp(rows: BackupRow[], column?: string) {
  if (!column) return null;
  const values = rows
    .map((row) => row[column])
    .filter((value): value is string => typeof value === "string" && !!value);
  return values.length > 0 ? values.sort().at(-1) ?? null : null;
}

function idBoundary(rows: BackupRow[], key: string, side: "min" | "max") {
  if (rows.length === 0) return null;
  const value = rows[side === "min" ? 0 : rows.length - 1]?.[key];
  return typeof value === "number" || typeof value === "string" ? value : null;
}

async function tableManifests(data: BackupData) {
  const manifests: Record<string, BackupTableManifest> = {};
  for (const definition of BACKUP_TABLES) {
    const rows = data[definition.name] ?? [];
    const hasActive = rows.some((row) => "active" in row);
    const hasDeletedAt = rows.some((row) => "deleted_at" in row);
    manifests[definition.name] = {
      record_count: rows.length,
      min_id: idBoundary(rows, definition.primaryKey, "min"),
      max_id: idBoundary(rows, definition.primaryKey, "max"),
      active_count: hasDeletedAt
        ? rows.filter(
            (row) =>
              row.deleted_at === null &&
              (!hasActive || row.active === true)
          ).length
        : hasActive
          ? rows.filter((row) => row.active === true).length
          : null,
      soft_deleted_count: hasDeletedAt
        ? rows.filter((row) => row.deleted_at !== null).length
        : null,
      max_updated_at: maxTimestamp(rows, definition.watermarkColumn),
      data_sha256: await sha256(JSON.stringify(rows)),
    };
  }
  return manifests;
}

function rowIds(data: BackupData, table: string, key = "id") {
  return new Set(
    (data[table] ?? [])
      .map((row) => row[key])
      .filter((value) => value !== null && value !== undefined)
      .map(String)
  );
}

function checkReference(
  missing: string[],
  sourceTable: string,
  sourceRow: BackupRow,
  sourceKey: string,
  targetTable: string,
  targets: Set<string>
) {
  const value = sourceRow[sourceKey];
  if (value === null || value === undefined) return 0;
  if (!targets.has(String(value))) {
    missing.push(
      `${sourceTable}.${sourceKey}=${String(value)} ` +
        `(record ${String(sourceRow.id ?? sourceRow.user_id ?? "?")}) ` +
        `non presente in ${targetTable}.`
    );
  }
  return 1;
}

export function validateBackupIntegrity(
  data: BackupData,
  studioId: string
): BackupIntegrityResult {
  const missing: string[] = [];
  const warnings: string[] = [];
  let referencesChecked = 0;

  const contacts = rowIds(data, "contacts");
  const counterparties = rowIds(data, "counterparties");
  const cases = rowIds(data, "cases");
  const events = rowIds(data, "events");
  const profiles = rowIds(data, "profiles");
  const invoices = rowIds(data, "invoices");
  const titles = rowIds(data, "case_titles");

  const checks: Record<string, boolean> = {};
  checks.all_tables_present = BACKUP_TABLES.every(
    ({ name }) => Array.isArray(data[name])
  );
  checks.original_ids_preserved = BACKUP_TABLES.every(({ name, primaryKey }) =>
    (data[name] ?? []).every(
      (row) => row[primaryKey] !== null && row[primaryKey] !== undefined
    )
  );
  checks.ids_unique = BACKUP_TABLES.every(({ name, primaryKey }) => {
    const values = (data[name] ?? []).map((row) => String(row[primaryKey]));
    return new Set(values).size === values.length;
  });
  checks.studio_scope_valid = BACKUP_TABLES.every(({ name, scope }) =>
    (data[name] ?? []).every((row) =>
      scope === "studio_primary_key"
        ? String(row.id) === studioId
        : scope === "profile_ids" || scope === "invoice_ids"
          ? true
          : String(row.studio_id) === studioId
    )
  );

  const requiredContactFields = [
    "id",
    "studio_id",
    "contact_type",
    "first_name",
    "last_name",
    "display_name",
    "fiscal_code",
    "vat_number",
    "email",
    "pec",
    "phone",
    "mobile_phone",
    "organization",
    "job_title",
    "address",
    "city",
    "postal_code",
    "province",
    "notes",
    "needs_review",
    "active",
    "deleted_at",
    "deleted_by",
    "delete_reason",
    "source",
    "source_row",
    "created_at",
    "updated_at",
  ];
  checks.contact_fields_preserved = (data.contacts ?? []).every((row) =>
    requiredContactFields.every((field) => field in row)
  );

  for (const table of ["profiles", "contacts"]) {
    for (const row of data[table] ?? []) {
      referencesChecked += checkReference(
        missing,
        table,
        row,
        "deleted_by",
        "profiles",
        profiles
      );
    }
  }

  for (const row of data.cases ?? []) {
    referencesChecked += checkReference(
      missing,
      "cases",
      row,
      "client_contact_id",
      "contacts",
      contacts
    );
    referencesChecked += checkReference(
      missing,
      "cases",
      row,
      "counterparty_id",
      "counterparties",
      counterparties
    );
    referencesChecked += checkReference(
      missing,
      "cases",
      row,
      "responsible_user_id",
      "profiles",
      profiles
    );
    referencesChecked += checkReference(
      missing,
      "cases",
      row,
      "deleted_by",
      "profiles",
      profiles
    );
  }

  for (const row of data.events ?? []) {
    referencesChecked += checkReference(
      missing,
      "events",
      row,
      "case_id",
      "cases",
      cases
    );
    for (const key of ["responsible_user_id", "completed_by", "deleted_by"]) {
      referencesChecked += checkReference(
        missing,
        "events",
        row,
        key,
        "profiles",
        profiles
      );
    }
  }

  for (const table of ["case_documents", "case_activities"]) {
    for (const row of data[table] ?? []) {
      referencesChecked += checkReference(
        missing,
        table,
        row,
        "case_id",
        "cases",
        cases
      );
      if ("created_by" in row) {
        referencesChecked += checkReference(
          missing,
          table,
          row,
          "created_by",
          "profiles",
          profiles
        );
      }
    }
  }

  for (const row of data.case_titles ?? []) {
    for (const key of ["case_id", "opposition_case_id"]) {
      referencesChecked += checkReference(
        missing,
        "case_titles",
        row,
        key,
        "cases",
        cases
      );
    }
  }

  for (const row of data.enforcement_actions ?? []) {
    for (const key of ["case_id", "related_case_id"]) {
      if (key in row) {
        referencesChecked += checkReference(
          missing,
          "enforcement_actions",
          row,
          key,
          "cases",
          cases
        );
      }
    }
    if ("case_title_id" in row) {
      referencesChecked += checkReference(
        missing,
        "enforcement_actions",
        row,
        "case_title_id",
        "case_titles",
        titles
      );
    }
  }

  for (const row of data.hearing_updates ?? []) {
    referencesChecked += checkReference(
      missing,
      "hearing_updates",
      row,
      "event_id",
      "events",
      events
    );
  }

  for (const row of data.invoices ?? []) {
    referencesChecked += checkReference(
      missing,
      "invoices",
      row,
      "client_contact_id",
      "contacts",
      contacts
    );
    referencesChecked += checkReference(
      missing,
      "invoices",
      row,
      "case_id",
      "cases",
      cases
    );
  }

  for (const row of data.payments ?? []) {
    referencesChecked += checkReference(
      missing,
      "payments",
      row,
      "invoice_id",
      "invoices",
      invoices
    );
  }

  for (const row of data.user_permissions ?? []) {
    referencesChecked += checkReference(
      missing,
      "user_permissions",
      row,
      "user_id",
      "profiles",
      profiles
    );
  }

  checks.no_orphan_references = missing.length === 0;
  checks.soft_delete_fields_preserved = [
    "profiles",
    "contacts",
    "cases",
    "events",
  ].every((table) =>
    (data[table] ?? []).every(
      (row) =>
        "deleted_at" in row &&
        "deleted_by" in row &&
        "delete_reason" in row
    )
  );

  if ((data.events ?? []).filter((row) => row.deleted_at !== null).length > 0) {
    warnings.push("Il backup include eventi soft-deleted, come richiesto.");
  }

  const passed = Object.values(checks).every(Boolean) && missing.length === 0;
  return {
    status: passed ? "passed" : "failed",
    checks,
    references_checked: referencesChecked,
    missing_references: missing,
    warnings,
  };
}

function manifestsEqual(
  left: Record<string, BackupTableManifest>,
  right: Record<string, BackupTableManifest>
) {
  return BACKUP_TABLES.every(({ name }) => {
    const first = left[name];
    const second = right[name];
    return (
      first.record_count === second.record_count &&
      first.max_updated_at === second.max_updated_at &&
      first.data_sha256 === second.data_sha256
    );
  });
}

export async function sha256(content: string) {
  const bytes = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function formatFileDate(date: Date) {
  return date
    .toISOString()
    .replace(/:/g, "-")
    .replace(/\.\d{3}Z$/, "Z");
}

export function projectRefFromUrl(supabaseUrl: string) {
  return new URL(supabaseUrl).hostname.split(".")[0] ?? "";
}

export async function createCompleteBackup(
  client: SupabaseClient,
  options: { studioId: string; projectRef: string; now?: () => Date }
): Promise<BackupBundle> {
  const now = options.now ?? (() => new Date());
  const startedAt = now();

  const preflightData = await exportStudioData(client, options.studioId);
  const preflightTables = await tableManifests(preflightData);

  const exportedData = await exportStudioData(client, options.studioId);
  const exportedTables = await tableManifests(exportedData);

  if (!manifestsEqual(preflightTables, exportedTables)) {
    throw new Error(
      "Backup non coerente: conteggi, max updated_at o contenuto sono cambiati durante l'esportazione."
    );
  }

  const integrity = validateBackupIntegrity(exportedData, options.studioId);
  if (integrity.status !== "passed") {
    throw new Error(
      `Controlli di integrità falliti: ${integrity.missing_references.join(" | ") || "schema o ID non validi"}`
    );
  }

  const completedAt = now();
  const fileName = `zaza-dellali-backup-${formatFileDate(completedAt)}.json`;
  const payload: BackupPayload = {
    application: "ZAZA DELL’ALI STUDIO LEGALE",
    format_version: BACKUP_FORMAT_VERSION,
    project_ref: options.projectRef,
    studio_id: options.studioId,
    generated_at: completedAt.toISOString(),
    data: exportedData,
  };
  const content = JSON.stringify(payload, null, 2);
  const backupSha256 = await sha256(content);

  const finalVerification = JSON.parse(content) as BackupPayload;
  const finalTables = await tableManifests(finalVerification.data);
  const finalIntegrity = validateBackupIntegrity(
    finalVerification.data,
    options.studioId
  );
  if (
    finalIntegrity.status !== "passed" ||
    !manifestsEqual(exportedTables, finalTables)
  ) {
    throw new Error(
      "Il file riletto non coincide con i dati esportati o non supera i controlli di integrità."
    );
  }

  const warnings = [...new Set(finalIntegrity.warnings)];
  const manifest: BackupManifest = {
    format_version: BACKUP_FORMAT_VERSION,
    project_ref: options.projectRef,
    studio_id: options.studioId,
    started_at_utc: startedAt.toISOString(),
    completed_at_utc: completedAt.toISOString(),
    backup_file_name: fileName,
    backup_sha256: backupSha256,
    tables: finalTables,
    integrity: finalIntegrity,
    restore_order: BACKUP_TABLES.map(({ name }) => name),
    warnings,
  };

  const manifestFileName = fileName.replace(/\.json$/, "-manifest.json");
  const integrityReportFileName = fileName.replace(
    /\.json$/,
    "-integrity-report.md"
  );

  return {
    fileName,
    content,
    sha256: backupSha256,
    sha256Content: `${backupSha256}  ${fileName}\n`,
    manifestFileName,
    manifestContent: JSON.stringify(manifest, null, 2),
    integrityReportFileName,
    integrityReportContent: buildIntegrityReport(manifest),
    manifest,
    payload,
  };
}

export function buildIntegrityReport(manifest: BackupManifest) {
  const tableRows = BACKUP_TABLES.map(({ name }) => {
    const table = manifest.tables[name];
    return `| ${name} | ${table.record_count} | ${String(table.min_id ?? "—")} | ${String(table.max_id ?? "—")} | ${String(table.active_count ?? "—")} | ${String(table.soft_deleted_count ?? "—")} |`;
  }).join("\n");

  const checkRows = Object.entries(manifest.integrity.checks)
    .map(([name, passed]) => `- ${passed ? "PASS" : "FAIL"}: \`${name}\``)
    .join("\n");

  return `# Backup integrity report\n\n` +
    `- Formato: ${manifest.format_version}\n` +
    `- Progetto: ${manifest.project_ref}\n` +
    `- Studio: ${manifest.studio_id}\n` +
    `- Inizio UTC: ${manifest.started_at_utc}\n` +
    `- Fine UTC: ${manifest.completed_at_utc}\n` +
    `- File: ${manifest.backup_file_name}\n` +
    `- SHA-256: \`${manifest.backup_sha256}\`\n` +
    `- Esito: **${manifest.integrity.status.toUpperCase()}**\n` +
    `- Riferimenti verificati: ${manifest.integrity.references_checked}\n` +
    `- Riferimenti mancanti: ${manifest.integrity.missing_references.length}\n\n` +
    `## Tabelle\n\n` +
    `| Tabella | Record | ID minimo | ID massimo | Attivi | Soft-deleted |\n` +
    `|---|---:|---:|---:|---:|---:|\n${tableRows}\n\n` +
    `## Controlli\n\n${checkRows}\n\n` +
    `## Warning\n\n${manifest.warnings.length > 0 ? manifest.warnings.map((warning) => `- ${warning}`).join("\n") : "Nessuno."}\n`;
}
