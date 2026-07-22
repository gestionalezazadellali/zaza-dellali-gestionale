import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import {
  BACKUP_FORMAT_VERSION,
  BACKUP_TABLES,
  exportStudioData,
  projectRefFromUrl,
  sha256,
  validateBackupIntegrity,
} from "../lib/backup.ts";

process.loadEnvFile(path.resolve(".env.local"));

const backupPath = path.resolve(process.argv[2] ?? "");
const manifestPath = path.resolve(process.argv[3] ?? "");
const reportPath = path.resolve(
  process.argv[4] ??
    path.join(path.dirname(backupPath), "backup_restore_dry_run_report.md")
);
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!process.argv[2] || !process.argv[3] || !supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Uso: node --experimental-strip-types scripts/backup-restore-dry-run.mjs <backup.json> <manifest.json> [report.md]."
  );
}

const backupContent = await fs.readFile(backupPath, "utf8");
const manifestContent = await fs.readFile(manifestPath, "utf8");
const payload = JSON.parse(backupContent);
const manifest = JSON.parse(manifestContent);
const computedHash = await sha256(backupContent);

const structuralChecks = {
  json_valid: true,
  format_version_valid:
    payload.format_version === BACKUP_FORMAT_VERSION &&
    manifest.format_version === BACKUP_FORMAT_VERSION,
  project_ref_matches:
    payload.project_ref === projectRefFromUrl(supabaseUrl) &&
    manifest.project_ref === payload.project_ref,
  studio_id_matches:
    typeof payload.studio_id === "string" &&
    manifest.studio_id === payload.studio_id,
  sha256_matches:
    computedHash === manifest.backup_sha256,
  all_tables_present: BACKUP_TABLES.every(({ name }) =>
    Array.isArray(payload.data?.[name])
  ),
};

const integrity = validateBackupIntegrity(payload.data, payload.studio_id);
const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const liveData = await exportStudioData(client, payload.studio_id);

const collisionRows = [];
let identicalCollisions = 0;
let divergentCollisions = 0;
let wouldInsert = 0;
let liveRowsMissingFromBackup = 0;

for (const definition of BACKUP_TABLES) {
  const backupRows = payload.data[definition.name] ?? [];
  const liveRows = liveData[definition.name] ?? [];
  const backupById = new Map(
    backupRows.map((row) => [String(row[definition.primaryKey]), row])
  );
  const liveById = new Map(
    liveRows.map((row) => [String(row[definition.primaryKey]), row])
  );
  let tableIdentical = 0;
  let tableDivergent = 0;
  let tableInsert = 0;

  for (const [id, backupRow] of backupById) {
    const liveRow = liveById.get(id);
    if (!liveRow) {
      tableInsert += 1;
      continue;
    }
    if (JSON.stringify(backupRow) === JSON.stringify(liveRow)) {
      tableIdentical += 1;
    } else {
      tableDivergent += 1;
    }
  }

  const tableMissing = [...liveById].filter(
    ([id]) => !backupById.has(id)
  ).length;
  identicalCollisions += tableIdentical;
  divergentCollisions += tableDivergent;
  wouldInsert += tableInsert;
  liveRowsMissingFromBackup += tableMissing;
  collisionRows.push(
    `| ${definition.name} | ${backupRows.length} | ${tableIdentical} | ${tableDivergent} | ${tableInsert} | ${tableMissing} |`
  );
}

const checksPassed =
  Object.values(structuralChecks).every(Boolean) &&
  integrity.status === "passed";

const restoreOrder = BACKUP_TABLES.map(({ name }, index) =>
  `${index + 1}. \`${name}\``
).join("\n");

const report = `# Backup restore dry-run report\n\n` +
  `Stato: **${checksPassed ? "PASSED" : "FAILED"}** — nessuna scrittura eseguita.\n\n` +
  `- Backup: \`${backupPath}\`\n` +
  `- Manifest: \`${manifestPath}\`\n` +
  `- SHA-256 verificato: ${structuralChecks.sha256_matches ? "sì" : "no"}\n` +
  `- Riferimenti verificati: ${integrity.references_checked}\n` +
  `- Riferimenti mancanti: ${integrity.missing_references.length}\n` +
  `- Collisioni con contenuto identico: ${identicalCollisions}\n` +
  `- Collisioni divergenti: ${divergentCollisions}\n` +
  `- Righe che sarebbero inserite: ${wouldInsert}\n` +
  `- Righe live non presenti nel backup: ${liveRowsMissingFromBackup}\n\n` +
  `## Controlli strutturali\n\n` +
  Object.entries(structuralChecks)
    .map(([name, passed]) => `- ${passed ? "PASS" : "FAIL"}: \`${name}\``)
    .join("\n") +
  `\n\n## Collisioni\n\n` +
  `| Tabella | Backup | Identiche | Divergenti | Da inserire | Live non nel backup |\n` +
  `|---|---:|---:|---:|---:|---:|\n${collisionRows.join("\n")}\n\n` +
  `## Ordine di ripristino\n\n${restoreOrder}\n\n` +
  `## Procedura prevista, non eseguita\n\n` +
  `Il restore reale deve operare in transazione, inserire esplicitamente gli ID originali nell'ordine sopra indicato, usare \`OVERRIDING SYSTEM VALUE\` quando necessario, riallineare le sequence soltanto al termine e interrompersi per collisioni divergenti o riferimenti mancanti. Nessuna di queste operazioni è stata eseguita dal dry-run.\n`;

await fs.writeFile(reportPath, report, "utf8");
console.log(
  JSON.stringify(
    {
      report_path: reportPath,
      status: checksPassed ? "passed" : "failed",
      references_checked: integrity.references_checked,
      missing_references: integrity.missing_references.length,
      identical_collisions: identicalCollisions,
      divergent_collisions: divergentCollisions,
      would_insert: wouldInsert,
      live_rows_missing_from_backup: liveRowsMissingFromBackup,
    },
    null,
    2
  )
);

if (!checksPassed) process.exitCode = 1;
