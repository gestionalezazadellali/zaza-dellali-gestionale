"use client";

import { FormEvent, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  getCounterpartyNames,
  type CaseRecord,
} from "./CasesPage";

export type DeadlineEvent = {
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

type DeadlineForm = {
  case_id: string;
  title: string;
  description: string;
  date: string;
  time: string;
};

const emptyForm: DeadlineForm = {
  case_id: "",
  title: "",
  description: "",
  date: "",
  time: "18:00",
};

export default function DeadlinesPage({
  studioId,
  events,
  cases,
  onRefresh,
  onOpenCase,
}: {
  studioId: string;
  events: DeadlineEvent[];
  cases: CaseRecord[];
  onRefresh: () => Promise<void>;
  onOpenCase: (caseId: number) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<DeadlineForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deletingEventId, setDeletingEventId] = useState<number | null>(null);
  const [currentTime] = useState(Date.now);
  const [showExpired, setShowExpired] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [message, setMessage] = useState("");

  const deadlines = useMemo(
    () =>
      events
        .filter((event) => event.is_deadline)
        .sort(
          (a, b) =>
            new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
        ),
    [events]
  );

  const activeDeadlines = useMemo(
    () =>
      deadlines.filter(
        (item) =>
          item.status !== "completato" &&
          new Date(item.start_at).getTime() >= currentTime
      ),
    [currentTime, deadlines]
  );

  const archivedDeadlines = useMemo(
    () =>
      deadlines.filter(
        (item) =>
          item.status === "completato" ||
          new Date(item.start_at).getTime() < currentTime
      ),
    [currentTime, deadlines, showExpired]
  );

  const visibleDeadlines = showExpired
    ? archivedDeadlines
    : activeDeadlines;
  const expiredCount = archivedDeadlines.length;

  function toggleSelected(id: number) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  }

  async function completeSelected() {
    const actionable = selectedIds.filter((id) =>
      deadlines.some((item) => item.id === id && item.status !== "completato")
    );
    if (actionable.length === 0) return;
    if (!window.confirm(`Segnare come completate ${actionable.length} scadenze?`)) return;

    const { error } = await supabase
      .from("events")
      .update({ status: "completato", completed_at: new Date().toISOString() })
      .eq("studio_id", studioId)
      .in("id", actionable);
    if (error) {
      setMessage(`Errore: ${error.message}`);
      return;
    }
    setSelectedIds([]);
    await onRefresh();
    setMessage("Scadenze selezionate completate.");
  }

  async function deleteSelected() {
    if (selectedIds.length === 0) return;
    if (
      !window.confirm(
        `Spostare nel cestino le ${selectedIds.length} scadenze selezionate?`
      )
    )
      return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setMessage("Utente non autenticato.");
      return;
    }

    const { error } = await supabase
      .from("events")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: user.id,
        delete_reason: "Eliminazione multipla dalla sezione Scadenze",
      })
      .eq("studio_id", studioId)
      .in("id", selectedIds);

    if (error) {
      setMessage(`Errore: ${error.message}`);
      return;
    }
    setSelectedIds([]);
    await onRefresh();
    setMessage("Scadenze selezionate spostate nel cestino.");
  }

  function updateForm(field: keyof DeadlineForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function createDeadline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.case_id || !form.title.trim() || !form.date) {
      setMessage("Seleziona la pratica e inserisci titolo e data.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const startAt = new Date(
        `${form.date}T${form.time || "18:00"}:00`
      ).toISOString();

      const { error } = await supabase.from("events").insert({
        studio_id: studioId,
        case_id: Number(form.case_id),
        event_type: "SCADENZA",
        title: form.title.trim(),
        description: form.description.trim() || null,
        start_at: startAt,
        end_at: null,
        all_day: false,
        is_hearing: false,
        is_deadline: true,
        status: "aperto",
        source: "sezione_scadenze",
      });

      if (error) throw error;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      await supabase.from("case_activities").insert({
        studio_id: studioId,
        case_id: Number(form.case_id),
        activity_type: "scadenza",
        title: "Nuova scadenza aggiunta",
        description: form.title.trim(),
        activity_at: startAt,
        created_by: user?.id ?? null,
      });

      await onRefresh();
      setForm(emptyForm);
      setShowForm(false);
      setMessage("Scadenza inserita correttamente.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `Errore: ${error.message}`
          : "Errore durante il salvataggio della scadenza."
      );
    } finally {
      setSaving(false);
    }
  }

  async function markCompleted(eventId: number) {
    setMessage("");

    const { error } = await supabase
      .from("events")
      .update({
        status: "completato",
        completed_at: new Date().toISOString(),
      })
      .eq("id", eventId)
      .eq("studio_id", studioId);

    if (error) {
      setMessage(`Errore: ${error.message}`);
      return;
    }

    const completedItem = deadlines.find((item) => item.id === eventId);
    if (completedItem?.case_id) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await supabase.from("case_activities").insert({
        studio_id: studioId,
        case_id: completedItem.case_id,
        activity_type: "scadenza",
        title: "Scadenza completata",
        description: completedItem.title,
        activity_at: new Date().toISOString(),
        created_by: user?.id ?? null,
      });
    }

    await onRefresh();
    setMessage("Scadenza completata.");
  }

  async function handleDeleteEvent(item: DeadlineEvent) {
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
          delete_reason: "Eliminata dalla sezione Scadenze",
        })
        .eq("id", item.id)
        .eq("studio_id", studioId);

      if (error) throw error;

      await onRefresh();
      setMessage("Scadenza spostata nel cestino.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Errore durante l’eliminazione della scadenza."
      );
    } finally {
      setDeletingEventId(null);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-xl font-semibold">Scadenze</h3>
            <p className="mt-1 text-sm text-neutral-500">
              Tutti gli adempimenti sono raccolti qui in ordine cronologico.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setForm(emptyForm);
              setMessage("");
              setShowForm(true);
            }}
            className="rounded-xl bg-neutral-900 px-5 py-3 text-sm font-medium text-white"
          >
            Nuova scadenza
          </button>
        </div>

        {message && <p className="mt-4 text-sm">{message}</p>}

        <div className="mt-4 flex flex-wrap gap-2">
          {visibleDeadlines.length > 0 && (
            <button
              type="button"
              onClick={() =>
                setSelectedIds((current) =>
                  current.length === visibleDeadlines.length
                    ? []
                    : visibleDeadlines.map((item) => item.id)
                )
              }
              className="mt-4 rounded-xl border border-neutral-300 px-4 py-2 text-sm"
            >
              {selectedIds.length === visibleDeadlines.length
                ? "Deseleziona tutte"
                : "Seleziona tutte"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowExpired((current) => !current)}
            className="mt-4 rounded-xl border border-neutral-300 px-4 py-2 text-sm"
          >
            {showExpired
              ? "Torna alle scadenze aperte"
              : `Scadute e completate (${expiredCount})`}
          </button>
          {selectedIds.length > 0 && (
            <>
              {!showExpired && (
                <button
                  type="button"
                  onClick={completeSelected}
                  className="rounded-xl bg-green-700 px-4 py-2 text-sm text-white"
                >
                  Completa selezionate ({selectedIds.length})
                </button>
              )}
              {showExpired && (
                <button
                  type="button"
                  onClick={deleteSelected}
                  className="rounded-xl bg-red-600 px-4 py-2 text-sm text-white"
                >
                  Elimina selezionate ({selectedIds.length})
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="rounded-xl border border-neutral-300 px-4 py-2 text-sm"
              >
                Deseleziona
              </button>
            </>
          )}
        </div>
      </section>

      <section className="space-y-3">
        {visibleDeadlines.length === 0 ? (
          <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-sm text-neutral-500">
            Nessuna scadenza presente.
          </div>
        ) : (
          visibleDeadlines.map((item) => {
            const caseRecord = cases.find(
              (caseItem) => caseItem.id === item.case_id
            );
            const isCompleted = item.status === "completato";
            const isOverdue =
              !isCompleted && new Date(item.start_at).getTime() < currentTime;

            return (
              <article
                key={item.id}
                className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(item.id)}
                    onChange={() => toggleSelected(item.id)}
                    aria-label={`Seleziona ${item.title}`}
                    className="mt-1 h-5 w-5 rounded border-neutral-300"
                  />
                  <button
                    type="button"
                    disabled={!caseRecord}
                    onClick={() => {
                      if (caseRecord) onOpenCase(caseRecord.id);
                    }}
                    className="min-w-0 flex-1 text-left disabled:cursor-default"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-semibold">{item.title}</h4>
                      {isOverdue && (
                        <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs text-red-700">
                          Scaduta
                        </span>
                      )}
                      {isCompleted && (
                        <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs text-green-700">
                          Completata
                        </span>
                      )}
                    </div>

                    <p className="mt-2 text-sm font-medium">
                      {formatDate(item.start_at)}
                    </p>
                    <p className="mt-1 text-sm text-neutral-500">
                      {caseRecord
                        ? getCaseLabel(caseRecord)
                        : "Pratica non disponibile"}
                    </p>
                    {item.description && (
                      <p className="mt-2 text-sm text-neutral-600">
                        {item.description}
                      </p>
                    )}
                  </button>

                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs capitalize text-neutral-700">
                      {(item.status || "aperto").replaceAll("_", " ")}
                    </span>

                    {!isCompleted && (
                      <button
                        type="button"
                        onClick={() => markCompleted(item.id)}
                        className="rounded-xl border border-neutral-300 px-3 py-2 text-xs"
                      >
                        Segna completata
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleDeleteEvent(item)}
                      disabled={deletingEventId === item.id}
                      className="rounded-xl bg-red-600 px-3 py-2 text-xs text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {deletingEventId === item.id
                        ? "Eliminazione..."
                        : "Elimina"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </section>

      {showForm && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 px-4 py-10">
          <form
            onSubmit={createDeadline}
            className="mx-auto w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-neutral-500">Sezione Scadenze</p>
                <h3 className="mt-1 text-xl font-semibold">
                  Nuova scadenza
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-xl border border-neutral-300 px-3 py-2 text-sm"
              >
                Chiudi
              </button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-2 block text-sm text-neutral-500">
                  Pratica *
                </span>
                <select
                  required
                  value={form.case_id}
                  onChange={(event) =>
                    updateForm("case_id", event.target.value)
                  }
                  className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3"
                >
                  <option value="">Seleziona pratica</option>
                  {cases.map((item) => (
                    <option key={item.id} value={item.id}>
                      {getCaseLabel(item)}
                    </option>
                  ))}
                </select>
              </label>

              <Input
                label="Titolo *"
                value={form.title}
                onChange={(value) => updateForm("title", value)}
              />
              <Input
                label="Data *"
                type="date"
                value={form.date}
                onChange={(value) => updateForm("date", value)}
              />
              <Input
                label="Ora"
                type="time"
                value={form.time}
                onChange={(value) => updateForm("time", value)}
              />

              <label className="block sm:col-span-2">
                <span className="mb-2 block text-sm text-neutral-500">
                  Descrizione
                </span>
                <textarea
                  rows={4}
                  value={form.description}
                  onChange={(event) =>
                    updateForm("description", event.target.value)
                  }
                  className="w-full rounded-xl border border-neutral-300 px-4 py-3"
                />
              </label>
            </div>

            {message && <p className="mt-5 text-sm">{message}</p>}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-xl border border-neutral-300 px-5 py-3 text-sm"
              >
                Annulla
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-neutral-900 px-5 py-3 text-sm text-white disabled:opacity-50"
              >
                {saving ? "Salvataggio..." : "Salva scadenza"}
              </button>
            </div>
          </form>
        </div>
      )}
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

function getCaseLabel(item: CaseRecord) {
  const contact = Array.isArray(item.contacts)
    ? item.contacts[0]
    : item.contacts;
  const claimant =
    contact?.last_name ||
    contact?.display_name ||
    item.claimant_name_raw ||
    `Pratica n. ${item.id}`;
  const defendant =
    getCounterpartyNames(item).join(", ") ||
    item.defendant_name_raw ||
    "controparte non indicata";

  return `${claimant} c. ${defendant}`;
}
