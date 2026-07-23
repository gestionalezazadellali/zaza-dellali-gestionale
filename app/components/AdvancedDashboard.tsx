"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import GlobalSearchPage from "./GlobalSearchPage";
import {
  getCounterpartyNames,
  type CaseRecord,
} from "./CasesPage";

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
  cases,
  loading,
  onOpenCase,
  onOpenClient,
  onOpenCounterparty,
  onOpenSection,
}: {
  events: CalendarEvent[];
  cases: CaseRecord[];
  loading: boolean;
  onOpenCase: (caseId: number) => void;
  onOpenClient: (clientId: number) => void;
  onOpenCounterparty: (counterpartyId: number) => void;
  onOpenSection: (section: string) => void;
}) {
  const [updates, setUpdates] = useState<UpdateRecord[]>([]);
  const [message, setMessage] = useState("");
  const [showMobileDeadlines, setShowMobileDeadlines] = useState(false);
  const [showMobileHearings, setShowMobileHearings] = useState(false);
  const [showUpdates, setShowUpdates] = useState(false);

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
      ).map((item) => {
        const linkedCase = cases.find(
          (caseRecord) => caseRecord.id === item.case_id
        );
        return {
          id: `activity-${item.id}`,
          title: getCaseLabel(linkedCase) || item.title,
          detail:
            [item.title, item.description].filter(Boolean).join(" · ") ||
            item.activity_type?.replaceAll("_", " ") ||
            "Aggiornamento pratica",
          date: item.activity_at,
          caseId: item.case_id,
        };
      });

      const auditUpdates: UpdateRecord[] = (auditResult.data ?? []).map(
        (item) => {
          const linkedCase = findAuditCase(
            cases,
            item.entity_type,
            item.entity_id,
            item.new_data
          );
          return {
            id: `audit-${item.id}`,
            title:
              getCaseLabel(linkedCase) ||
              getAuditDisplayName(item.new_data) ||
              "Aggiornamento gestionale",
            detail: [
              auditTitle(item.action, item.entity_type),
              getAuditDisplayName(item.new_data),
            ]
              .filter(Boolean)
              .join(" · "),
            date: item.created_at,
            caseId: linkedCase?.id,
          };
        }
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
  }, [cases]);

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
    <div className="space-y-4">
      <GlobalSearchPage
        onOpenCase={onOpenCase}
        onOpenClient={onOpenClient}
        onOpenCounterparty={onOpenCounterparty}
        onOpenSection={onOpenSection}
        compact
      />

      <section className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="Prossime scadenze"
          mobileCollapsible
          open={showMobileDeadlines}
          onToggle={() => setShowMobileDeadlines((current) => !current)}
        >
          <EventList
            events={upcomingDeadlines}
            cases={cases}
            emptyText="Nessuna scadenza futura."
            onOpenCase={onOpenCase}
          />
        </Panel>

        <Panel
          title="Prossime udienze"
          mobileCollapsible
          open={showMobileHearings}
          onToggle={() => setShowMobileHearings((current) => !current)}
        >
          <EventList
            events={upcomingHearings}
            cases={cases}
            emptyText="Nessuna udienza futura."
            onOpenCase={onOpenCase}
          />
        </Panel>
      </section>

      <Panel
        title="Ultimi aggiornamenti"
        collapsible
        open={showUpdates}
        onToggle={() => setShowUpdates((current) => !current)}
      >
        {message && <p className="mb-3 text-sm text-amber-700">{message}</p>}
        {updates.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Nessun aggiornamento registrato.
          </p>
        ) : (
          <div className="grid gap-2 lg:grid-cols-2">
            {updates.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={!item.caseId}
                onClick={() => item.caseId && onOpenCase(item.caseId)}
                className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-left transition hover:bg-neutral-50 disabled:cursor-default"
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
  collapsible = false,
  mobileCollapsible = false,
  open = true,
  onToggle,
}: {
  title: string;
  children: React.ReactNode;
  collapsible?: boolean;
  mobileCollapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
}) {
  const canToggle = collapsible || mobileCollapsible;

  return (
    <article className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">{title}</h3>
        {canToggle && (
          <button
            type="button"
            onClick={onToggle}
            className={`rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs ${
              mobileCollapsible ? "md:hidden" : ""
            }`}
          >
            {open ? "Nascondi" : "Mostra"}
          </button>
        )}
      </div>
      <div
        className={`mt-3 ${
          open ? "block" : mobileCollapsible ? "hidden md:block" : "hidden"
        }`}
      >
        {children}
      </div>
    </article>
  );
}

