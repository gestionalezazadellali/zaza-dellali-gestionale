"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type DashboardCounts = {
  contacts: number;
  cases: number;
  hearings: number;
  deadlines: number;
};

type CalendarEvent = {
  id: number;
  title: string;
  start_at: string;
  is_hearing: boolean;
  is_deadline: boolean;
  case_id: number | null;
};

type CaseStatusRow = {
  status: string | null;
};

type InvoiceRow = {
  total_amount: number;
  paid_amount: number;
  status: string;
};

type TitleRow = {
  payment_status: string;
  legal_costs: number;
  principal_amount: number;
};

type BackupSettingsRow = {
  enabled: boolean;
  last_successful_backup_at: string | null;
  last_backup_status: string | null;
};

export default function AdvancedDashboard({
  counts,
  events,
  loading,
}: {
  counts: DashboardCounts;
  events: CalendarEvent[];
  loading: boolean;
}) {
  const [caseRows, setCaseRows] = useState<CaseStatusRow[]>([]);
  const [invoiceRows, setInvoiceRows] = useState<InvoiceRow[]>([]);
  const [titleRows, setTitleRows] = useState<TitleRow[]>([]);
  const [backup, setBackup] = useState<BackupSettingsRow | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadAdvancedData() {
      const [casesResult, invoicesResult, titlesResult, backupResult] =
        await Promise.all([
          supabase.from("cases").select("status"),
          supabase
            .from("invoices")
            .select("total_amount, paid_amount, status"),
          supabase
            .from("case_titles")
            .select("payment_status, legal_costs, principal_amount"),
          supabase
            .from("backup_settings")
            .select(
              "enabled, last_successful_backup_at, last_backup_status"
            )
            .single(),
        ]);

      const error =
        casesResult.error ||
        invoicesResult.error ||
        titlesResult.error ||
        backupResult.error;

      if (error) {
        setMessage(error.message);
        return;
      }

      setCaseRows((casesResult.data ?? []) as CaseStatusRow[]);
      setInvoiceRows((invoicesResult.data ?? []) as InvoiceRow[]);
      setTitleRows((titlesResult.data ?? []) as TitleRow[]);
      setBackup((backupResult.data ?? null) as BackupSettingsRow | null);
    }

    loadAdvancedData();
  }, []);

  const upcomingHearings = useMemo(
    () =>
      events
        .filter(
          (event) =>
            event.is_hearing && new Date(event.start_at) >= new Date()
        )
        .slice(0, 5),
    [events]
  );

  const upcomingDeadlines = useMemo(
    () =>
      events
        .filter(
          (event) =>
            event.is_deadline && new Date(event.start_at) >= new Date()
        )
        .slice(0, 5),
    [events]
  );

  const outstandingInvoices = useMemo(
    () =>
      invoiceRows.reduce(
        (sum, item) =>
          sum +
          Math.max(
            Number(item.total_amount || 0) -
              Number(item.paid_amount || 0),
            0
          ),
        0
      ),
    [invoiceRows]
  );

  const unpaidTitles = useMemo(
    () =>
      titleRows.filter(
        (item) => item.payment_status !== "pagato"
      ).length,
    [titleRows]
  );

  const casesByStatus = useMemo(() => {
    const map = new Map<string, number>();

    for (const item of caseRows) {
      const key = item.status || "non_indicato";
      map.set(key, (map.get(key) ?? 0) + 1);
    }

    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [caseRows]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-8">
        Caricamento Dashboard...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {message && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Alcuni dati avanzati non sono disponibili: {message}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Clienti" value={String(counts.contacts)} />
        <MetricCard label="Pratiche" value={String(counts.cases)} />
        <MetricCard
          label="Da incassare"
          value={formatMoney(outstandingInvoices)}
        />
        <MetricCard
          label="Provvedimenti non pagati"
          value={String(unpaidTitles)}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <Panel title="Prossime udienze">
          <EventList events={upcomingHearings} />
        </Panel>

        <Panel title="Prossime scadenze">
          <EventList events={upcomingDeadlines} />
        </Panel>

        <Panel title="Backup">
          <div className="space-y-3">
            <InfoRow
              label="Stato"
              value={backup?.enabled ? "Attivo" : "Disattivato"}
            />
            <InfoRow
              label="Ultimo esito"
              value={
                backup?.last_backup_status?.replaceAll("_", " ") ||
                "Mai eseguito"
              }
            />
            <InfoRow
              label="Ultima copia"
              value={formatDateTime(
                backup?.last_successful_backup_at ?? null
              )}
            />
          </div>
        </Panel>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="Pratiche per stato">
          <div className="space-y-3">
            {casesByStatus.length === 0 ? (
              <p className="text-sm text-neutral-500">
                Nessun dato disponibile.
              </p>
            ) : (
              casesByStatus.map(([status, total]) => {
                const percentage =
                  counts.cases > 0
                    ? Math.round((total / counts.cases) * 100)
                    : 0;

                return (
                  <div key={status}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="capitalize">
                        {status.replaceAll("_", " ")}
                      </span>
                      <span className="font-medium">{total}</span>
                    </div>

                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-100">
                      <div
                        className="h-full rounded-full bg-neutral-900"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Panel>

        <Panel title="Riepilogo operativo">
          <div className="space-y-3">
            <InfoRow
              label="Udienze complessive"
              value={String(counts.hearings)}
            />
            <InfoRow
              label="Scadenze complessive"
              value={String(counts.deadlines)}
            />
            <InfoRow
              label="Fatture aperte"
              value={String(
                invoiceRows.filter(
                  (item) => item.status !== "saldata"
                ).length
              )}
            />
            <InfoRow
              label="Provvedimenti inseriti"
              value={String(titleRows.length)}
            />
          </div>
        </Panel>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <article className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <p className="text-sm text-neutral-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold">{value}</p>
    </article>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold">{title}</h3>
      <div className="mt-5">{children}</div>
    </article>
  );
}

function EventList({ events }: { events: CalendarEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        Nessun evento futuro.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {events.map((event) => (
        <div
          key={event.id}
          className="rounded-xl border border-neutral-200 p-4"
        >
          <p className="font-medium">{event.title}</p>
          <p className="mt-1 text-sm text-neutral-500">
            {formatDateTime(event.start_at)}
          </p>
        </div>
      ))}
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-neutral-100 pb-3 last:border-0 last:pb-0">
      <span className="text-sm text-neutral-500">{label}</span>
      <span className="text-right text-sm font-medium capitalize">
        {value}
      </span>
    </div>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(Number(value || 0));
}

function formatDateTime(value: string | null) {
  if (!value) return "Non disponibile";

  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}