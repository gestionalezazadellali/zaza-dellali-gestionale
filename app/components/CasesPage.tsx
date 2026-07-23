"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  createCounterparty,
  saveCaseWithCounterparties,
  type CounterpartyInput,
  type CounterpartyRecord,
} from "../../lib/counterparties";
import AnagraphicFormFields, {
  emptyAnagraphicForm,
  type AnagraphicFormValues,
} from "./AnagraphicFormFields";

export type ClientOption = {
  id: number;
  display_name: string;
};

export type CounterpartyOption = {
  id: number;
  name: string;
  display_name?: string | null;
  deleted_at?: string | null;
};

export type CaseCounterpartyLink = {
  id: number;
  counterparty_id: number;
  deleted_at: string | null;
  counterparties:
    | {
        id: number;
        name: string;
        display_name: string | null;
        deleted_at: string | null;
      }
    | {
        id: number;
        name: string;
        display_name: string | null;
        deleted_at: string | null;
      }[]
    | null;
};

export type CaseRecord = {
  id: number;
  client_contact_id: number | null;
  counterparty_id: number | null;
  title: string | null;
  case_type: string | null;
  claimant_name_raw: string | null;
  defendant_name_raw: string | null;
  court_type: string | null;
  court_city: string | null;
  section: string | null;
  rg_number: string | null;
  judge_name: string | null;
  status: string | null;
  responsible_user_id: string | null;
  opening_date: string | null;
  closing_date: string | null;
  description: string | null;
  notes: string | null;
  needs_review: boolean;
  contacts:
    | {
        display_name: string;
        last_name: string | null;
        email: string | null;
        phone: string | null;
      }
    | {
        display_name: string;
        last_name: string | null;
        email: string | null;
        phone: string | null;
      }[]
    | null;
  counterparties:
    | {
        id: number;
        name: string;
        display_name: string | null;
        deleted_at: string | null;
      }
    | {
        id: number;
        name: string;
        display_name: string | null;
        deleted_at: string | null;
      }[]
    | null;
  case_counterparties: CaseCounterpartyLink[] | null;
};

type CaseForm = {
  client_contact_id: string;
  counterparty_ids: number[];
  title: string;
  case_type: string;
  court_type: string;
  court_city: string;
  section: string;
  rg_number: string;
  judge_name: string;
  status: string;
  opening_date: string;
  description: string;
  notes: string;
};

const emptyForm: CaseForm = {
  client_contact_id: "",
  counterparty_ids: [],
  title: "",
  case_type: "causa_lavoro",
  court_type: "Tribunale Ordinario",
  court_city: "Roma",
  section: "Diritto del Lavoro",
  rg_number: "",
  judge_name: "",
  status: "nuova",
  opening_date: "",
  description: "",
  notes: "",
};

const caseTypes = [
  ["causa_lavoro", "Causa di lavoro"],
  ["decreto_ingiuntivo", "Decreto ingiuntivo"],
  ["opposizione_decreto_ingiuntivo", "Opposizione a decreto ingiuntivo"],
  ["esecuzione", "Esecuzione"],
  ["ottemperanza", "Giudizio di ottemperanza"],
  ["previdenza", "Previdenza e assistenza"],
  ["pubblico_impiego", "Pubblico impiego"],
  ["altro", "Altro"],
];

const caseStatuses = [
  ["nuova", "Nuova"],
  ["documenti_da_ricevere", "Documenti da ricevere"],
  ["diffida", "Diffida"],
  ["ricorso_in_preparazione", "Ricorso in preparazione"],
  ["depositato", "Depositato"],
  ["in_attesa_udienza", "In attesa di udienza"],
  ["definito", "Definito"],
  ["archiviato", "Archiviato"],
  ["importata_da_calendario", "Importata dal calendario"],
];

