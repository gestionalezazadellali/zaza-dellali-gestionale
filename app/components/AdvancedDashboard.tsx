"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import GlobalSearchPage from "./GlobalSearchPage";

type CalendarEvent = {
  id: number;
  title: string;
  description?: string | null;
  start_at: string;
  is_hearing: boolean;
  is_deadline: boolean;
  status?: string | null;
  case_id: number | null;
};

type UpdateRecord = {
  id: string;
  title: string;
  detail: string;
  date: string;
  caseId?: number;
};

export default function AdvancedDashboard({
  events,
  loading,
  onOpenCase,
  onOpenClient,
  onOpenCounterparty,
  onOpenSection,
}: {
  events: CalendarEvent[];
  loading: boolean;
  onOpenCase: (caseId: number) => void;
  onOpenClient: (clientId: number) => void;
  onOpenCounterparty: (counterpartyId: number) => void;
  onOpenSection: (section: string) => void;
}) {
  const [updates, setUpdates] = useState<UpdateRecord[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadUpdates() {
      const [activitiesResult, auditResult] = await Promise.all([
        supabase
          .from("case_activities")
          .select("id, case_id, activity_type, title, description, activity_at")
          .order("activity_at", { ascending: false })
          .limit(15),
        supabase
          .from("audit_log")
          .select("id, action, entity_type, entity_id, new_data, created_at")
          .order("created_at", { ascending: false })
          .limit(15),
      ]);

      if (activitiesResult.error && auditResult.error) {
        setMessage("Gli ultimi aggiornamenti non sono momentaneamente disponibili.");
        return;
      }

      const activityUpdates: UpdateRecord[] = (
        activitiesResult.data ?? []
      ).map((item) => ({
        id: `activity-${item.id}`,
        title: item.title,
        detail:
          item.description ||
          item.activity_type?.replaceAll("_", " ") ||
          "Aggiornamento pratica",
        date: item.activity_at,
        caseId: item.case_id,
      }));

      const auditUpdates: UpdateRecord[] = (auditResult.data ?? []).map(
        (item) => ({
          id: `audit-${item.id}`,
          title: auditTitle(item.action, item.entity_type),
          detail:
            getAuditDisplayName(item.new_data) ||
            `${item.entity_type || "elemento"} ${item.entity_id || ""}`.trim(),
          date: item.created_at,
        })
      );

      setUpdates(
        [...activityUpdates, ...auditUpdates]
          .sort(
            (a, b) =>
              new Date(b.date).getTime() - new Date(a.date).getTime()
          )
          .slice(0, 10)
      );
    }

    void loadUpdates();
  }, []);

  const now = Date.now();
  const upcomingHearings = useMemo(
    () =>
      events
        .filter(
          (event) =>
            event.is_hearing &&
            !event.is_deadline &&
            new Date(event.start_at).getTime() >= now
        )
        .sort(
          (a, b) =>
            new Date(a.start_at).getTime() -
            new Date(b.start_at).getTime()
        )
        .slice(0, 15),
    [events, now]
  );

  const upcomingDeadlines = useMemo(
    () =>
      events
        .filter(
          (event) =>
            event.is_deadline &&
            event.status !== "completato" &&
            new Date(event.start_at).getTime() >= now
        )
        .sort(
          (a, b) =>
            new Date(a.start_at).getTime() -
            new Date(b.start_at).getTime()
        )
        .slice(0, 15),
    [events, now]
  );

  if (loading) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-8">
        Caricamento Dashboard...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <GlobalSearchPage
        onOpenCase={onOpenCase}
        onOpenClient={onOpenClient}
        onOpenCounterparty={onOpenCounterparty}
        onOpenSection={onOpenSection}
      />

      <section className="grid gap-6 xl:grid-cols-2">
        <Panel title={`Prossime udienze (${upcomingHearings.length})`}>
          <EventList
            events={upcomingHearings}
            emptyText="Nessuna udienza futura."
            onOpenCase={onOpenCase}
          />
        </Panel>

        <Panel title={`Prossime scadenze (${upcomingDeadlines.length})`}>
          <EventList
            events={upcomingDeadlines}
            emptyText="Nessuna scadenza futura."
            onOpenCase={onOpenCase}
          />
        </Panel>
      </section>

      <Panel title="Ultimi aggiornamenti">
        {message && <p className="mb-3 text-sm text-amber-700">{message}</p>}
        {updates.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Nessun aggiornamento registrato.
          </p>
        ) : (
          <div className="space-y-3">
            {updates.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={!item.caseId}
                onClick={() => item.caseId && onOpenCase(item.caseId)}
                className="w-full rounded-xl border border-neutral-200 p-4 text-left disabled:cursor-default"
              >
                <div className="flex flex-col justify-between gap-1 sm:flex-row">
                  <span className="font-medium">{item.title}</span>
                  <span className="text-xs text-neutral-500">
                    {formatDateTime(item.date)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-neutral-600">{item.detail}</p>
              </button>
            ))}
          </div>
        )}
      </Panel>
    </div>
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

function EventList({
  events,
  emptyText,
  onOpenCase,
}: {
  events: CalendarEvent[];
  emptyText: string;
  onOpenCase: (caseId: number) => void;
}) {
  if (events.length === 0) {
    return <p className="text-sm text-neutral-500">{emptyText}</p>;
  }

  return (
    <div className="max-h-[32rem] space-y-3 overflow-y-auto pr-1">
      {events.map((event) => (
        <button
          key={event.id}
          type="button"
          disabled={!event.case_id}
          onClick={() => event.case_id && onOpenCase(event.case_id)}
          className="w-full rounded-xl border border-neutral-200 p-4 text-left disabled:cursor-default"
        >
          <p className="font-medium">{event.title}</p>
          <p className="mt-1 text-sm text-neutral-500">
            {formatDateTime(event.start_at)}
          </p>
          {event.description && (
            <p className="mt-1 text-sm text-neutral-600">
              {event.description}
            </p>
          )}
        </button>
      ))}
    </div>
  );
}

function auditTitle(action: string | null, entityType: string | null) {
  const actionLabel =
    action === "insert"
      ? "Creato"
      : action === "update"
        ? "Modificato"
        : action === "delete"
          ? "Eliminato"
          : action || "Aggiornato";
  return `${actionLabel} ${entityType || "elemento"}`.replaceAll("_", " ");
}

function getAuditDisplayName(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  for (const key of ["display_name", "title", "name", "invoice_number"]) {
    if (typeof record[key] === "string" && record[key]) {
      return String(record[key]);
    }
  }
  return "";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
