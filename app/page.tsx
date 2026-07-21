"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import itLocale from "@fullcalendar/core/locales/it";
import type { EventClickArg } from "@fullcalendar/core";

import { supabase } from "../lib/supabase";
import ClientsPage, {
  type ClientCase,
  type ClientRecord,
} from "./components/ClientsPage";
import CasesPage, {
  type CaseRecord,
  type ClientOption,
  type CounterpartyOption,
} from "./components/CasesPage";
import CaseDetail, {
  type CalendarEvent as CaseDetailEvent,
} from "./components/CaseDetail";
import BillingPage from "./components/BillingPage";
import UsersPage from "./components/UsersPage";
import BackupPage from "./components/BackupPage";
import AdvancedDashboard from "./components/AdvancedDashboard";
import GlobalSearchPage from "./components/GlobalSearchPage";

type DashboardCounts = {
  contacts: number;
  cases: number;
  hearings: number;
  deadlines: number;
};

type CalendarEvent = {
  id: number;
  title: string;
  event_type: string | null;
  description: string | null;
  start_at: string;
  end_at: string | null;
  is_hearing: boolean;
  is_deadline: boolean;
  status: string | null;
  case_id: number | null;
};

type SelectedEvent = {
  title: string;
  date: string;
  type: string;
  caseId: number | null;
};

const menuItems = [
  "Dashboard",
  "Ricerca",
  "Calendario",
  "Clienti",
  "Pratiche",
  "Udienze",
  "Scadenze",
  "Fatture",
  "Documenti",
  "Utenti",
  "Backup",
  "Impostazioni",
];