export default function CasesPage({
  studioId,
  cases,
  clients,
  counterparties,
  loading,
  initialClientId = null,
  initialEditCaseId = null,
  onRefresh,
  onOpenCase,
  onInitialClientHandled,
  onInitialEditHandled,
}: {
  studioId: string;
  cases: CaseRecord[];
  clients: ClientOption[];
  counterparties: CounterpartyOption[];
  loading: boolean;
  initialClientId?: number | null;
  initialEditCaseId?: number | null;
  onRefresh: () => Promise<void>;
  onOpenCase: (caseRecord: CaseRecord) => void;
  onInitialClientHandled?: () => void;
  onInitialEditHandled?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(() => initialClientId !== null);
  const [editingCase, setEditingCase] = useState<CaseRecord | null>(null);
  const [form, setForm] = useState<CaseForm>(() => ({
    ...emptyForm,
    client_contact_id:
      initialClientId === null ? "" : String(initialClientId),
  }));
  const [saving, setSaving] = useState(false);
  const [deletingCaseId, setDeletingCaseId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [additionalCounterparties, setAdditionalCounterparties] = useState<
    CounterpartyOption[]
  >([]);
  const [counterpartySearch, setCounterpartySearch] = useState("");
  const [showCounterpartyForm, setShowCounterpartyForm] = useState(false);
  const [counterpartyForm, setCounterpartyForm] =
    useState<AnagraphicFormValues>(emptyAnagraphicForm);
  const [savingCounterparty, setSavingCounterparty] = useState(false);
  const [counterpartyMessage, setCounterpartyMessage] = useState("");

  useEffect(() => {
    if (initialClientId !== null) {
      onInitialClientHandled?.();
    }
  }, [initialClientId, onInitialClientHandled]);

  useEffect(() => {
    if (initialEditCaseId === null) return;

    const item = cases.find((caseItem) => caseItem.id === initialEditCaseId);
    if (item) openEditForm(item);
    onInitialEditHandled?.();
  }, [cases, initialEditCaseId, onInitialEditHandled]);

  const availableCounterparties = useMemo(
    () => mergeCounterpartyOptions(counterparties, additionalCounterparties),
    [additionalCounterparties, counterparties]
  );

  const filteredCases = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("it");

    if (query.length < 2) return [];

    return cases.filter((item) => {
      const client = getClientName(item);
      const contact = Array.isArray(item.contacts)
        ? item.contacts[0]
        : item.contacts;
      const counterparty = getCounterpartyNames(item).join(" ");

      return [
        client,
        contact?.last_name,
        counterparty,
        item.title,
        item.rg_number,
        item.court_city,
        item.section,
        item.judge_name,
        item.status,
        item.case_type,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("it")
        .includes(query);
    });
  }, [cases, search]);

  function updateForm(field: keyof CaseForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function openNewForm() {
    setEditingCase(null);
    setForm(emptyForm);
    setCounterpartySearch("");
    setMessage("");
    setShowForm(true);
  }

  function openEditForm(item: CaseRecord) {
    const linkedCounterparties = getCaseCounterparties(item);

    setEditingCase(item);
    setAdditionalCounterparties((current) =>
      mergeCounterpartyOptions(
        current,
        linkedCounterparties.flatMap((counterparty) =>
          counterparty.id === null
            ? []
            : [
                {
                  id: counterparty.id,
                  name: counterparty.name,
                  display_name: counterparty.name,
                  deleted_at: counterparty.deleted_at,
                },
              ]
        )
      )
    );
    setForm({
      client_contact_id: item.client_contact_id
        ? String(item.client_contact_id)
        : "",
      counterparty_ids: linkedCounterparties.flatMap((counterparty) =>
        counterparty.id === null ? [] : [counterparty.id]
      ),
      title: item.title ?? "",
      case_type: item.case_type ?? "causa_lavoro",
      court_type: item.court_type ?? "Tribunale Ordinario",
      court_city: item.court_city ?? "",
      section: item.section ?? "",
      rg_number: item.rg_number ?? "",
      judge_name: item.judge_name ?? "",
      status: item.status ?? "nuova",
      opening_date: item.opening_date ?? "",
      description: item.description ?? "",
      notes: item.notes ?? "",
    });
    setCounterpartySearch("");
    setMessage("");
    setShowForm(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.client_contact_id) {
      setMessage("Seleziona il cliente.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const client = clients.find(
        (item) => item.id === Number(form.client_contact_id)
      );
      const selectedCounterpartyNames = form.counterparty_ids
        .map(
          (id) =>
            availableCounterparties.find((item) => item.id === id)?.display_name ||
            availableCounterparties.find((item) => item.id === id)?.name
        )
        .filter((name): name is string => Boolean(name));
      const generatedCounterpartyName =
        selectedCounterpartyNames.join(", ") || "controparte";

      const payload = {
        client_contact_id: Number(form.client_contact_id),
        title:
          form.title.trim() ||
          `${client?.display_name ?? "Cliente"} c/ ${generatedCounterpartyName}`,
        case_type: form.case_type,
        claimant_name_raw: client?.display_name ?? null,
        court_type: form.court_type.trim() || null,
        court_city: form.court_city.trim() || null,
        section: form.section.trim() || null,
        rg_number: form.rg_number.trim() || null,
        judge_name: form.judge_name.trim() || null,
        status: form.status,
        opening_date: form.opening_date || null,
        description: form.description.trim() || null,
        notes: form.notes.trim() || null,
        needs_review: false,
        active: true,
        ...(editingCase
          ? {}
          : {
              counterparty_id: form.counterparty_ids[0] ?? null,
              defendant_name_raw:
                selectedCounterpartyNames.join(", ") || null,
            }),
      };

      await saveCaseWithCounterparties({
        studioId,
        caseId: editingCase?.id,
        caseData: payload,
        counterpartyIds: form.counterparty_ids,
      });

      if (editingCase) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        await supabase.from("case_activities").insert({
          studio_id: studioId,
          case_id: editingCase.id,
          activity_type: "modifica_pratica",
          title: "Pratica modificata",
          description: "Aggiornati i dati della pratica.",
          activity_at: new Date().toISOString(),
          created_by: user?.id ?? null,
        });
      }

      await onRefresh();

      setShowForm(false);
      setEditingCase(null);
      setForm(emptyForm);
      setMessage(
        editingCase
          ? "Pratica aggiornata correttamente."
          : "Nuova pratica creata correttamente."
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `Errore: ${error.message}`
          : "Errore durante il salvataggio."
      );
    } finally {
      setSaving(false);
    }
  }

  function toggleCounterparty(counterpartyId: number) {
    setForm((current) => ({
      ...current,
      counterparty_ids: current.counterparty_ids.includes(counterpartyId)
        ? current.counterparty_ids.filter((id) => id !== counterpartyId)
        : [...current.counterparty_ids, counterpartyId],
    }));
  }

  async function handleCreateCounterparty(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setSavingCounterparty(true);
    setCounterpartyMessage("");

    try {
      const created = await createCounterparty(
        studioId,
        counterpartyForm as CounterpartyInput
      );
      const option = counterpartyRecordToOption(created);

      setAdditionalCounterparties((current) =>
        mergeCounterpartyOptions(current, [option])
      );
      setForm((current) => ({
        ...current,
        counterparty_ids: [...new Set([...current.counterparty_ids, created.id])],
      }));
      setCounterpartyForm(emptyAnagraphicForm);
      setShowCounterpartyForm(false);
      setCounterpartySearch("");
      setMessage("Nuova controparte creata e selezionata.");
      await onRefresh();
    } catch (error) {
      setCounterpartyMessage(
        error instanceof Error
          ? `Errore: ${error.message}`
          : "Errore durante il salvataggio della controparte."
      );
    } finally {
      setSavingCounterparty(false);
    }
  }

  async function handleDelete(item: CaseRecord) {
    const confirmed = window.confirm(
      "Vuoi spostare questa pratica nel cestino? Potrai ripristinarla successivamente."
    );

    if (!confirmed) return;

    setDeletingCaseId(item.id);
    setMessage("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) throw new Error("Utente non autenticato.");

      const { error } = await supabase
        .from("cases")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: user.id,
          delete_reason: "Eliminata dalla sezione Pratiche",
        })
        .eq("id", item.id);

      if (error) throw error;

      await onRefresh();
      setMessage("Pratica spostata nel cestino.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Errore durante l’eliminazione."
      );
    } finally {
      setDeletingCaseId(null);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-8">
        Caricamento pratiche...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <label className="block flex-1">
            <span className="mb-2 block text-sm text-neutral-500">
              Cerca pratica
            </span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cliente, controparte, RG, tribunale o giudice"
              className="w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-neutral-600"
            />
          </label>

          <button
            type="button"
            onClick={openNewForm}
            className="rounded-xl bg-neutral-900 px-5 py-3 text-sm font-medium text-white"
          >
            Nuova pratica
          </button>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-500">
          {search.trim().length < 2
            ? "Inserisci almeno due caratteri per cercare una pratica."
            : `Pratiche trovate: ${filteredCases.length}`}
        </p>
        {message && <p className="text-sm text-neutral-600">{message}</p>}
      </div>

      <section className="grid gap-4">
        {filteredCases.map((item) => (
          <article
            key={item.id}
            className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <button
                type="button"
                onClick={() => onOpenCase(item)}
                className="flex-1 text-left"
              >
                <h3 className="text-lg font-semibold">
                  {getClientName(item) || `Pratica n. ${item.id}`}
                </h3>
                <p className="mt-1 text-sm text-neutral-500">
                  Controparti:{" "}
                  {getCounterpartyNames(item).join(", ") || "Non indicate"}
                </p>
                <p className="mt-3 text-sm">
                  {item.court_type || "Ufficio non indicato"}
                  {item.court_city ? ` di ${item.court_city}` : ""}
                  {item.section ? ` · ${item.section}` : ""}
                </p>
                <p className="mt-1 text-sm text-neutral-500">
                  RG: {item.rg_number || "Non indicato"}
                  {item.judge_name ? ` · Giudice: ${item.judge_name}` : ""}
                </p>
              </button>

              <div className="flex flex-col items-start gap-3 sm:items-end">
                <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs capitalize text-neutral-700">
                  {(item.status || "stato_non_indicato").replaceAll("_", " ")}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => openEditForm(item)}
                    className="rounded-xl border border-neutral-300 px-3 py-2 text-xs"
                  >
                    Modifica
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item)}
                    disabled={deletingCaseId === item.id}
                    className="rounded-xl bg-red-600 px-3 py-2 text-xs text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {deletingCaseId === item.id ? "Eliminazione..." : "Elimina"}
                  </button>
                </div>
              </div>
            </div>
          </article>
        ))}
      </section>

      {showForm && (
        <CaseFormModal
          form={form}
          clients={clients}
          counterparties={availableCounterparties}
          counterpartySearch={counterpartySearch}
          editing={Boolean(editingCase)}
          saving={saving}
          message={message}
          onChange={updateForm}
          onCounterpartySearchChange={setCounterpartySearch}
          onToggleCounterparty={toggleCounterparty}
          onCreateCounterparty={() => {
            setCounterpartyForm(emptyAnagraphicForm);
            setCounterpartyMessage("");
            setShowCounterpartyForm(true);
          }}
          onSubmit={handleSubmit}
          onClose={() => {
            setShowForm(false);
            setEditingCase(null);
            setForm(emptyForm);
            setMessage("");
          }}
        />
      )}

      {showCounterpartyForm && (
        <InlineCounterpartyFormModal
          form={counterpartyForm}
          saving={savingCounterparty}
          message={counterpartyMessage}
          onChange={(field, value) =>
            setCounterpartyForm((current) => ({
              ...current,
              [field]: value,
            }))
          }
          onSubmit={handleCreateCounterparty}
          onClose={() => {
            setShowCounterpartyForm(false);
            setCounterpartyForm(emptyAnagraphicForm);
            setCounterpartyMessage("");
          }}
        />
      )}
    </div>
  );
}

