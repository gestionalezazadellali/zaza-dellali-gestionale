"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

export type ClientOption = {
  id: number;
  display_name: string;
};

export type CounterpartyOption = {
  id: number;
  name: string;
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
        name: string;
      }
    | {
        name: string;
      }[]
    | null;
};

type CaseForm = {
  client_contact_id: string;
  counterparty_id: string;
  new_counterparty_name: string;
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
  counterparty_id: "",
  new_counterparty_name: "",
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
  onRefresh,
  onOpenCase,
  onInitialClientHandled,
}: {
  studioId: string;
  cases: CaseRecord[];
  clients: ClientOption[];
  counterparties: CounterpartyOption[];
  loading: boolean;
  initialClientId?: number | null;
  onRefresh: () => Promise<void>;
  onOpenCase: (caseRecord: CaseRecord) => void;
  onInitialClientHandled?: () => void;
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

  useEffect(() => {
    if (initialClientId !== null) {
      onInitialClientHandled?.();
    }
  }, [initialClientId, onInitialClientHandled]);

  const filteredCases = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("it");

    if (query.length < 2) return [];

    return cases.filter((item) => {
      const client = getClientName(item);
      const contact = Array.isArray(item.contacts)
        ? item.contacts[0]
        : item.contacts;
      const counterparty = getCounterpartyName(item);

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
    setMessage("");
    setShowForm(true);
  }

  function openEditForm(item: CaseRecord) {
    setEditingCase(item);
    setForm({
      client_contact_id: item.client_contact_id
        ? String(item.client_contact_id)
        : "",
      counterparty_id: item.counterparty_id
        ? String(item.counterparty_id)
        : "",
      new_counterparty_name: "",
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
    setMessage("");
    setShowForm(true);
  }

  async function getOrCreateCounterpartyId() {
    if (form.counterparty_id) {
      return Number(form.counterparty_id);
    }

    const name = form.new_counterparty_name.trim();
    if (!name) return null;

    const normalizedName = name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("it")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

    const existing = counterparties.find(
      (item) =>
        item.name
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLocaleLowerCase("it")
          .replace(/[^a-z0-9]+/g, " ")
          .trim() === normalizedName
    );

    if (existing) return existing.id;

    const { data, error } = await supabase
      .from("counterparties")
      .insert({
        studio_id: studioId,
        name,
        normalized_name: normalizedName,
        counterparty_type: "da_classificare",
        active: true,
      })
      .select("id")
      .single();

    if (error) throw error;
    return data.id as number;
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
      const counterpartyId = await getOrCreateCounterpartyId();

      const client = clients.find(
        (item) => item.id === Number(form.client_contact_id)
      );
      const counterparty = counterparties.find(
        (item) => item.id === counterpartyId
      );

      const payload = {
        studio_id: studioId,
        client_contact_id: Number(form.client_contact_id),
        counterparty_id: counterpartyId,
        title:
          form.title.trim() ||
          `${client?.display_name ?? "Cliente"} c/ ${
            counterparty?.name ||
            form.new_counterparty_name.trim() ||
            "controparte"
          }`,
        case_type: form.case_type,
        claimant_name_raw: client?.display_name ?? null,
        defendant_name_raw:
          counterparty?.name ||
          form.new_counterparty_name.trim() ||
          null,
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
      };

      const result = editingCase
        ? await supabase
            .from("cases")
            .update(payload)
            .eq("id", editingCase.id)
        : await supabase.from("cases").insert(payload);

      if (result.error) throw result.error;

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
                  Controparte: {getCounterpartyName(item) || "Non indicata"}
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
          counterparties={counterparties}
          editing={Boolean(editingCase)}
          saving={saving}
          message={message}
          onChange={updateForm}
          onSubmit={handleSubmit}
          onClose={() => {
            setShowForm(false);
            setEditingCase(null);
            setForm(emptyForm);
            setMessage("");
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
  editing,
  saving,
  message,
  onChange,
  onSubmit,
  onClose,
}: {
  form: CaseForm;
  clients: ClientOption[];
  counterparties: CounterpartyOption[];
  editing: boolean;
  saving: boolean;
  message: string;
  onChange: (field: keyof CaseForm, value: string) => void;
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

          <SelectField
            label="Controparte già presente"
            value={form.counterparty_id}
            onChange={(value) => onChange("counterparty_id", value)}
            options={[
              ["", "Seleziona controparte"],
              ...counterparties.map((item) => [String(item.id), item.name]),
            ]}
          />

          <InputField
            label="Nuova controparte"
            value={form.new_counterparty_name}
            onChange={(value) => onChange("new_counterparty_name", value)}
            placeholder="Compila solo se non è già presente"
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

function getCounterpartyName(item: CaseRecord) {
  if (!item.counterparties) return item.defendant_name_raw ?? "";

  return Array.isArray(item.counterparties)
    ? item.counterparties[0]?.name ?? item.defendant_name_raw ?? ""
    : item.counterparties.name;
}
