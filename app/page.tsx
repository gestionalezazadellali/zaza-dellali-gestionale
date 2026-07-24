"use client";

import {
  FormEvent,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
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
import CounterpartiesPage from "./components/CounterpartiesPage";
import CasesPage, {
  getCounterpartyNames,
  type CaseRecord,
  type ClientOption,
  type CounterpartyOption,
} from "./components/CasesPage";
import CaseDetail, {
  type CalendarEvent as CaseDetailEvent,
} from "./components/CaseDetail";
import BillingPage from "./components/BillingPage";
import UsersPage from "./components/UsersPage";
import TrashCasesPage from "./components/TrashCasesPage";
import BackupPage from "./components/BackupPage";
import AdvancedDashboard from "./components/AdvancedDashboard";
import GlobalSearchPage from "./components/GlobalSearchPage";
import DeadlinesPage from "./components/DeadlinesPage";
import HearingsPage from "./components/HearingsPage";
import ProfileSettingsPage from "./components/ProfileSettingsPage";

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

type SyncStatus = "connecting" | "synced" | "syncing" | "offline" | "error";

const menuItems = [
  "Dashboard",
  "Ricerca",
  "Calendario",
  "Clienti",
  "Controparti",
  "Pratiche",
  "Udienze",
  "Scadenze",
  "Fatture",
  "Documenti",
  "Utenti",
  "Cestino",
  "Backup",
  "Profilo",
];

type CurrentProfile = {
  username: string | null;
  display_name: string | null;
  email: string | null;
  role: string;
};

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
  const [currentProfile, setCurrentProfile] =
    useState<CurrentProfile | null>(null);
  const [currentPermissions, setCurrentPermissions] = useState<
    Record<string, boolean>
  >({});
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
  const [selectedCase, setSelectedCase] = useState<CaseRecord | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [selectedCounterpartyId, setSelectedCounterpartyId] = useState<
    number | null
  >(null);
  const [newCaseClientId, setNewCaseClientId] = useState<number | null>(null);
  const [editCaseId, setEditCaseId] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("connecting");
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const refreshInProgress = useRef(false);

  const hearingEvents = useMemo(
    () =>
      events.filter(
        (event) =>
          event.is_hearing === true && event.is_deadline !== true
      ),
    [events]
  );

  const calendarHearings = useMemo(
    () =>
      hearingEvents
        .map((event) => {
          const caseRecord = cases.find((item) => item.id === event.case_id);

          if (!caseRecord) {
            return { ...event, title: `UD ${event.title}` };
          }

          const contact = Array.isArray(caseRecord.contacts)
            ? caseRecord.contacts[0]
            : caseRecord.contacts;
          const claimant =
            contact?.last_name ||
            contact?.display_name ||
            caseRecord.claimant_name_raw ||
            "Parte";
          const defendant =
            getCounterpartyNames(caseRecord).join(", ") ||
            caseRecord.defendant_name_raw ||
            "Controparte";

          return {
            ...event,
            title: `UD ${claimant} c. ${defendant}`,
          };
        })
        .sort(
          (a, b) =>
            new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
        ),
    [hearingEvents, cases]
  );

  useEffect(() => {
    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      setIsLoggedIn(Boolean(session));
      setSessionChecked(true);

      if (session) {
        setUserEmail(
          String(session.user.user_metadata?.display_name ?? "").trim() ||
            "Utente"
        );
      }
    }

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(Boolean(session));
      setUserEmail(
        String(session?.user.user_metadata?.display_name ?? "").trim() ||
          "Utente"
      );

      if (!session) {
        setActiveSection("Dashboard");
        setSelectedCase(null);
        setMobileMenuOpen(false);
        setClients([]);
        setCases([]);
        setCounterparties([]);
        setSelectedCounterpartyId(null);
        setEvents([]);
        setStudioId("");
        setCurrentProfile(null);
        setCurrentPermissions({});
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadClients() {
    const pageSize = 1000;
    const loadedClients: ClientRecord[] = [];
    let offset = 0;

    while (true) {
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
            birth_place,
            birth_date,
            notes,
            needs_review
          `
        )
        .is("deleted_at", null)
        .order("display_name", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (error) throw error;

      const page = (data ?? []) as ClientRecord[];
      loadedClients.push(...page);

      if (page.length < pageSize) break;
      offset += pageSize;
    }

    setClients(loadedClients);
  }

  async function loadCounterparties() {
    const { data, error } = await supabase
      .from("counterparties")
      .select("id, name, display_name, deleted_at")
      .is("deleted_at", null)
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
          archive_box_number,
          archive_year,
          description,
          notes,
          needs_review,
          contacts (
            display_name,
            last_name,
            email,
            phone
          ),
          counterparties (
            id,
            name,
            display_name,
            deleted_at
          ),
          case_counterparties (
            id,
            counterparty_id,
            deleted_at,
            counterparties (
              id,
              name,
              display_name,
              deleted_at
            )
          )
        `
      )
      .is("deleted_at", null)
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
      supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .is("deleted_at", null),
      supabase
        .from("cases")
        .select("*", { count: "exact", head: true })
        .is("deleted_at", null),
      supabase
        .from("active_events")
        .select("*", { count: "exact", head: true })
        .eq("is_hearing", true),
      supabase
        .from("active_events")
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
      .from("active_events")
      .select(
        "id, title, event_type, description, start_at, end_at, is_hearing, is_deadline, status, case_id"
      )
      .order("start_at", { ascending: true });

    if (error) throw error;
    setEvents((data ?? []) as CalendarEvent[]);
  }

  async function refreshAllData() {
    if (refreshInProgress.current) return;
    refreshInProgress.current = true;
    setSyncStatus(navigator.onLine ? "syncing" : "offline");
    setErrorMessage("");

    try {
      await Promise.all([
        loadClients(),
        loadCounterparties(),
        loadCases(),
        loadCounts(),
        loadEvents(),
      ]);
      setLastSyncedAt(new Date());
      setSyncStatus(navigator.onLine ? "synced" : "offline");
    } catch (error) {
      setSyncStatus(navigator.onLine ? "error" : "offline");
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Errore durante l’aggiornamento dei dati."
      );
    } finally {
      refreshInProgress.current = false;
    }
  }

  async function loadCurrentProfileAccess() {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) throw userError || new Error("Utente non trovato.");

    const [profileResult, permissionResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("studio_id, username, display_name, email, role, active, deleted_at")
        .eq("id", user.id)
        .single(),
      supabase
        .from("user_permissions")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    if (profileResult.error) throw profileResult.error;
    const profile = profileResult.data;
    if (!profile || !profile.active || profile.deleted_at) {
      throw new Error("Account disattivato.");
    }

    setStudioId(profile.studio_id ?? "");
    setCurrentProfile(profile as CurrentProfile);
    setUserEmail(
      profile.display_name ||
        profile.username ||
        profile.email ||
        user.email ||
        ""
    );

    const permissionRecord = permissionResult.data ?? {};
    setCurrentPermissions(
      Object.fromEntries(
        Object.entries(permissionRecord)
          .filter(([key]) => key.startsWith("can_"))
          .map(([key, value]) => [key, value === true])
      )
    );

    return profile;
  }

  const refreshAllDataEffect = useEffectEvent(refreshAllData);

  useEffect(() => {
    if (!isLoggedIn || !studioId) return;

    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        void refreshAllDataEffect();
      }, 350);
    };

    const realtimeTables = [
      "contacts",
      "counterparties",
      "cases",
      "case_counterparties",
      "events",
      "case_activities",
      "case_titles",
      "hearing_updates",
      "invoices",
      "payments",
      "enforcement_actions",
      "audit_log",
      "profiles",
    ];

    const channel = supabase.channel(`studio-realtime-${studioId}`);
    for (const table of realtimeTables) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `studio_id=eq.${studioId}`,
        },
        scheduleRefresh
      );
    }

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setSyncStatus(navigator.onLine ? "synced" : "offline");
      } else if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT"
      ) {
        setSyncStatus(navigator.onLine ? "error" : "offline");
      }
    });

    const handleFocus = () => scheduleRefresh();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") scheduleRefresh();
    };
    const handleOnline = () => {
      setSyncStatus("connecting");
      scheduleRefresh();
    };
    const handleOffline = () => setSyncStatus("offline");

    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibility);

    const fallbackInterval = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        scheduleRefresh();
      }
    }, 60_000);

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      window.clearInterval(fallbackInterval);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
      void supabase.removeChannel(channel);
    };
  }, [isLoggedIn, studioId]);

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

      try {
        await loadCurrentProfileAccess();
      } catch (profileError) {
        setLoginMessage(
          "Account disattivato. Contatta l’amministratore dello studio."
        );
        setStudioId("");
        setLoading(false);
        await supabase.auth.signOut();
        return;
      }

      await refreshAllDataEffect();
      setLoading(false);
    }

    loadApplicationData();
  }, [isLoggedIn]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginLoading(true);
    setLoginMessage("Accesso in corso...");

    const response = await fetch("/api/auth/username-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: loginEmail,
        password: loginPassword,
      }),
    });

    const result = await response.json();
    if (!response.ok) {
      setLoginMessage(result.error || "Accesso non riuscito.");
      setLoginLoading(false);
      return;
    }

    const { error } = await supabase.auth.setSession({
      access_token: result.access_token,
      refresh_token: result.refresh_token,
    });
    setLoginMessage(error ? "Accesso non riuscito." : "");
    setLoginLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  function handleCalendarEventClick(info: EventClickArg) {
    const caseId = Number(info.event.extendedProps.caseId || 0);

    if (!caseId) return;

    openActiveCaseById(caseId);
  }

  function openCaseById(caseId: number) {
    const foundCase = cases.find((item) => item.id === caseId);

    if (!foundCase) {
      setErrorMessage(`Pratica n. ${caseId} non trovata.`);
      return;
    }

    setSelectedCase(foundCase);
    setSelectedCounterpartyId(null);
    setActiveSection("Pratiche");
  }

  function openActiveCaseById(caseId: number) {
    if (!cases.some((item) => item.id === caseId)) return;

    openCaseById(caseId);
  }

  function openClientById(clientId: number) {
    setSelectedClientId(clientId);
    setSelectedCase(null);
    setActiveSection("Clienti");
  }

  function openNewCaseForClient(clientId: number) {
    setSelectedCase(null);
    setSelectedClientId(null);
    setNewCaseClientId(clientId);
    setActiveSection("Pratiche");
  }

  function openCounterpartyById(counterpartyId: number) {
    setSelectedCase(null);
    setSelectedClientId(null);
    setSelectedCounterpartyId(counterpartyId);
    setActiveSection("Controparti");
  }

  function openCaseEditor(caseId: number) {
    setSelectedCase(null);
    setEditCaseId(caseId);
    setActiveSection("Pratiche");
  }

  const isAdmin = currentProfile?.role === "admin";
  const can = (permission: string) =>
    isAdmin || currentPermissions[permission] === true;
  const visibleMenuItems = menuItems.filter((item) => {
    if (["Dashboard", "Profilo"].includes(item)) return true;
    if (item === "Ricerca") {
      return can("can_view_clients") || can("can_view_cases");
    }
    if (item === "Calendario" || item === "Udienze") {
      return can("can_view_cases") || can("can_manage_hearings");
    }
    if (item === "Scadenze") {
      return can("can_view_cases") || can("can_manage_deadlines");
    }
    if (item === "Clienti") return can("can_view_clients");
    if (item === "Controparti") {
      return can("can_view_cases") || can("can_manage_counterparties");
    }
    if (item === "Pratiche") return can("can_view_cases");
    if (item === "Fatture") return can("can_view_billing");
    if (item === "Documenti") return can("can_manage_documents");
    if (item === "Utenti") return can("can_manage_users");
    if (item === "Cestino") {
      return (
        can("can_restore_trash") ||
        can("can_permanently_delete") ||
        can("can_delete_cases") ||
        can("can_delete_clients")
      );
    }
    if (item === "Backup") {
      return (
        can("can_configure_backups") ||
        can("can_run_backups") ||
        can("can_restore_backups")
      );
    }
    return false;
  });

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
        <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-[#f8faff] lg:flex">
          <div className="flex h-28 items-center justify-center border-b border-slate-200 px-5">
            <img
              src="/logo-zaza-dellali.svg"
              alt="Studio Legale Zaza Dell’Ali"
              className="h-24 w-24"
            />
          </div>

          <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
            {visibleMenuItems.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setActiveSection(item);
                  setMobileMenuOpen(false);
                  setSelectedClientId(null);
                  setSelectedCounterpartyId(null);

                  if (item !== "Pratiche") {
                    setSelectedCase(null);
                  }
                }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                  activeSection === item
                    ? "bg-[#17376f] font-medium text-white shadow-sm"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                <MenuIcon item={item} />
                <span>{item}</span>
              </button>
            ))}
          </nav>

          <div className="border-t border-neutral-200 p-4">
            <p className="truncate text-sm font-medium text-slate-700">
              Benvenuto, {userEmail}
            </p>
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
          <header className="flex h-28 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-neutral-300 bg-white text-2xl lg:hidden"
                aria-label="Apri menu"
              >
                ☰
              </button>

              <div className="min-w-0">
                <p className="truncate text-xs text-slate-500 sm:text-sm">
                  Gestionale dello studio
                </p>
                <h2 className="truncate text-xl font-semibold text-slate-900 sm:text-2xl">
                  {activeSection}
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <SyncStatusBadge
                status={syncStatus}
                lastSyncedAt={lastSyncedAt}
              />
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-xl border border-neutral-300 px-3 py-2 text-sm lg:hidden"
              >
                Esci
              </button>
            </div>
          </header>

          <div className="p-3 sm:p-5">
            {errorMessage && (
              <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {errorMessage}
              </div>
            )}

            {activeSection === "Dashboard" && (
              <AdvancedDashboard
                loading={loading}
                events={events}
                cases={cases}
                onOpenCase={openActiveCaseById}
                onOpenClient={openClientById}
                onOpenCounterparty={openCounterpartyById}
                onOpenSection={setActiveSection}
              />
            )}

            {activeSection === "Ricerca" && (
              <GlobalSearchPage
                onOpenCase={openCaseById}
                onOpenClient={openClientById}
                onOpenCounterparty={openCounterpartyById}
                onOpenSection={setActiveSection}
              />
            )}

            {activeSection === "Calendario" && (
              <CalendarPage
                events={calendarHearings}
                onEventClick={handleCalendarEventClick}
              />
            )}

            {activeSection === "Scadenze" && (
              <DeadlinesPage
                studioId={studioId}
                events={events}
                cases={cases}
                onRefresh={refreshAllData}
                onOpenCase={openCaseById}
              />
            )}

            {activeSection === "Udienze" && (
              <HearingsPage
                studioId={studioId}
                events={hearingEvents}
                cases={cases}
                onRefresh={refreshAllData}
                onOpenCase={openCaseById}
              />
            )}

            {activeSection === "Clienti" && (
              <ClientsPage
                key={selectedClientId ?? "clients"}
                clients={clients}
                cases={cases as ClientCase[]}
                studioId={studioId}
                initialClientId={selectedClientId}
                onClientsChanged={refreshAllData}
                onOpenCase={openCaseById}
                onAddCase={openNewCaseForClient}
                onClientDetailClose={() => setSelectedClientId(null)}
              />
            )}

            {activeSection === "Controparti" && (
              <CounterpartiesPage
                key={selectedCounterpartyId ?? "counterparties"}
                studioId={studioId}
                initialCounterpartyId={selectedCounterpartyId}
                onOpenCase={openCaseById}
                onChanged={refreshAllData}
                onDetailClose={() => setSelectedCounterpartyId(null)}
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

            {activeSection === "Profilo" && (
              <ProfileSettingsPage
                onProfileChanged={async () => {
                  await loadCurrentProfileAccess();
                }}
              />
            )}

            {activeSection === "Cestino" && (
              <TrashCasesPage
                studioId={studioId}
                onRefresh={refreshAllData}
              />
            )}

            {activeSection === "Backup" && (
              <BackupPage studioId={studioId} />
            )}

            {activeSection === "Pratiche" &&
              (selectedCase ? (
                <CaseDetail
                  studioId={studioId}
                  caseRecord={selectedCase}
                  client={
                    clients.find(
                      (item) => item.id === selectedCase.client_contact_id
                    ) ?? null
                  }
                  onOpenClient={openClientById}
                  onOpenCounterparty={openCounterpartyById}
                  onEditCase={openCaseEditor}
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
                  initialClientId={newCaseClientId}
                  initialEditCaseId={editCaseId}
                  onRefresh={refreshAllData}
                  onOpenCase={setSelectedCase}
                  onInitialClientHandled={() => setNewCaseClientId(null)}
                  onInitialEditHandled={() => setEditCaseId(null)}
                />
              ))}

            {![
              "Dashboard",
              "Ricerca",
              "Calendario",
              "Clienti",
              "Controparti",
              "Pratiche",
              "Udienze",
              "Scadenze",
              "Fatture",
              "Utenti",
              "Cestino",
              "Backup",
              "Profilo",
            ].includes(activeSection) && <PlaceholderSection title={activeSection} />}
          </div>
        </section>
      </div>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[100] lg:hidden">
          <button
            type="button"
            aria-label="Chiudi menu"
            onClick={() => setMobileMenuOpen(false)}
            className="absolute inset-0 bg-black/50"
          />

          <aside className="relative flex h-full w-[85%] max-w-sm flex-col bg-[#f8faff] shadow-2xl">
            <div className="flex h-28 items-center justify-between border-b border-slate-200 px-5">
              <img
                src="/logo-zaza-dellali.svg"
                alt="Studio Legale Zaza Dell’Ali"
                className="h-24 w-24"
              />

              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-300 text-xl"
                aria-label="Chiudi menu"
              >
                ×
              </button>
            </div>

            <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
              {visibleMenuItems.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setActiveSection(item);
                    setMobileMenuOpen(false);
                    setSelectedClientId(null);
                    setSelectedCounterpartyId(null);

                    if (item !== "Pratiche") {
                      setSelectedCase(null);
                    }
                  }}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                    activeSection === item
                      ? "bg-[#17376f] font-medium text-white"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <MenuIcon item={item} />
                  <span>{item}</span>
                </button>
              ))}
            </nav>

            <div className="border-t border-neutral-200 p-4">
              <p className="truncate text-sm font-medium text-slate-700">
                Benvenuto, {userEmail}
              </p>

              <button
                type="button"
                onClick={async () => {
                  setMobileMenuOpen(false);
                  await handleLogout();
                }}
                className="mt-3 w-full rounded-xl border border-neutral-300 px-4 py-3 text-sm"
              >
                Esci
              </button>
            </div>
          </aside>
        </div>
      )}

    </main>
  );
}