function CaseFormModal({
  form,
  clients,
  counterparties,
  counterpartySearch,
  editing,
  saving,
  message,
  onChange,
  onCounterpartySearchChange,
  onToggleCounterparty,
  onCreateCounterparty,
  onSubmit,
  onClose,
}: {
  form: CaseForm;
  clients: ClientOption[];
  counterparties: CounterpartyOption[];
  counterpartySearch: string;
  editing: boolean;
  saving: boolean;
  message: string;
  onChange: (field: keyof CaseForm, value: string) => void;
  onCounterpartySearchChange: (value: string) => void;
  onToggleCounterparty: (counterpartyId: number) => void;
  onCreateCounterparty: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 px-4 py-10">
      <form
        onSubmit={onSubmit}
        className="mx-auto w-full max-w-5xl rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-neutral-500">
              {editing ? "Modifica procedimento" : "Nuovo procedimento"}
            </p>
            <h3 className="mt-1 text-xl font-semibold">
              {editing ? "Modifica pratica" : "Crea nuova pratica"}
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
          <SelectField
            label="Cliente *"
            value={form.client_contact_id}
            onChange={(value) => onChange("client_contact_id", value)}
            options={[
              ["", "Seleziona cliente"],
              ...clients.map((item) => [String(item.id), item.display_name]),
            ]}
          />

          <CounterpartySelector
            counterparties={counterparties}
            selectedIds={form.counterparty_ids}
            search={counterpartySearch}
            onSearchChange={onCounterpartySearchChange}
            onToggle={onToggleCounterparty}
            onCreate={onCreateCounterparty}
          />

          <InputField
            label="Titolo pratica"
            value={form.title}
            onChange={(value) => onChange("title", value)}
            placeholder="Es. Rossi c/ Alfa S.r.l."
          />

          <SelectField
            label="Tipo pratica"
            value={form.case_type}
            onChange={(value) => onChange("case_type", value)}
            options={caseTypes}
          />

          <SelectField
            label="Stato"
            value={form.status}
            onChange={(value) => onChange("status", value)}
            options={caseStatuses}
          />

          <InputField
            label="Ufficio giudiziario"
            value={form.court_type}
            onChange={(value) => onChange("court_type", value)}
          />

          <InputField
            label="Città / Tribunale"
            value={form.court_city}
            onChange={(value) => onChange("court_city", value)}
          />

          <InputField
            label="Sezione"
            value={form.section}
            onChange={(value) => onChange("section", value)}
          />

          <InputField
            label="Numero RG"
            value={form.rg_number}
            onChange={(value) => onChange("rg_number", value)}
            placeholder="Es. 12345/2026"
          />

          <InputField
            label="Giudice"
            value={form.judge_name}
            onChange={(value) => onChange("judge_name", value)}
          />

          <InputField
            label="Data apertura"
            type="date"
            value={form.opening_date}
            onChange={(value) => onChange("opening_date", value)}
          />

          <label className="block sm:col-span-2">
            <span className="mb-2 block text-sm text-neutral-500">
              Descrizione
            </span>
            <textarea
              rows={3}
              value={form.description}
              onChange={(event) =>
                onChange("description", event.target.value)
              }
              className="w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-neutral-600"
            />
          </label>

          <label className="block sm:col-span-2">
            <span className="mb-2 block text-sm text-neutral-500">Note</span>
            <textarea
              rows={4}
              value={form.notes}
              onChange={(event) => onChange("notes", event.target.value)}
              className="w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-neutral-600"
            />
          </label>
        </div>

        {message && (
          <p className="mt-5 text-sm text-neutral-600">{message}</p>
        )}

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
            {saving
              ? "Salvataggio..."
              : editing
                ? "Salva modifiche"
                : "Crea pratica"}
          </button>
        </div>
      </form>
    </div>
  );
}