export default function Home() {
  const [sessionChecked, setSessionChecked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginMessage, setLoginMessage] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [activeSection, setActiveSection] = useState("Dashboard");
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [studioId, setStudioId] = useState("");
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [counterparties, setCounterparties] = useState<
    CounterpartyOption[]
  >([]);

  const [counts, setCounts] = useState<DashboardCounts>({
    contacts: 0,
    cases: 0,
    hearings: 0,
    deadlines: 0,
  });

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<SelectedEvent | null>(
    null
  );
  const [selectedCase, setSelectedCase] = useState<CaseRecord | null>(null);

  useEffect(() => {
    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      setIsLoggedIn(Boolean(session));
      setSessionChecked(true);

      if (session) {
        setUserEmail(session.user.email ?? "");
      }
    }

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(Boolean(session));
      setUserEmail(session?.user.email ?? "");

      if (!session) {
        setActiveSection("Dashboard");
        setSelectedCase(null);
        setSelectedEvent(null);
        setClients([]);
        setCases([]);
        setCounterparties([]);
        setEvents([]);
        setStudioId("");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadClients() {
    const { data, error } = await supabase
      .from("contacts")
      .select(
        `
          id,
          contact_type,
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
          needs_review
        `
      )
      .order("display_name", { ascending: true });

    if (error) throw error;
    setClients((data ?? []) as ClientRecord[]);
  }

  async function loadCounterparties() {
    const { data, error } = await supabase
      .from("counterparties")
      .select("id, name")
      .order("name", { ascending: true });

    if (error) throw error;
    setCounterparties((data ?? []) as CounterpartyOption[]);
  }

  async function loadCases() {
    const { data, error } = await supabase
      .from("cases")
      .select(
        `
          id,
          client_contact_id,
          counterparty_id,
          title,
          case_type,
          claimant_name_raw,
          defendant_name_raw,
          court_type,
          court_city,
          section,
          rg_number,
          judge_name,
          status,
          responsible_user_id,
          opening_date,
          closing_date,
          description,
          notes,
          needs_review,
          contacts (
            display_name,
            email,
            phone
          ),
          counterparties (
            name
          )
        `
      )
      .order("id", { ascending: false });

    if (error) throw error;
    setCases((data ?? []) as CaseRecord[]);
  }

  async function loadCounts() {
    const [
      contactsResult,
      casesResult,
      hearingsResult,
      deadlinesResult,
    ] = await Promise.all([
      supabase.from("contacts").select("*", { count: "exact", head: true }),
      supabase.from("cases").select("*", { count: "exact", head: true }),
      supabase
        .from("events")
        .select("*", { count: "exact", head: true })
        .eq("is_hearing", true),
      supabase
        .from("events")
        .select("*", { count: "exact", head: true })
        .eq("is_deadline", true),
    ]);

    const error =
      contactsResult.error ||
      casesResult.error ||
      hearingsResult.error ||
      deadlinesResult.error;

    if (error) throw error;

    setCounts({
      contacts: contactsResult.count ?? 0,
      cases: casesResult.count ?? 0,
      hearings: hearingsResult.count ?? 0,
      deadlines: deadlinesResult.count ?? 0,
    });
  }

  async function loadEvents() {
    const { data, error } = await supabase
      .from("events")
      .select(
        "id, title, event_type, description, start_at, end_at, is_hearing, is_deadline, status, case_id"
      )
      .order("start_at", { ascending: true });

    if (error) throw error;
    setEvents((data ?? []) as CalendarEvent[]);
  }

  async function refreshAllData() {
    setErrorMessage("");

    try {
      await Promise.all([
        loadClients(),
        loadCounterparties(),
        loadCases(),
        loadCounts(),
        loadEvents(),
      ]);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Errore durante l’aggiornamento dei dati."
      );
    }
  }

  useEffect(() => {
    if (!isLoggedIn) return;

    async function loadApplicationData() {
      setLoading(true);
      setErrorMessage("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setErrorMessage("Impossibile identificare l’utente autenticato.");
        setLoading(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("studio_id")
        .eq("id", user.id)
        .single();

      if (profileError) {
        setErrorMessage(profileError.message);
        setLoading(false);
        return;
      }

      setStudioId(profile?.studio_id ?? "");
      await refreshAllData();
      setLoading(false);
    }

    loadApplicationData();
  }, [isLoggedIn]);

  const upcomingEvents = useMemo(
    () =>
      events
        .filter((event) => new Date(event.start_at) >= new Date())
        .slice(0, 8),
    [events]
  );

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginLoading(true);
    setLoginMessage("Accesso in corso...");

    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    });

    setLoginMessage(
      error ? `Accesso non riuscito: ${error.message}` : ""
    );
    setLoginLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  function formatEventDate(value: string) {
    return new Intl.DateTimeFormat("it-IT", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  }

  function handleCalendarEventClick(info: EventClickArg) {
    setSelectedEvent({
      title: info.event.title,
      date: info.event.start
        ? formatEventDate(info.event.start.toISOString())
        : "Data non disponibile",
      type: (info.event.extendedProps.type as string | null) ?? "Evento",
      caseId: info.event.extendedProps.caseId as number | null,
    });
  }

  function openCaseById(caseId: number) {
    const foundCase = cases.find((item) => item.id === caseId);

    if (!foundCase) {
      setErrorMessage(`Pratica n. ${caseId} non trovata.`);
      return;
    }

    setSelectedCase(foundCase);
    setSelectedEvent(null);
    setActiveSection("Pratiche");
  }

  if (!sessionChecked) {
    return (
      <main className="grid min-h-screen place-items-center bg-neutral-950 text-white">
        Verifica sessione...
      </main>
    );
  }

  if (!isLoggedIn) {
    return (
      <LoginPage
        email={loginEmail}
        password={loginPassword}
        message={loginMessage}
        loading={loginLoading}
        onEmailChange={setLoginEmail}
        onPasswordChange={setLoginPassword}
        onSubmit={handleLogin}
      />
    );
  }

  return (
    <main className="min-h-screen bg-neutral-100 text-neutral-900">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 flex-col border-r border-neutral-200 bg-white lg:flex">
          <div className="border-b border-neutral-200 px-6 py-6">
            <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
              Studio Legale
            </p>
            <h1 className="mt-2 text-xl font-semibold">Zaza Dell’Ali</h1>
          </div>

          <nav className="flex-1 space-y-1 p-4">
            {menuItems.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setActiveSection(item);
                  if (item !== "Pratiche") setSelectedCase(null);
                }}
                className={`w-full rounded-xl px-4 py-3 text-left text-sm transition ${
                  activeSection === item
                    ? "bg-neutral-900 text-white"
                    : "text-neutral-700 hover:bg-neutral-100"
                }`}
              >
                {item}
              </button>
            ))}
          </nav>

          <div className="border-t border-neutral-200 p-4">
            <p className="truncate text-xs text-neutral-500">{userEmail}</p>
            <button
              type="button"
              onClick={handleLogout}
              className="mt-3 w-full rounded-xl border border-neutral-300 px-4 py-2 text-sm"
            >
              Esci
            </button>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="border-b border-neutral-200 bg-white px-6 py-5">
            <p className="text-sm text-neutral-500">Gestionale dello studio</p>
            <h2 className="text-2xl font-semibold">{activeSection}</h2>
          </header>

          <div className="p-6">
            {errorMessage && (
              <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {errorMessage}
              </div>
            )}

            {activeSection === "Dashboard" && (
              <AdvancedDashboard
                loading={loading}
                counts={counts}
                events={events}
              />
            )}

            {activeSection === "Ricerca" && (
              <GlobalSearchPage
                onOpenCase={openCaseById}
                onOpenSection={setActiveSection}
              />
            )}

            {activeSection === "Calendario" && (
              <CalendarPage
                events={events}
                onEventClick={handleCalendarEventClick}
              />
            )}

            {activeSection === "Clienti" && (
              <ClientsPage
                clients={clients}
                cases={cases as ClientCase[]}
                studioId={studioId}
                onClientsChanged={refreshAllData}
                onOpenCase={openCaseById}
              />
            )}

            {activeSection === "Fatture" && (
              <BillingPage
                studioId={studioId}
                clients={clients}
                cases={cases}
              />
            )}

            {activeSection === "Utenti" && <UsersPage />}

            {activeSection === "Backup" && (
              <BackupPage studioId={studioId} />
            )}

            {activeSection === "Pratiche" &&
              (selectedCase ? (
                <CaseDetail
                  studioId={studioId}
                  caseRecord={selectedCase}
                  events={
                    events.filter(
                      (event) => event.case_id === selectedCase.id
                    ) as CaseDetailEvent[]
                  }
                  onBack={() => setSelectedCase(null)}
                  onRefresh={refreshAllData}
                />
              ) : (
                <CasesPage
                  studioId={studioId}
                  cases={cases}
                  clients={clients as ClientOption[]}
                  counterparties={counterparties}
                  loading={loading}
                  onRefresh={refreshAllData}
                  onOpenCase={setSelectedCase}
                />
              ))}

            {![
              "Dashboard",
              "Ricerca",
              "Calendario",
              "Clienti",
              "Pratiche",
              "Fatture",
              "Utenti",
              "Backup",
            ].includes(activeSection) && <PlaceholderSection title={activeSection} />}
          </div>
        </section>
      </div>

      {selectedEvent && (
        <EventModal
          selectedEvent={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onOpenCase={() => {
            if (selectedEvent.caseId) openCaseById(selectedEvent.caseId);
          }}
        />
      )}
    </main>
  );
}

