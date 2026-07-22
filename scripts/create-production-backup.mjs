import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import {
  createCompleteBackup,
  projectRefFromUrl,
} from "../lib/backup.ts";

process.loadEnvFile(path.resolve(".env.local"));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const studioId = process.argv[2];
const outputDirectory = path.resolve(
  process.argv[3] ?? "backups/production-pre-phase-a"
);

if (!supabaseUrl || !serviceRoleKey || !studioId) {
  throw new Error(
    "Uso: node --experimental-strip-types scripts/create-production-backup.mjs <studio-id> [output-dir]."
  );
}

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const bundle = await createCompleteBackup(client, {
  studioId,
  projectRef: projectRefFromUrl(supabaseUrl),
});

await fs.mkdir(outputDirectory, { recursive: true });
const backupPath = path.join(outputDirectory, bundle.fileName);
const sha256Path = `${backupPath}.sha256`;
const manifestPath = path.join(outputDirectory, "backup_manifest.json");
const integrityReportPath = path.join(
  outputDirectory,
  "backup_integrity_report.md"
);

await fs.writeFile(backupPath, bundle.content, "utf8");
await fs.writeFile(sha256Path, bundle.sha256Content, "utf8");
await fs.writeFile(manifestPath, bundle.manifestContent, "utf8");
await fs.writeFile(
  integrityReportPath,
  bundle.integrityReportContent,
  "utf8"
);

const rereadContent = await fs.readFile(backupPath, "utf8");
if (rereadContent !== bundle.content) {
  throw new Error("Il backup riletto dal disco non coincide con il contenuto verificato.");
}

console.log(
  JSON.stringify(
    {
      backup_path: backupPath,
      sha256_path: sha256Path,
      manifest_path: manifestPath,
      integrity_report_path: integrityReportPath,
      size_bytes: Buffer.byteLength(bundle.content, "utf8"),
      sha256: bundle.sha256,
      integrity_status: bundle.manifest.integrity.status,
      references_checked: bundle.manifest.integrity.references_checked,
      table_counts: Object.fromEntries(
        Object.entries(bundle.manifest.tables).map(([table, summary]) => [
          table,
          summary.record_count,
        ])
      ),
    },
    null,
    2
  )
);
