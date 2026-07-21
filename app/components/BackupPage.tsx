"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type BackupSettings = {
  id: number;
  studio_id: string;
  enabled: boolean;
  provider: string;
  google_account: string | null;
  drive_folder_id: string | null;
  drive_folder_name: string | null;
  backup_time: string;
  timezone: string;
  retain_daily: number;
  retain_weekly: number;
  retain_monthly: number;
  encryption_enabled: boolean;
  last_successful_backup_at: string | null;
  last_backup_status: string | null;
};

type BackupRun = {
  id: number;
  backup_type: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  drive_file_name: string | null;
  size_bytes: number | null;
  error_message: string | null;
};

export default function BackupPage({
  studioId,
}: {
  studioId: string;
}) {
  const [settings, setSettings] = useState<BackupSettings | null>(null);
  const [runs, setRuns] = useState<BackupRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [message, setMessage] = useState("");

  async function loadBackupData() {
    setLoading(true);
    setMessage("");

    const [settingsResult, runsResult] = await Promise.all([
      supabase
        .from("backup_settings")
        .select(
          "id, studio_id, enabled, provider, google_account, drive_folder_id, drive_folder_name, backup_time, timezone, retain_daily, retain_weekly, retain_monthly, encryption_enabled, last_successful_backup_at, last_backup_status"
        )
        .eq("studio_id", studioId)
        .single(),

      supabase
        .from("backup_runs")
        .select(
          "id, backup_type, status, started_at, completed_at, drive_file_name, size_bytes, error_message"
        )
        .eq("studio_id", studioId)
        .order("started_at", { ascending: false })
        .limit(30),
    ]);

    if (settingsResult.error && settingsResult.error.code !== "PGRST116") {
      setMessage(`Errore impostazioni: ${settingsResult.error.message}`);
      setLoading(false);
      return;
    }

    if (runsResult.error) {
      setMessage(`Errore storico: ${runsResult.error.message}`);
      setLoading(false);
      return;
    }

    setSettings((settingsResult.data ?? null) as BackupSettings | null);
    setRuns((runsResult.data ?? []) as BackupRun[]);
    setLoading(false);
  }

  useEffect(() => {
    if (studioId) {
      loadBackupData();
    }
  }, [studioId]);

  function updateSetting<K extends keyof BackupSettings>(
    field: K,
    value: BackupSettings[K]
  ) {
    setSettings((current) =>
      current ? { ...current, [field]: value } : current
    );
  }

  async function saveSettings() {
    if (!settings) return;

    setSaving(true);
    setMessage("");

    const { error } = await supabase
      .from("backup_settings")
      .update({
        enabled: settings.enabled,
        google_account: settings.google_account,
        drive_folder_name: settings.drive_folder_name,
        backup_time: settings.backup_time,
        timezone: settings.timezone,
        retain_daily: settings.retain_daily,
        retain_weekly: settings.retain_weekly,
        retain_monthly: settings.retain_monthly,
        encryption_enabled: settings.encryption_enabled,
      })
      .eq("id", settings.id);

    if (error) {
      setMessage(`Errore: ${error.message}`);
      setSaving(false);
      return;
    }

    setMessage("Impostazioni backup salvate.");
    setSaving(false);
  }

  async function createManualBackup() {
    setCreatingBackup(true);
    setMessage("");

    const start = new Date();

    const { data: run, error: runError } = await supabase
      .from("backup_runs")
      .insert({
        studio_id: studioId,
        backup_type: "manuale",
        status: "in_corso",
        started_at: start.toISOString(),
      })
      .select("id")
      .single();

    if (runError || !run) {
      setMessage(
        `Errore avvio backup: ${runError?.message ?? "record non creato"}`
      );
      setCreatingBackup(false);
      return;
    }

    try {
      const tableNames = [
        "studios",
        "profiles",
        "user_permissions",
        "contacts",
        "counterparties",
        "cases",
        "events",
        "hearing_updates",
        "case_activities",
        "case_documents",
        "case_titles",
        "enforcement_actions",
        "invoices",
        "payments",
        "backup_settings",
      ];

      const backup: Record<string, unknown[]> = {};

      for (const table of tableNames) {
        const { data, error } = await supabase.from(table).select("*");

        if (error) {
          throw new Error(`${table}: ${error.message}`);
        }

        backup[table] = data ?? [];
      }

      const payload = {
        application: "ZAZA DELL’ALI STUDIO LEGALE",
        generated_at: new Date().toISOString(),
        studio_id: studioId,
        data: backup,
      };

      const content = JSON.stringify(payload, null, 2);
      const blob = new Blob([content], {
        type: "application/json;charset=utf-8",
      });

      const fileName = `zaza-dellali-backup-${formatFileDate(
        new Date()
      )}.json`;

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      const completedAt = new Date().toISOString();

      await supabase
        .from("backup_runs")
        .update({
          status: "completato",
          completed_at: completedAt,
          drive_file_name: fileName,
          size_bytes: blob.size,
        })
        .eq("id", run.id);

      await supabase
        .from("backup_settings")
        .update({
          last_successful_backup_at: completedAt,
          last_backup_status: "completato",
        })
        .eq("studio_id", studioId);

      setMessage(
        "Backup manuale creato e scaricato sul Mac. Il caricamento automatico su Google Drive sarà attivato dopo la pubblicazione online."
      );
      await loadBackupData();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Errore imprevisto";

      await supabase
        .from("backup_runs")
        .update({
          status: "errore",
          completed_at: new Date().toISOString(),
          error_message: errorMessage,
        })
        .eq("id", run.id);

      setMessage(`Backup non riuscito: ${errorMessage}`);
    } finally {
      setCreatingBackup(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-8">
        Caricamento backup...
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
        Configurazione backup non trovata.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Backup automatico"
          value={settings.enabled ? "Attivo" : "Disattivato"}
        />
        <SummaryCard
          label="Orario"
          value={settings.backup_time?.slice(0, 5) || "21:00"}
        />
        <SummaryCard
          label="Account Google"
          value={settings.google_account || "Non collegato"}
        />
        <SummaryCard
          label="Ultimo backup"
          value={formatDateTime(settings.last_successful_backup_at)}
        />
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-xl font-semibold">Configurazione backup</h3>
            <p className="mt-1 text-sm text-neutral-500">
              Conservazione locale e predisposizione Google Drive.
            </p>
          </div>

          <button
            type="button"
            onClick={createManualBackup}
            disabled={creatingBackup}
            className="rounded-xl bg-neutral-900 px-4 py-3 text-sm text-white disabled:opacity-50"
          >
            {creatingBackup
              ? "Creazione backup..."
              : "Crea backup manuale"}
          </button>
        </div>

        {message && (
          <div className="mt-5 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm">
            {message}
          </div>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-3 rounded-xl border border-neutral-300 px-4 py-3">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(event) =>
                updateSetting("enabled", event.target.checked)
              }
            />
            Backup automatico attivo
          </label>

          <label className="flex items-center gap-3 rounded-xl border border-neutral-300 px-4 py-3">
            <input
              type="checkbox"
              checked={settings.encryption_enabled}
              onChange={(event) =>
                updateSetting(
                  "encryption_enabled",
                  event.target.checked
                )
              }
            />
            Cifratura backup attiva
          </label>

          <Input
            label="Account Google Drive"
            value={settings.google_account ?? ""}
            onChange={(value) =>
              updateSetting("google_account", value || null)
            }
          />

          <Input
            label="Cartella Google Drive"
            value={settings.drive_folder_name ?? ""}
            onChange={(value) =>
              updateSetting("drive_folder_name", value || null)
            }
          />

          <Input
            label="Orario giornaliero"
            type="time"
            value={settings.backup_time?.slice(0, 5) || "21:00"}
            onChange={(value) => updateSetting("backup_time", value)}
          />

          <Input
            label="Fuso orario"
            value={settings.timezone}
            onChange={(value) => updateSetting("timezone", value)}
          />

          <NumberInput
            label="Backup giornalieri da conservare"
            value={settings.retain_daily}
            onChange={(value) => updateSetting("retain_daily", value)}
          />

          <NumberInput
            label="Backup settimanali da conservare"
            value={settings.retain_weekly}
            onChange={(value) => updateSetting("retain_weekly", value)}
          />

          <NumberInput
            label="Backup mensili da conservare"
            value={settings.retain_monthly}
            onChange={(value) => updateSetting("retain_monthly", value)}
          />
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={saveSettings}
            disabled={saving}
            className="rounded-xl bg-neutral-900 px-5 py-3 text-sm text-white disabled:opacity-50"
          >
            {saving ? "Salvataggio..." : "Salva impostazioni"}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div>
          <h3 className="text-xl font-semibold">Storico backup</h3>
          <p className="mt-1 text-sm text-neutral-500">
            Ultime trenta operazioni registrate.
          </p>
        </div>

        <div className="mt-6 space-y-3">
          {runs.length === 0 ? (
            <p className="text-sm text-neutral-500">
              Nessun backup ancora registrato.
            </p>
          ) : (
            runs.map((run) => (
              <article
                key={run.id}
                className="rounded-xl border border-neutral-200 p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium capitalize">
                        Backup {run.backup_type.replaceAll("_", " ")}
                      </p>
                      <StatusBadge status={run.status} />
                    </div>

                    <p className="mt-2 text-sm text-neutral-500">
                      Avvio: {formatDateTime(run.started_at)}
                    </p>

                    {run.drive_file_name && (
                      <p className="mt-1 text-sm text-neutral-500">
                        File: {run.drive_file_name}
                      </p>
                    )}

                    {run.error_message && (
                      <p className="mt-2 text-sm text-red-700">
                        {run.error_message}
                      </p>
                    )}
                  </div>

                  <div className="text-sm text-neutral-500">
                    {formatSize(run.size_bytes)}
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        <p className="font-semibold">Attivazione automatica su Drive</p>
        <p className="mt-2">
          L’esecuzione quotidiana alle 21:00, anche ad app chiusa, richiede
          che l’app sia pubblicata su un server. In quella fase collegheremo
          il progetto Google OAuth e programmeremo il processo automatico.
        </p>
      </section>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <p className="text-sm text-neutral-500">{label}</p>
      <p className="mt-3 break-words text-xl font-semibold">{value}</p>
    </article>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-neutral-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-neutral-300 px-4 py-3"
      />
    </label>
  );
}

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-neutral-500">{label}</span>
      <input
        type="number"
        min="1"
        value={value}
        onChange={(event) => onChange(Number(event.target.value || 1))}
        className="w-full rounded-xl border border-neutral-300 px-4 py-3"
      />
    </label>
  );
}

function StatusBadge({ status }: { status: string }) {
  const className =
    status === "completato"
      ? "bg-green-100 text-green-800"
      : status === "errore"
        ? "bg-red-100 text-red-800"
        : "bg-amber-100 text-amber-800";

  return (
    <span
      className={`rounded-full px-3 py-1 text-xs capitalize ${className}`}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

function formatDateTime(value: string | null) {
  if (!value) return "Mai eseguito";

  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatSize(value: number | null) {
  if (!value) return "";

  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatFileDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}_${hours}-${minutes}`;
}