function LoginPage({
  email,
  password,
  message,
  loading,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: {
  email: string;
  password: string;
  message: string;
  loading: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-neutral-950 px-6 text-white">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-8"
      >
        <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">
          Studio Legale
        </p>
        <h1 className="mt-3 text-2xl font-semibold">Zaza Dell’Ali</h1>

        <div className="mt-8 space-y-5">
          <input
            type="email"
            required
            value={email}
            placeholder="Email"
            onChange={(event) => onEmailChange(event.target.value)}
            className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3"
          />
          <input
            type="password"
            required
            value={password}
            placeholder="Password"
            onChange={(event) => onPasswordChange(event.target.value)}
            className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-white px-4 py-3 font-medium text-black"
          >
            {loading ? "Accesso..." : "Accedi"}
          </button>
        </div>

        {message && <p className="mt-5 text-sm text-neutral-400">{message}</p>}
      </form>
    </main>
  );
}

function DashboardContent({
  loading,
  counts,
  events,
  upcomingEvents,
  formatEventDate,
  onEventClick,
}: {
  loading: boolean;
  counts: DashboardCounts;
  events: CalendarEvent[];
  upcomingEvents: CalendarEvent[];
  formatEventDate: (value: string) => string;
  onEventClick: (info: EventClickArg) => void;
}) {
  if (loading) return <div>Caricamento Dashboard...</div>;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Clienti", counts.contacts],
          ["Pratiche", counts.cases],
          ["Udienze", counts.hearings],
          ["Scadenze", counts.deadlines],
        ].map(([label, value]) => (
          <article
            key={label}
            className="rounded-2xl border border-neutral-200 bg-white p-6"
          >
            <p className="text-sm text-neutral-500">{label}</p>
            <p className="mt-3 text-4xl font-semibold">{value}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <article className="rounded-2xl border border-neutral-200 bg-white p-6">
          <h3 className="text-lg font-semibold">Calendario</h3>
          <div className="mt-6">
            <StudioCalendar
              events={events}
              onEventClick={onEventClick}
              compact
            />
          </div>
        </article>

        <article className="rounded-2xl border border-neutral-200 bg-white p-6">
          <h3 className="text-lg font-semibold">Prossimi eventi</h3>
          <div className="mt-5 space-y-3">
            {upcomingEvents.map((event) => (
              <button
                key={event.id}
                type="button"
                className="w-full rounded-xl border border-neutral-200 p-4 text-left"
                onClick={() =>
  onEventClick({
    event: {
      title: event.title,
      start: new Date(event.start_at),
      extendedProps: {
        caseId: event.case_id,
        type: event.event_type,
      },
    },
  } as unknown as EventClickArg)
}
              >
                <p className="font-medium">{event.title}</p>
                <p className="mt-1 text-sm text-neutral-500">
                  {formatEventDate(event.start_at)}
                </p>
              </button>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}

function CalendarPage({
  events,
  onEventClick,
}: {
  events: CalendarEvent[];
  onEventClick: (info: EventClickArg) => void;
}) {
  return (
    <article className="rounded-2xl border border-neutral-200 bg-white p-6">
      <StudioCalendar events={events} onEventClick={onEventClick} />
    </article>
  );
}

function StudioCalendar({
  events,
  onEventClick,
  compact = false,
}: {
  events: CalendarEvent[];
  onEventClick: (info: EventClickArg) => void;
  compact?: boolean;
}) {
  return (
    <FullCalendar
      plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
      initialView="dayGridMonth"
      locale={itLocale}
      height={compact ? 600 : "auto"}
      eventClick={onEventClick}
      headerToolbar={{
        left: "prev,next today",
        center: "title",
        right: "dayGridMonth,timeGridWeek,timeGridDay",
      }}
      buttonText={{
        today: "Oggi",
        month: "Mese",
        week: "Settimana",
        day: "Giorno",
      }}
      events={events.map((event) => ({
        id: String(event.id),
        title: event.title,
        start: event.start_at,
        end: event.end_at ?? undefined,
        backgroundColor: event.is_hearing
          ? "#1f2937"
          : event.is_deadline
            ? "#9a3412"
            : "#475569",
        borderColor: "transparent",
        extendedProps: {
          caseId: event.case_id,
          type: event.event_type,
        },
      }))}
    />
  );
}

function EventModal({
  selectedEvent,
  onClose,
  onOpenCase,
}: {
  selectedEvent: SelectedEvent;
  onClose: () => void;
  onOpenCase: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6">
        <h3 className="text-xl font-semibold">{selectedEvent.title}</h3>
        <p className="mt-3 text-sm">{selectedEvent.date}</p>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-neutral-300 px-4 py-3"
          >
            Chiudi
          </button>
          <button
            type="button"
            onClick={onOpenCase}
            disabled={!selectedEvent.caseId}
            className="flex-1 rounded-xl bg-neutral-900 px-4 py-3 text-white disabled:opacity-40"
          >
            Apri pratica
          </button>
        </div>
      </div>
    </div>
  );
}

function PlaceholderSection({ title }: { title: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-8">
      <h3 className="text-xl font-semibold">{title}</h3>
      <p className="mt-2 text-neutral-500">
        Questa sezione verrà sviluppata nel prossimo passaggio.
      </p>
    </div>
  );
}