function EventList({
  events,
  cases,
  emptyText,
  onOpenCase,
}: {
  events: CalendarEvent[];
  cases: CaseRecord[];
  emptyText: string;
  onOpenCase: (caseId: number) => void;
}) {
  if (events.length === 0) {
    return <p className="text-sm text-neutral-500">{emptyText}</p>;
  }

  return (
    <div className="max-h-[25rem] divide-y divide-neutral-100 overflow-y-auto pr-1">
      {events.map((event) => {
        const caseRecord = cases.find((item) => item.id === event.case_id);
        return (
          <button
            key={event.id}
            type="button"
            disabled={!event.case_id}
            onClick={() => event.case_id && onOpenCase(event.case_id)}
            className="grid w-full grid-cols-[3.2rem_1fr_auto] items-center gap-3 px-1 py-3 text-left transition hover:bg-neutral-50 disabled:cursor-default"
          >
            <DateBlock value={event.start_at} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {getCaseLabel(caseRecord) || event.title}
              </p>
              <p className="mt-0.5 truncate text-xs text-neutral-500">
                {event.description || event.title}
              </p>
            </div>
            <span className="text-xs font-medium text-neutral-600">
              {formatTime(event.start_at)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function getCaseLabel(caseRecord?: CaseRecord) {
  if (!caseRecord) return "";
  const contact = Array.isArray(caseRecord.contacts)
    ? caseRecord.contacts[0]
    : caseRecord.contacts;
  const claimant =
    contact?.display_name ||
    caseRecord.claimant_name_raw ||
    caseRecord.title ||
    "Parte";
  const defendant =
    getCounterpartyNames(caseRecord).join(", ") ||
    caseRecord.defendant_name_raw ||
    "Controparte";
  return `${claimant} c. ${defendant}`;
}

function findAuditCase(
  cases: CaseRecord[],
  entityType: string | null,
  entityId: string | number | null,
  newData: unknown
) {
  const record =
    newData && typeof newData === "object"
      ? (newData as Record<string, unknown>)
      : {};
  const directCaseId = Number(
    record.case_id ||
      (entityType === "cases" || entityType === "case" ? entityId : 0)
  );
  if (directCaseId) {
    return cases.find((item) => item.id === directCaseId);
  }

  const numericEntityId = Number(entityId || 0);
  if (
    numericEntityId &&
    ["contacts", "contact", "clients", "client"].includes(entityType || "")
  ) {
    return cases.find((item) => item.client_contact_id === numericEntityId);
  }
  if (
    numericEntityId &&
    ["counterparties", "counterparty"].includes(entityType || "")
  ) {
    return cases.find((item) => item.counterparty_id === numericEntityId);
  }
  return undefined;
}

function DateBlock({ value }: { value: string }) {
  const date = new Date(value);
  return (
    <span className="text-center">
      <span className="block text-lg font-semibold leading-none">
        {new Intl.DateTimeFormat("it-IT", { day: "2-digit" }).format(date)}
      </span>
      <span className="mt-1 block text-[10px] font-medium uppercase text-neutral-500">
        {new Intl.DateTimeFormat("it-IT", { month: "short" })
          .format(date)
          .replace(".", "")}
      </span>
    </span>
  );
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
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