function CounterpartySelector({
  counterparties,
  selectedIds,
  search,
  onSearchChange,
  onToggle,
  onCreate,
}: {
  counterparties: CounterpartyOption[];
  selectedIds: number[];
  search: string;
  onSearchChange: (value: string) => void;
  onToggle: (counterpartyId: number) => void;
  onCreate: () => void;
}) {
  const query = search.trim().toLocaleLowerCase("it");
  const selected = selectedIds.flatMap((id) => {
    const item = counterparties.find((counterparty) => counterparty.id === id);
    return item ? [item] : [];
  });
  const results = counterparties
    .filter((item) => !item.deleted_at && !selectedIds.includes(item.id))
    .filter((item) =>
      (item.display_name || item.name)
        .toLocaleLowerCase("it")
        .includes(query)
    )
    .slice(0, 8);

  return (
    <section className="space-y-4 rounded-xl border border-neutral-200 p-4 sm:col-span-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block flex-1">
          <span className="mb-2 block text-sm text-neutral-500">
            Cerca controparti esistenti
          </span>
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Cerca per nominativo"
            className="w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-neutral-600"
          />
        </label>
        <button
          type="button"
          onClick={onCreate}
          className="rounded-xl border border-neutral-900 px-4 py-3 text-sm font-medium"
        >
          Crea nuova controparte
        </button>
      </div>

      <div>
        <p className="text-xs uppercase tracking-wide text-neutral-500">
          Controparti selezionate
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {selected.length === 0 ? (
            <p className="text-sm text-neutral-500">
              Nessuna controparte selezionata.
            </p>
          ) : (
            selected.map((item) => (
              <span
                key={item.id}
                className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm ${
                  item.deleted_at
                    ? "bg-amber-100 text-amber-900"
                    : "bg-neutral-900 text-white"
                }`}
              >
                {item.display_name || item.name}
                {item.deleted_at && (
                  <span className="text-xs">Eliminata · storico</span>
                )}
                <button
                  type="button"
                  onClick={() => onToggle(item.id)}
                  className="rounded-full px-1 hover:bg-black/10"
                  aria-label={`Scollega ${item.display_name || item.name}`}
                  title="Scollega dalla pratica senza eliminare l’anagrafica"
                >
                  ×
                </button>
              </span>
            ))
          )}
        </div>
      </div>

      <div>
        <p className="text-xs uppercase tracking-wide text-neutral-500">
          Risultati
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {results.length === 0 ? (
            <p className="text-sm text-neutral-500 sm:col-span-2">
              Nessun’altra controparte disponibile.
            </p>
          ) : (
            results.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onToggle(item.id)}
                className="rounded-xl border border-neutral-200 px-3 py-3 text-left text-sm transition hover:border-neutral-500 hover:bg-neutral-50"
              >
                <span className="font-medium">
                  {item.display_name || item.name}
                </span>
                <span className="ml-2 text-neutral-500">Seleziona</span>
              </button>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function InlineCounterpartyFormModal({
  form,
  saving,
  message,
  onChange,
  onSubmit,
  onClose,
}: {
  form: AnagraphicFormValues;
  saving: boolean;
  message: string;
  onChange: (field: keyof AnagraphicFormValues, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/60 px-4 py-10">
      <form
        onSubmit={onSubmit}
        className="mx-auto w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-neutral-500">Dalla pratica</p>
            <h3 className="mt-1 text-xl font-semibold">Nuova controparte</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-neutral-300 px-3 py-2 text-sm"
          >
            Chiudi
          </button>
        </div>

        <AnagraphicFormFields values={form} onChange={onChange} />

        {message && <p className="mt-5 text-sm text-red-700">{message}</p>}

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
            {saving ? "Salvataggio..." : "Salva e seleziona"}
          </button>
        </div>
      </form>
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  type = "text",
  placeholder = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-neutral-500">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-neutral-600"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[][];
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-neutral-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 outline-none focus:border-neutral-600"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={`${optionValue}-${optionLabel}`} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function getClientName(item: CaseRecord) {
  if (!item.contacts) return item.claimant_name_raw ?? "";

  return Array.isArray(item.contacts)
    ? item.contacts[0]?.display_name ?? item.claimant_name_raw ?? ""
    : item.contacts.display_name;
}

export type CaseCounterpartyDisplay = {
  id: number | null;
  name: string;
  deleted_at: string | null;
};

export function getCaseCounterparties(
  item: CaseRecord
): CaseCounterpartyDisplay[] {
  const relationHistory = item.case_counterparties ?? [];
  const activeRelations = relationHistory.filter((link) => !link.deleted_at);
  const related = activeRelations.flatMap((link) => {
    const counterparty = Array.isArray(link.counterparties)
      ? link.counterparties[0]
      : link.counterparties;

    if (!counterparty) return [];

    return [
      {
        id: counterparty.id,
        name: counterparty.display_name || counterparty.name,
        deleted_at: counterparty.deleted_at,
      },
    ];
  });

  if (related.length > 0) return related;

  // A relation history with no active rows means the user explicitly unlinked
  // every counterparty: the legacy snapshot must not make it reappear.
  if (relationHistory.length > 0 && activeRelations.length === 0) return [];

  const legacyCounterparty = Array.isArray(item.counterparties)
    ? item.counterparties[0]
    : item.counterparties;

  if (legacyCounterparty) {
    return [
      {
        id: item.counterparty_id,
        name: legacyCounterparty.display_name || legacyCounterparty.name,
        deleted_at: legacyCounterparty.deleted_at,
      },
    ];
  }

  return item.defendant_name_raw
    ? [{ id: null, name: item.defendant_name_raw, deleted_at: null }]
    : [];
}

export function getCounterpartyNames(item: CaseRecord) {
  return getCaseCounterparties(item).map((counterparty) => counterparty.name);
}

function mergeCounterpartyOptions(...groups: CounterpartyOption[][]) {
  const merged = new Map<number, CounterpartyOption>();

  for (const group of groups) {
    for (const item of group) merged.set(item.id, item);
  }

  return [...merged.values()].sort((a, b) =>
    (a.display_name || a.name).localeCompare(b.display_name || b.name, "it")
  );
}

function counterpartyRecordToOption(
  item: CounterpartyRecord
): CounterpartyOption {
  return {
    id: item.id,
    name: item.name,
    display_name: item.display_name,
    deleted_at: item.deleted_at,
  };
}