function MenuIcon({ item }: { item: string }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (item === "Dashboard") {
    return (
      <svg {...common}>
        <path d="m3 11 9-8 9 8" />
        <path d="M5 10v10h14V10M9 20v-6h6v6" />
      </svg>
    );
  }
  if (item === "Clienti" || item === "Controparti" || item === "Utenti") {
    return (
      <svg {...common}>
        <circle cx="9" cy="8" r="3" />
        <path d="M3.5 20c.5-4 2.3-6 5.5-6s5 2 5.5 6M16 5.5a3 3 0 0 1 0 5.5M16 14c2.8.2 4.3 2.1 4.5 5" />
      </svg>
    );
  }
  if (item === "Pratiche" || item === "Fatture") {
    return (
      <svg {...common}>
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M8 7V4h8v3M3 12h18M10 12v2h4v-2" />
      </svg>
    );
  }
  if (item === "Calendario" || item === "Scadenze") {
    return (
      <svg {...common}>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M7 3v4M17 3v4M3 10h18M8 15h3" />
      </svg>
    );
  }
  if (item === "Udienze") {
    return (
      <svg {...common}>
        <path d="m14 4 6 6M12.5 5.5l3-3 6 6-3 3zM9 9l6 6M7.5 10.5l3-3 6 6-3 3zM3 21h12M5 18h8" />
      </svg>
    );
  }
  if (item === "Ricerca") {
    return (
      <svg {...common}>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5" />
      </svg>
    );
  }
  if (item === "Documenti") {
    return (
      <svg {...common}>
        <path d="M6 2h8l4 4v16H6zM14 2v5h5M9 12h6M9 16h6" />
      </svg>
    );
  }
  if (item === "Cestino") {
    return (
      <svg {...common}>
        <path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6" />
      </svg>
    );
  }
  if (item === "Backup") {
    return (
      <svg {...common}>
        <path d="M7 18a5 5 0 0 1 .5-10A7 7 0 0 1 21 10.5 4 4 0 0 1 19 18H7z" />
        <path d="m9 14 3-3 3 3M12 11v8" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1z" />
    </svg>
  );
}

function SyncStatusBadge({
  status,
  lastSyncedAt,
}: {
  status: SyncStatus;
  lastSyncedAt: Date | null;
}) {
  const labels: Record<SyncStatus, string> = {
    connecting: "Collegamento...",
    synced: lastSyncedAt
      ? `Aggiornato ${lastSyncedAt.toLocaleTimeString("it-IT", {
          hour: "2-digit",
          minute: "2-digit",
        })}`
      : "Dati sincronizzati",
    syncing: "Sincronizzazione...",
    offline: "Offline",
    error: "Riallineamento in attesa",
  };
  const colors: Record<SyncStatus, string> = {
    connecting: "bg-amber-100 text-amber-800",
    synced: "bg-emerald-100 text-emerald-800",
    syncing: "bg-blue-100 text-blue-800",
    offline: "bg-neutral-200 text-neutral-700",
    error: "bg-amber-100 text-amber-800",
  };

  return (
    <span
      className={`hidden items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium sm:flex ${colors[status]}`}
      title="Stato della sincronizzazione tra i dispositivi"
    >
      <span
        className={`h-2 w-2 rounded-full ${
          status === "synced"
            ? "bg-emerald-500"
            : status === "syncing" || status === "connecting"
              ? "animate-pulse bg-current"
              : "bg-current"
        }`}
      />
      {labels[status]}
    </span>
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
            type="text"
            required
            value={email}
            placeholder="Username"
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
      events={events
        .filter(
          (event) =>
            event.is_hearing === true && event.is_deadline !== true
        )
        .map((event) => ({
          id: String(event.id),
          title: event.title,
          start: event.start_at,
          end: event.end_at ?? undefined,
          backgroundColor: "#1f2937",
          borderColor: "transparent",
          extendedProps: {
            caseId: event.case_id,
            type: event.event_type,
          },
        }))}
    />
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
