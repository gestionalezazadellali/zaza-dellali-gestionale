"use client";

import {
  FormEvent,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
} from "react";
import { supabase } from "../../lib/supabase";
import type { CaseRecord } from "./CasesPage";
import CaseTitlesModule, {
  type CaseTitleRecord,
  type EnforcementActionRecord,
} from "./CaseTitlesModule";

export type CalendarEvent = {
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

export type CaseClientRecord = {
  id: number;
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
};

type EventForm = {
  kind: "hearing" | "activity";
  title: string;
  description: string;
  date: string;
  time: string;
  end_time: string;
};

type AdjournmentForm = {
  event_id: string;
  outcome: string;
  adjournment_reason: string;
  adjournment_details: string;
  next_date: string;
  next_time: string;
  next_hearing_task: string;
  pre_hearing_tasks: string;
};

const emptyEventForm: EventForm = {
  kind: "hearing",
  title: "",
  description: "",
  date: "",
  time: "09:00",
  end_time: "10:00",
};

const emptyAdjournmentForm: AdjournmentForm = {
  event_id: "",
  outcome: "",
  adjournment_reason: "",
  adjournment_details: "",
  next_date: "",
  next_time: "09:00",
  next_hearing_task: "",
  pre_hearing_tasks: "",
};

export default function CaseDetail({
  studioId,
  caseRecord,
  client,
  onOpenClient,
  events,
  onBack,
  onRefresh,
}: {
  studioId: string;
  caseRecord: CaseRecord;
  client: CaseClientRecord | null;
  onOpenClient: (clientId: number) => void;
  events: CalendarEvent[];
  onBack: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [showEventForm, setShowEventForm] = useState(false);
  const [showAdjournmentForm, setShowAdjournmentForm] = useState(false);
  const [eventForm, setEventForm] = useState<EventForm>(emptyEventForm);
  const [adjournmentForm, setAdjournmentForm] =
    useState<AdjournmentForm>(emptyAdjournmentForm);
  const [saving, setSaving] = useState(false);
  const [deletingEventId, setDeletingEventId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [titles, setTitles] = useState<CaseTitleRecord[]>([]);
  const [actions, setActions] = useState<EnforcementActionRecord[]>([]);

  const hearings = useMemo(
    () =>
      events
        .filter(
          (event) =>
            event.is_hearing === true && event.is_deadline !== true
        )
        .sort(
          (a, b) =>
            new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
        ),
    [events]
  );

  const activities = useMemo(
    () =>
      events
        .filter((event) => !event.is_hearing && !event.is_deadline)
        .sort(
          (a, b) =>
            new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
        ),
    [events]
  );

  function updateEventForm(field: keyof EventForm, value: string) {
    setEventForm((current) => ({ ...current, [field]: value }));
  }

  function updateAdjournmentForm(
    field: keyof AdjournmentForm,
    value: string
  ) {
    setAdjournmentForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function makeIso(date: string, time: string) {
    return new Date(`${date}T${time}:00`).toISOString();
  }

  async function handleCreateEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!eventForm.title.trim() || !eventForm.date) {
      setMessage("Inserisci titolo e data.");
      return;
    }

    setSaving(true);
    setMessage("");

    const isHearing = eventForm.kind === "hearing";

    const { error } = await supabase.from("events").insert({
      studio_id: studioId,
      case_id: caseRecord.id,
      event_type: isHearing ? "UDIENZA" : "ATTIVITA",
      title: eventForm.title.trim(),
      description: eventForm.description.trim() || null,
      start_at: makeIso(eventForm.date, eventForm.time),
      end_at: eventForm.end_time
        ? makeIso(eventForm.date, eventForm.end_time)
        : null,
      all_day: false,
      is_hearing: isHearing,
      is_deadline: false,
      status: "aperto",
      source: "inserimento_manuale",
    });

    if (error) {
      setMessage(`Errore: ${error.message}`);
      setSaving(false);
      return;
    }

    await refreshEverything();
    setEventForm(emptyEventForm);
    setShowEventForm(false);
    setMessage("Evento aggiunto correttamente.");
    setSaving(false);
  }

  function openAdjournment(event: CalendarEvent) {
    setAdjournmentForm({
      ...emptyAdjournmentForm,
      event_id: String(event.id),
    });
    setShowAdjournmentForm(true);
    setMessage("");
  }

  async function handleAdjournment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!adjournmentForm.event_id || !adjournmentForm.next_date) {
      setMessage("Seleziona l’udienza e inserisci la nuova data.");
      return;
    }

    setSaving(true);
    setMessage("");

    const originalEvent = hearings.find(
      (item) => item.id === Number(adjournmentForm.event_id)
    );

    if (!originalEvent) {
      setMessage("Udienza originaria non trovata.");
      setSaving(false);
      return;
    }

    const nextStart = makeIso(
      adjournmentForm.next_date,
      adjournmentForm.next_time
    );

    const { error: updateError } = await supabase
      .from("events")
      .update({ status: "rinviato" })
      .eq("id", originalEvent.id);

    if (updateError) {
      setMessage(`Errore: ${updateError.message}`);
      setSaving(false);
      return;
    }

    const { error: hearingUpdateError } = await supabase
      .from("hearing_updates")
      .insert({
        studio_id: studioId,
        event_id: originalEvent.id,
        outcome: adjournmentForm.outcome.trim() || null,
        adjourned: true,
        adjournment_reason:
          adjournmentForm.adjournment_reason.trim() || null,
        adjournment_details:
          adjournmentForm.adjournment_details.trim() || null,
        next_hearing_at: nextStart,
        next_hearing_task:
          adjournmentForm.next_hearing_task.trim() || null,
        pre_hearing_tasks:
          adjournmentForm.pre_hearing_tasks.trim() || null,
      });

    if (hearingUpdateError) {
      setMessage(`Errore: ${hearingUpdateError.message}`);
      setSaving(false);
      return;
    }

    const { error: newEventError } = await supabase.from("events").insert({
      studio_id: studioId,
      case_id: caseRecord.id,
      event_type: "UDIENZA",
      title: originalEvent.title,
      description:
        adjournmentForm.next_hearing_task.trim() ||
        originalEvent.description ||
        null,
      start_at: nextStart,
      end_at: null,
      all_day: false,
      is_hearing: true,
      is_deadline: false,
      status: "aperto",
      source: "rinvio_udienza",
    });

    if (newEventError) {
      setMessage(`Errore: ${newEventError.message}`);
      setSaving(false);
      return;
    }

    await refreshEverything();
    setAdjournmentForm(emptyAdjournmentForm);
    setShowAdjournmentForm(false);
    setMessage("Rinvio registrato e nuova udienza creata.");
    setSaving(false);
  }


  async function loadTitlesAndActions() {
    const { data: titleData, error: titleError } = await supabase
      .from("case_titles")
      .select(
        "id, case_id, title_type, title_number, issue_date, publication_date, outcome, summary, principal_amount, legal_costs, accessories, costs_awarded_to, notified, notification_date, notification_method, notification_recipient, payment_status, paid_amount, payment_date, provisional_enforcement, opposition_filed, enforceability_date, notes"
      )
      .eq("case_id", caseRecord.id)
      .order("publication_date", { ascending: false });

    if (titleError) {
      setMessage(`Errore provvedimenti: ${titleError.message}`);
      return;
    }

    const titleIds = (titleData ?? []).map((item) => item.id);

    if (titleIds.length === 0) {
      setTitles([]);
      setActions([]);
      return;
    }

    const { data: actionData, error: actionError } = await supabase
      .from("enforcement_actions")
      .select(
        "id, case_title_id, action_type, status, writ_served, writ_date, writ_amount, enforcement_type, public_body, voluntary_compliance_deadline, filing_date, compliance_rg, commissioner_name, commissioner_appointed_at, amount_recovered, notes"
      )
      .in("case_title_id", titleIds)
      .order("id", { ascending: false });

    if (actionError) {
      setMessage(`Errore azioni successive: ${actionError.message}`);
      return;
    }

    setTitles((titleData ?? []) as CaseTitleRecord[]);
    setActions((actionData ?? []) as EnforcementActionRecord[]);
  }

  const loadTitlesAndActionsEffect = useEffectEvent(loadTitlesAndActions);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadTitlesAndActionsEffect();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [caseRecord.id]);

  async function refreshEverything() {
    await Promise.all([onRefresh(), loadTitlesAndActions()]);
  }

  async function handleDeleteEvent(item: CalendarEvent) {
    const confirmed = window.confirm(
      "Vuoi spostare questo evento nel cestino? Potrai ripristinarlo successivamente."
    );

    if (!confirmed) return;

    setDeletingEventId(item.id);
    setMessage("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) throw new Error("Utente non autenticato.");

      const { error } = await supabase
        .from("events")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: user.id,
          delete_reason: "Eliminato dalla scheda pratica",
        })
        .eq("id", item.id)
        .eq("studio_id", studioId);

      if (error) throw error;

      await refreshEverything();
      setMessage("Evento spostato nel cestino.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Errore durante l’eliminazione dell’evento."
      );
    } finally {
      setDeletingEventId(null);
    }
  }

  function formatDate(value: string) {
    return new Intl.DateTimeFormat("it-IT", {
      weekday: "short",
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  }

  const relatedContact = Array.isArray(caseRecord.contacts)
    ? caseRecord.contacts[0]
    : caseRecord.contacts;

  const relatedCounterparty = Array.isArray(caseRecord.counterparties)
    ? caseRecord.counterparties[0]
    : caseRecord.counterparties;

  const clientName =
    client?.display_name ||
    relatedContact?.display_name ||
    caseRecord.claimant_name_raw ||
    "Cliente non indicato";

  const counterpartyName =
    relatedCounterparty?.name ||
    caseRecord.defendant_name_raw ||
    "Controparte non indicata";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm"
        >
          ← Torna alle pratiche
        </button>

        <button
          type="button"
          onClick={() => {
            setEventForm(emptyEventForm);
            setShowEventForm(true);
            setMessage("");
          }}
          className="rounded-xl bg-neutral-900 px-4 py-2 text-sm text-white"
        >
          Nuova udienza
        </button>
      </div>

      {message && (
        <div className="rounded-xl border border-neutral-200 bg-white p-4 text-sm">
          {message}
        </div>
      )}

      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-neutral-500">Pratica</p>

        <h3 className="mt-1 text-2xl font-semibold">
          {caseRecord.title || `${clientName} c. ${counterpartyName}`}
        </h3>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-neutral-200 p-4">
            <p className="text-xs uppercase tracking-wide text-neutral-500">
              Cliente
            </p>

            {client ? (
              <button
                type="button"
                onClick={() => onOpenClient(client.id)}
                className="mt-2 text-left font-semibold text-neutral-900 underline decoration-neutral-300 underline-offset-4 hover:decoration-neutral-900"
              >
                {clientName}
              </button>
            ) : (
              <p className="mt-2 font-semibold">{clientName}</p>
            )}
          </div>

          <div className="rounded-xl border border-neutral-200 p-4">
            <p className="text-xs uppercase tracking-wide text-neutral-500">
              Controparte
            </p>
            <p className="mt-2 font-semibold">{counterpartyName}</p>
          </div>
        </div>

        <p className="mt-5 text-neutral-500">
          RG {caseRecord.rg_number || "non indicato"} ·{" "}
          {caseRecord.court_city || "Tribunale non indicato"}
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <InfoCard label="Tipo" value={caseRecord.case_type} />
        <InfoCard label="Sezione" value={caseRecord.section} />
        <InfoCard label="Giudice" value={caseRecord.judge_name} />
        <InfoCard label="Stato" value={caseRecord.status} />
      </section>

      <EventPanel
        title={`Udienze (${hearings.length})`}
        events={hearings}
        formatDate={formatDate}
        onAdjourn={openAdjournment}
        onDelete={handleDeleteEvent}
        deletingEventId={deletingEventId}
      />

      <EventPanel
        title={`Altre attività (${activities.length})`}
        events={activities}
        formatDate={formatDate}
        onDelete={handleDeleteEvent}
        deletingEventId={deletingEventId}
      />

      <CaseTitlesModule
        studioId={studioId}
        caseId={caseRecord.id}
        titles={titles}
        actions={actions}
        onRefresh={refreshEverything}
      />

      {showEventForm && (
        <EventFormModal
          form={eventForm}
          saving={saving}
          message={message}
          onChange={updateEventForm}
          onSubmit={handleCreateEvent}
          onClose={() => {
            setShowEventForm(false);
            setEventForm(emptyEventForm);
            setMessage("");
          }}
        />
      )}

      {showAdjournmentForm && (
        <AdjournmentModal
          form={adjournmentForm}
          saving={saving}
          message={message}
          onChange={updateAdjournmentForm}
          onSubmit={handleAdjournment}
          onClose={() => {
            setShowAdjournmentForm(false);
            setAdjournmentForm(emptyAdjournmentForm);
            setMessage("");
          }}
        />
      )}

    </div>
  );
}

function EventPanel({
  title,
  events,
  formatDate,
  onAdjourn,
  onDelete,
  deletingEventId,
}: {
  title: string;
  events: CalendarEvent[];
  formatDate: (value: string) => string;
  onAdjourn?: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => Promise<void>;
  deletingEventId: number | null;
}) {
  return (
    <article className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <h4 className="text-lg font-semibold">{title}</h4>

      <div className="mt-5 space-y-3">
        {events.length === 0 ? (
          <p className="text-sm text-neutral-500">Nessun evento presente.</p>
        ) : (
          events.map((event) => (
            <div
              key={event.id}
              className="rounded-xl border border-neutral-200 p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-medium">{event.title}</p>
                  <p className="mt-1 text-sm text-neutral-500">
                    {formatDate(event.start_at)}
                  </p>
                  {event.description && (
                    <p className="mt-2 text-sm text-neutral-600">
                      {event.description}
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-start gap-2 sm:items-end">
                  <StatusBadge status={event.status} />
                  {onAdjourn && event.status !== "rinviato" && (
                    <button
                      type="button"
                      onClick={() => onAdjourn(event)}
                      className="rounded-lg border border-neutral-300 px-3 py-2 text-xs"
                    >
                      Registra rinvio
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onDelete(event)}
                    disabled={deletingEventId === event.id}
                    className="rounded-lg bg-red-600 px-3 py-2 text-xs text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {deletingEventId === event.id
                      ? "Eliminazione..."
                      : "Elimina"}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </article>
  );
}

function EventFormModal({
  form,
  saving,
  message,
  onChange,
  onSubmit,
  onClose,
}: {
  form: EventForm;
  saving: boolean;
  message: string;
  onChange: (field: keyof EventForm, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 px-4 py-10">
      <form
        onSubmit={onSubmit}
        className="mx-auto w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-neutral-500">Calendario pratica</p>
            <h3 className="mt-1 text-xl font-semibold">
              Nuova udienza o attività
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-neutral-300 px-3 py-2 text-sm"
          >
            Chiudi
          </button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm text-neutral-500">Tipo</span>
            <select
              value={form.kind}
              onChange={(event) => onChange("kind", event.target.value)}
              className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3"
            >
              <option value="hearing">Udienza</option>
              <option value="activity">Altra attività</option>
            </select>
          </label>

          <Input
            label="Titolo *"
            value={form.title}
            onChange={(value) => onChange("title", value)}
          />

          <Input
            label="Data *"
            type="date"
            value={form.date}
            onChange={(value) => onChange("date", value)}
          />

          <Input
            label="Ora inizio"
            type="time"
            value={form.time}
            onChange={(value) => onChange("time", value)}
          />

          <Input
            label="Ora fine"
            type="time"
            value={form.end_time}
            onChange={(value) => onChange("end_time", value)}
          />

          <label className="block sm:col-span-2">
            <span className="mb-2 block text-sm text-neutral-500">
              Descrizione / incombente
            </span>
            <textarea
              rows={4}
              value={form.description}
              onChange={(event) =>
                onChange("description", event.target.value)
              }
              className="w-full rounded-xl border border-neutral-300 px-4 py-3"
            />
          </label>
        </div>

        {message && <p className="mt-5 text-sm">{message}</p>}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-neutral-300 px-5 py-3 text-sm"
          >
            Annulla
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-neutral-900 px-5 py-3 text-sm text-white disabled:opacity-50"
          >
            {saving ? "Salvataggio..." : "Salva evento"}
          </button>
        </div>
      </form>
    </div>
  );
}

function AdjournmentModal({
  form,
  saving,
  message,
  onChange,
  onSubmit,
  onClose,
}: {
  form: AdjournmentForm;
  saving: boolean;
  message: string;
  onChange: (field: keyof AdjournmentForm, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 px-4 py-10">
      <form
        onSubmit={onSubmit}
        className="mx-auto w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-neutral-500">Udienza</p>
            <h3 className="mt-1 text-xl font-semibold">Registra rinvio</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-neutral-300 px-3 py-2 text-sm"
          >
            Chiudi
          </button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Input
            label="Esito dell’udienza"
            value={form.outcome}
            onChange={(value) => onChange("outcome", value)}
          />

          <Input
            label="Motivo del rinvio"
            value={form.adjournment_reason}
            onChange={(value) =>
              onChange("adjournment_reason", value)
            }
          />

          <Input
            label="Nuova data *"
            type="date"
            value={form.next_date}
            onChange={(value) => onChange("next_date", value)}
          />

          <Input
            label="Nuova ora"
            type="time"
            value={form.next_time}
            onChange={(value) => onChange("next_time", value)}
          />

          <label className="block sm:col-span-2">
            <span className="mb-2 block text-sm text-neutral-500">
              Dettagli del rinvio
            </span>
            <textarea
              rows={3}
              value={form.adjournment_details}
              onChange={(event) =>
                onChange("adjournment_details", event.target.value)
              }
              className="w-full rounded-xl border border-neutral-300 px-4 py-3"
            />
          </label>

          <label className="block sm:col-span-2">
            <span className="mb-2 block text-sm text-neutral-500">
              Incombente per la prossima udienza
            </span>
            <textarea
              rows={3}
              value={form.next_hearing_task}
              onChange={(event) =>
                onChange("next_hearing_task", event.target.value)
              }
              className="w-full rounded-xl border border-neutral-300 px-4 py-3"
            />
          </label>

          <label className="block sm:col-span-2">
            <span className="mb-2 block text-sm text-neutral-500">
              Attività da svolgere prima dell’udienza
            </span>
            <textarea
              rows={3}
              value={form.pre_hearing_tasks}
              onChange={(event) =>
                onChange("pre_hearing_tasks", event.target.value)
              }
              className="w-full rounded-xl border border-neutral-300 px-4 py-3"
            />
          </label>
        </div>

        {message && <p className="mt-5 text-sm">{message}</p>}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-neutral-300 px-5 py-3 text-sm"
          >
            Annulla
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-neutral-900 px-5 py-3 text-sm text-white disabled:opacity-50"
          >
            {saving ? "Salvataggio..." : "Registra rinvio"}
          </button>
        </div>
      </form>
    </div>
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

function InfoCard({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <article className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-neutral-500">{label}</p>
      <p className="mt-2 font-semibold">
        {value ? value.replaceAll("_", " ") : "Non indicato"}
      </p>
    </article>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  return (
    <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs capitalize text-neutral-700">
      {(status || "aperto").replaceAll("_", " ")}
    </span>
  );
}
