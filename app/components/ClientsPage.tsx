"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import AnagraphicFormFields, {
  emptyAnagraphicForm,
  type AnagraphicFormValues,
} from "./AnagraphicFormFields";

export type ClientRecord = {
  id: number;
  contact_type: string;
  first_name: string | null;
  last_name: string | null;
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
  birth_place: string | null;
  birth_date: string | null;
  notes: string | null;
  needs_review: boolean;
};

export type ClientCase = {
  id: number;
  client_contact_id: number | null;
  title: string | null;
  claimant_name_raw: string | null;
  defendant_name_raw: string | null;
  court_type: string | null;
  court_city: string | null;
  section: string | null;
  rg_number: string | null;
  judge_name: string | null;
  status: string | null;
};

export type ClientInvoice = {
  id: number;
  invoice_number: string;
  issue_date: string | null;
  due_date: string | null;
  description: string | null;
  taxable_amount: number;
  general_expenses_amount: number;
  cpa_amount: number;
  tax_amount: number;
  exempt_expenses_amount: number;
  withholding_amount: number;
  total_amount: number;
  paid_amount: number;
  status: string;
  issuing_lawyer_name: string | null;
  notes: string | null;
};

type ClientForm = AnagraphicFormValues;

const emptyForm: ClientForm = emptyAnagraphicForm;

export default function ClientsPage({
  clients,
  cases,
  studioId,
  initialClientId = null,
  onClientsChanged,
  onOpenCase,
  onEditCase,
  onAddCase,
  onOpenInvoice,
  onClientDetailClose,
}: {
  clients: ClientRecord[];
  cases: ClientCase[];
  studioId: string;
  initialClientId?: number | null;
  onClientsChanged: () => Promise<void>;
  onOpenCase: (caseId: number) => void;
  onEditCase: (caseId: number) => void;
  onAddCase: (clientId: number) => void;
  onOpenInvoice: (invoiceId: number) => void;
  onClientDetailClose?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<ClientRecord | null>(
    () => clients.find((client) => client.id === initialClientId) ?? null
  );
  const [showForm, setShowForm] = useState(false);
  const [editingClient, setEditingClient] =
    useState<ClientRecord | null>(null);
  const [form, setForm] = useState<ClientForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deletingClientId, setDeletingClientId] = useState<number | null>(null);
  const [deletingCaseId, setDeletingCaseId] = useState<number | null>(null);
  const [selectedClientIds, setSelectedClientIds] = useState<number[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!initialClientId) return;

    const loadedClient = clients.find(
      (client) => client.id === initialClientId
    );

    if (loadedClient) {
      setSelectedClient(loadedClient);
      return;
    }

    let cancelled = false;

    async function loadSelectedClient() {
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
        .eq("id", initialClientId)
        .is("deleted_at", null)
        .single();

      if (cancelled) return;

      if (error) {
        setMessage(`Impossibile aprire il cliente: ${error.message}`);
        return;
      }

      setSelectedClient(data as ClientRecord);
    }

    loadSelectedClient();

    return () => {
      cancelled = true;
    };
  }, [clients, initialClientId]);

  const filteredClients = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("it");

    if (!query) {
      return clients;
    }

    return clients.filter((client) => {
      const combined = [
        client.display_name,
        client.first_name,
        client.last_name,
        client.fiscal_code,
        client.vat_number,
        client.email,
        client.pec,
        client.phone,
        client.mobile_phone,
        client.organization,
        client.city,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("it");

      return combined.includes(query);
    });
  }, [clients, search]);

  const selectedClientCases = useMemo(() => {
    if (!selectedClient) {
      return [];
    }

    return cases.filter(
      (caseRecord) =>
        caseRecord.client_contact_id === selectedClient.id
    );
  }, [cases, selectedClient]);

  function updateForm(field: keyof ClientForm, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function openNewClientForm() {
    setEditingClient(null);
    setForm(emptyForm);
    setMessage("");
    setShowForm(true);
  }

  function openEditClientForm(client: ClientRecord) {
    setEditingClient(client);

    setForm({
      first_name: client.first_name ?? "",
      last_name: client.last_name ?? "",
      display_name: client.display_name ?? "",
      fiscal_code: client.fiscal_code ?? "",
      vat_number: client.vat_number ?? "",
      email: client.email ?? "",
      pec: client.pec ?? "",
      phone: client.phone ?? "",
      mobile_phone: client.mobile_phone ?? "",
      organization: client.organization ?? "",
      job_title: client.job_title ?? "",
      address: client.address ?? "",
      city: client.city ?? "",
      postal_code: client.postal_code ?? "",
      province: client.province ?? "",
      birth_place: client.birth_place ?? "",
      birth_date: client.birth_date ?? "",
      notes: client.notes ?? "",
    });

    setMessage("");
    setShowForm(true);
  }

  async function handleSaveClient(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const displayName =
      form.display_name.trim() ||
      `${form.first_name} ${form.last_name}`.trim() ||
      form.organization.trim();

    if (!displayName) {
      setMessage(
        "Inserisci almeno nome e cognome, denominazione o nominativo visualizzato."
      );
      return;
    }

    setSaving(true);
    setMessage("");

    const payload = {
      studio_id: studioId,
      contact_type: "cliente",
      first_name: form.first_name.trim() || null,
      last_name: form.last_name.trim() || null,
      display_name: displayName,
      fiscal_code: form.fiscal_code.trim() || null,
      vat_number: form.vat_number.trim() || null,
      email: form.email.trim() || null,
      pec: form.pec.trim() || null,
      phone: form.phone.trim() || null,
      mobile_phone: form.mobile_phone.trim() || null,
      organization: form.organization.trim() || null,
      job_title: form.job_title.trim() || null,
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      postal_code: form.postal_code.trim() || null,
      province: form.province.trim() || null,
      birth_place: form.birth_place.trim() || null,
      birth_date: form.birth_date || null,
      notes: form.notes.trim() || null,
      needs_review: false,
      active: true,
    };

    const result = editingClient
      ? await supabase
          .from("contacts")
          .update(payload)
          .eq("id", editingClient.id)
          .select("id")
          .single()
      : await supabase.from("contacts").insert(payload).select("id").single();

    if (result.error) {
      setMessage(`Errore: ${result.error.message}`);
      setSaving(false);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("audit_log").insert({
      studio_id: studioId,
      user_id: user?.id ?? null,
      action: editingClient ? "update" : "insert",
      entity_type: "cliente",
      entity_id: String(result.data.id),
      new_data: payload,
    });

    await onClientsChanged();

    setMessage(
      editingClient
        ? "Anagrafica aggiornata correttamente."
        : "Nuovo cliente salvato correttamente."
    );

    setSaving(false);
    setShowForm(false);
    setEditingClient(null);
    setForm(emptyForm);

    if (selectedClient && editingClient) {
      setSelectedClient({
        ...selectedClient,
        ...payload,
        id: editingClient.id,
        contact_type: "cliente",
      } as ClientRecord);
    }
  }

  async function handleDeleteClient(client: ClientRecord) {
    setMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      setMessage(`Errore: ${userError.message}`);
      return;
    }

    if (!user) {
      setMessage("Errore: utente non autenticato.");
      return;
    }

    const { data: permission, error: permissionError } = await supabase
      .from("user_permissions")
      .select("can_edit_clients")
      .eq("user_id", user.id)
      .maybeSingle();

    if (permissionError) {
      setMessage(`Errore: ${permissionError.message}`);
      return;
    }

    if (!permission?.can_edit_clients) {
      setMessage("Non disponi del permesso per eliminare i clienti.");
      return;
    }

    const activeCases = cases.filter(
      (caseRecord) =>
        caseRecord.client_contact_id === client.id &&
        !["definito", "archiviato"].includes(caseRecord.status ?? "")
    );

    const linkedCasesWarning =
      activeCases.length > 0
        ? `\n\nIl cliente ha ${activeCases.length} pratiche attive. Le pratiche resteranno esistenti e manterranno il collegamento storico.`
        : "\n\nLe pratiche già collegate resteranno esistenti e manterranno il collegamento storico.";

    const confirmed = window.confirm(
      `Vuoi spostare il cliente “${client.display_name}” nel cestino?${linkedCasesWarning}`
    );

    if (!confirmed) return;

    setDeletingClientId(client.id);

    try {
      const { error } = await supabase
        .from("contacts")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: user.id,
          delete_reason: "Eliminato dalla scheda cliente",
        })
        .eq("id", client.id)
        .eq("studio_id", studioId);

      if (error) throw error;

      await onClientsChanged();
      setSelectedClient(null);
      onClientDetailClose?.();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `Errore: ${error.message}`
          : "Errore durante l’eliminazione del cliente."
      );
    } finally {
      setDeletingClientId(null);
    }
  }

  async function handleDeleteCase(caseRecord: ClientCase) {
    const label =
      caseRecord.title ||
      caseRecord.claimant_name_raw ||
      `Pratica n. ${caseRecord.id}`;
    if (
      !window.confirm(
        `Vuoi spostare “${label}” nel cestino? Potrai ripristinarla successivamente.`
      )
    )
      return;

    setDeletingCaseId(caseRecord.id);
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
          delete_reason: "Eliminata dalla scheda generale del cliente",
        })
        .eq("id", caseRecord.id)
        .eq("studio_id", studioId);
      if (error) throw error;

      await supabase.from("audit_log").insert({
        studio_id: studioId,
        user_id: user.id,
        action: "delete",
        entity_type: "pratica",
        entity_id: String(caseRecord.id),
        new_data: { deleted_at: new Date().toISOString(), source: "cliente" },
      });

      await onClientsChanged();
      setMessage("Pratica spostata nel cestino.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `Errore: ${error.message}`
          : "Errore durante l’eliminazione della pratica."
      );
    } finally {
      setDeletingCaseId(null);
    }
  }

  function toggleClientSelection(id: number) {
    setSelectedClientIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  }

  async function deleteSelectedClients() {
    if (selectedClientIds.length === 0) return;
    if (
      !window.confirm(
        `Spostare nel cestino i ${selectedClientIds.length} clienti selezionati? Le pratiche collegate resteranno esistenti.`
      )
    )
      return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setMessage("Errore: utente non autenticato.");
      return;
    }
    const { error } = await supabase
      .from("contacts")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: user.id,
        delete_reason: "Eliminazione multipla dalla sezione Clienti",
      })
      .eq("studio_id", studioId)
      .in("id", selectedClientIds);
    if (error) {
      setMessage(`Errore: ${error.message}`);
      return;
    }
    setSelectedClientIds([]);
    await onClientsChanged();
    setMessage("Clienti selezionati spostati nel cestino.");
  }

  const clientFormModal = showForm ? (
    <ClientFormModal
      title={editingClient ? "Modifica anagrafica" : "Nuovo cliente"}
      form={form}
      saving={saving}
      message={message}
      onChange={updateForm}
      onSubmit={handleSaveClient}
      onClose={() => {
        setShowForm(false);
        setEditingClient(null);
        setMessage("");
      }}
    />
  ) : null;

  if (selectedClient) {
    return (
      <>
        <ClientDetail
          client={selectedClient}
          cases={selectedClientCases}
          onBack={() => {
            setSelectedClient(null);
            onClientDetailClose?.();
          }}
          onEdit={() => openEditClientForm(selectedClient)}
          onDelete={() => handleDeleteClient(selectedClient)}
          deleting={deletingClientId === selectedClient.id}
          message={message}
          onOpenCase={onOpenCase}
          onEditCase={onEditCase}
          onDeleteCase={handleDeleteCase}
          deletingCaseId={deletingCaseId}
          onAddCase={() => onAddCase(selectedClient.id)}
          onOpenInvoice={onOpenInvoice}
        />
        {clientFormModal}
      </>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <label className="block flex-1">
            <span className="mb-2 block text-sm text-neutral-500">
              Cerca cliente
            </span>

            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nome, codice fiscale, email, telefono o società"
              className="w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-neutral-600"
            />
          </label>

          <button
            type="button"
            onClick={openNewClientForm}
            className="rounded-xl bg-neutral-900 px-5 py-3 text-sm font-medium text-white"
          >
            Nuovo cliente
          </button>
        </div>
      </section>

      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">
          Anagrafiche trovate: {filteredClients.length}
        </p>

        <button
          type="button"
          onClick={() =>
            setSelectedClientIds((current) =>
              current.length === filteredClients.length
                ? []
                : filteredClients.map((client) => client.id)
            )
          }
          disabled={filteredClients.length === 0}
          className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm disabled:opacity-40"
        >
          {selectedClientIds.length === filteredClients.length &&
          filteredClients.length > 0
            ? "Deseleziona tutti"
            : "Seleziona tutti"}
        </button>

        {message && (
          <p className="text-sm text-neutral-600">{message}</p>
        )}
      </div>

      {selectedClientIds.length > 0 && (
        <div className="flex flex-wrap gap-2 rounded-xl border border-neutral-200 bg-white p-3">
          <button
            type="button"
            onClick={deleteSelectedClients}
            className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white"
          >
            Elimina selezionati ({selectedClientIds.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedClientIds([])}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          >
            Deseleziona
          </button>
        </div>
      )}

      <section className="grid gap-4">
        {filteredClients.map((client) => {
          const linkedCases = cases.filter(
            (item) => item.client_contact_id === client.id
          ).length;

          return (
            <article
              key={client.id}
              className="flex gap-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-neutral-400 hover:bg-neutral-50"
            >
              <input
                type="checkbox"
                checked={selectedClientIds.includes(client.id)}
                onChange={() => toggleClientSelection(client.id)}
                aria-label={`Seleziona ${client.display_name}`}
                className="mt-1 h-5 w-5 rounded border-neutral-300"
              />
              <button
                type="button"
                onClick={() => setSelectedClient(client)}
                className="min-w-0 flex-1 text-left"
              >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold">
                      {client.display_name}
                    </h3>

                    {client.needs_review && (
                      <span className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-800">
                        Da verificare
                      </span>
                    )}
                  </div>

                  <p className="mt-2 text-sm text-neutral-500">
                    {client.fiscal_code
                      ? `CF: ${client.fiscal_code}`
                      : "Codice fiscale non indicato"}
                  </p>

                  <p className="mt-1 text-sm text-neutral-500">
                    {client.email ||
                      client.pec ||
                      client.phone ||
                      client.mobile_phone ||
                      "Recapiti non indicati"}
                  </p>
                </div>

                <div className="rounded-xl bg-neutral-100 px-4 py-3 text-center">
                  <p className="text-xs text-neutral-500">
                    Pratiche
                  </p>
                  <p className="mt-1 text-xl font-semibold">
                    {linkedCases}
                  </p>
                </div>
              </div>
              </button>
            </article>
          );
        })}
      </section>

      {clientFormModal}
    </div>
  );
}

function ClientDetail({
  client,
  cases,
  onBack,
  onEdit,
  onDelete,
  deleting,
  message,
  onOpenCase,
  onEditCase,
  onDeleteCase,
  deletingCaseId,
  onAddCase,
  onOpenInvoice,
}: {
  client: ClientRecord;
  cases: ClientCase[];
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => Promise<void>;
  deleting: boolean;
  message: string;
  onOpenCase: (caseId: number) => void;
  onEditCase: (caseId: number) => void;
  onDeleteCase: (caseRecord: ClientCase) => Promise<void>;
  deletingCaseId: number | null;
  onAddCase: () => void;
  onOpenInvoice: (invoiceId: number) => void;
}) {
  const [invoices, setInvoices] = useState<ClientInvoice[]>([]);
  const [selectedInvoice, setSelectedInvoice] =
    useState<ClientInvoice | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadInvoices() {
      const { data } = await supabase
        .from("invoices")
        .select(
          "id, invoice_number, issue_date, due_date, description, taxable_amount, general_expenses_amount, cpa_amount, tax_amount, exempt_expenses_amount, withholding_amount, total_amount, paid_amount, status, issuing_lawyer_name, notes"
        )
        .eq("client_contact_id", client.id)
        .order("issue_date", { ascending: false });

      if (!cancelled) setInvoices((data ?? []) as ClientInvoice[]);
    }

    void loadInvoices();
    return () => {
      cancelled = true;
    };
  }, [client.id]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm"
        >
          ← Torna ai clienti
        </button>

        <button
          type="button"
          onClick={onEdit}
          className="rounded-xl bg-neutral-900 px-4 py-2 text-sm text-white"
        >
          Modifica anagrafica
        </button>

        <button
          type="button"
          onClick={() => void onDelete()}
          disabled={deleting}
          className="rounded-xl bg-red-600 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {deleting ? "Eliminazione..." : "Elimina cliente"}
        </button>
      </div>

      {message && (
        <div className="rounded-xl border border-neutral-200 bg-white p-4 text-sm">
          {message}
        </div>
      )}

      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-neutral-500">Cliente</p>

        <h3 className="mt-1 text-2xl font-semibold">
          {client.display_name}
        </h3>

        {client.organization && (
          <p className="mt-2 text-neutral-600">
            {client.organization}
          </p>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ClientInfoCard
          label="Codice fiscale"
          value={client.fiscal_code}
        />
        <ClientInfoCard
          label="Email"
          value={client.email}
        />
        <ClientInfoCard
          label="PEC"
          value={client.pec}
        />
        <ClientInfoCard
          label="Telefono"
          value={client.mobile_phone || client.phone}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h4 className="text-lg font-semibold">
            Dati anagrafici
          </h4>

          <dl className="mt-5 space-y-4 text-sm">
            <ClientDetailRow
              label="Nome"
              value={client.first_name}
            />
            <ClientDetailRow
              label="Cognome"
              value={client.last_name}
            />
            <ClientDetailRow
              label="Partita IVA"
              value={client.vat_number}
            />
            <ClientDetailRow
              label="Luogo di nascita"
              value={client.birth_place}
            />
            <ClientDetailRow
              label="Data di nascita"
              value={formatBirthDate(client.birth_date)}
            />
            <ClientDetailRow
              label="Qualifica"
              value={client.job_title}
            />
          </dl>
        </article>

        <article className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h4 className="text-lg font-semibold">
            Indirizzo e note
          </h4>

          <dl className="mt-5 space-y-4 text-sm">
            <ClientDetailRow
              label="Indirizzo"
              value={client.address}
            />
            <ClientDetailRow
              label="Città"
              value={client.city}
            />
            <ClientDetailRow
              label="CAP e provincia"
              value={
                [client.postal_code, client.province]
                  .filter(Boolean)
                  .join(" - ") || null
              }
            />
            <ClientDetailRow
              label="Note"
              value={client.notes}
            />
          </dl>
        </article>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="text-lg font-semibold">
              Pratiche del cliente
            </h4>

            <p className="mt-1 text-sm text-neutral-500">
              Cause collegate: {cases.length}
            </p>
          </div>

          <button
            type="button"
            onClick={onAddCase}
            className="rounded-xl bg-neutral-900 px-4 py-3 text-sm text-white"
          >
            Aggiungi pratica
          </button>
        </div>

        <div className="mt-5 space-y-3">
          {cases.length === 0 ? (
            <p className="text-sm text-neutral-500">
              Nessuna pratica collegata.
            </p>
          ) : (
            cases.map((caseRecord) => (
              <article
                key={caseRecord.id}
                className="rounded-xl border border-neutral-200 p-4 transition hover:bg-neutral-50"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <button
                    type="button"
                    onClick={() => onOpenCase(caseRecord.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="font-medium">
                      {caseRecord.title ||
                        caseRecord.defendant_name_raw ||
                        `Pratica n. ${caseRecord.id}`}
                    </p>

                    <p className="mt-1 text-sm text-neutral-500">
                      RG:{" "}
                      {caseRecord.rg_number || "Non indicato"}
                    </p>

                    <p className="mt-1 text-sm text-neutral-500">
                      {caseRecord.court_type ||
                        "Ufficio non indicato"}
                      {caseRecord.court_city
                        ? ` di ${caseRecord.court_city}`
                        : ""}
                    </p>
                  </button>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs capitalize text-neutral-700">
                      {caseRecord.status?.replaceAll("_", " ") ||
                        "Stato non indicato"}
                    </span>
                    <button
                      type="button"
                      onClick={() => onEditCase(caseRecord.id)}
                      className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-medium"
                    >
                      Modifica
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDeleteCase(caseRecord)}
                      disabled={deletingCaseId === caseRecord.id}
                      className="rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-medium text-red-700 disabled:opacity-50"
                    >
                      {deletingCaseId === caseRecord.id
                        ? "Eliminazione..."
                        : "Elimina"}
                    </button>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h4 className="text-lg font-semibold">Fatture del cliente</h4>
        <p className="mt-1 text-sm text-neutral-500">
          Clicca sul numero per visualizzare il riepilogo.
        </p>

        {invoices.length === 0 ? (
          <p className="mt-5 text-sm text-neutral-500">
            Nessuna fattura collegata.
          </p>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-neutral-200 text-neutral-500">
                <tr>
                  <th className="px-3 py-3 font-medium">Numero</th>
                  <th className="px-3 py-3 font-medium">Data</th>
                  <th className="px-3 py-3 font-medium">Stato</th>
                  <th className="px-3 py-3 text-right font-medium">Totale</th>
                  <th className="px-3 py-3 text-right font-medium">Residuo</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-b border-neutral-100">
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => setSelectedInvoice(invoice)}
                        className="font-semibold text-[#17376f] underline decoration-[#17376f]/30 underline-offset-4"
                      >
                        {invoice.invoice_number}
                      </button>
                    </td>
                    <td className="px-3 py-3">{formatDate(invoice.issue_date)}</td>
                    <td className="px-3 py-3 capitalize">
                      {invoice.status.replaceAll("_", " ")}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {formatMoney(invoice.total_amount)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {formatMoney(
                        Math.max(
                          Number(invoice.total_amount || 0) -
                            Number(invoice.paid_amount || 0),
                          0
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedInvoice && (
        <InvoiceSummaryModal
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          onEdit={() => onOpenInvoice(selectedInvoice.id)}
        />
      )}
    </div>
  );
}

export function InvoiceSummaryModal({
  invoice,
  onClose,
  onEdit,
}: {
  invoice: ClientInvoice;
  onClose: () => void;
  onEdit?: () => void;
}) {
  const rows = [
    ["Onorari", formatMoney(invoice.taxable_amount)],
    ["Spese generali 15%", formatMoney(invoice.general_expenses_amount)],
    ["CPA 4%", formatMoney(invoice.cpa_amount)],
    ["IVA", formatMoney(invoice.tax_amount)],
    ["Spese esenti", formatMoney(invoice.exempt_expenses_amount)],
    ["Ritenuta d’acconto", `− ${formatMoney(invoice.withholding_amount)}`],
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Riepilogo fattura ${invoice.invoice_number}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-neutral-200 pb-4">
          <div>
            <p className="text-sm text-neutral-500">Riepilogo fattura</p>
            <h3 className="mt-1 text-xl font-semibold">
              Fattura n. {invoice.invoice_number}
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

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <ClientInfoCard label="Data emissione" value={formatDate(invoice.issue_date)} />
          <ClientInfoCard label="Scadenza" value={formatDate(invoice.due_date)} />
          <ClientInfoCard
            label="Stato"
            value={invoice.status.replaceAll("_", " ")}
          />
          <ClientInfoCard
            label="Emittente"
            value={invoice.issuing_lawyer_name}
          />
        </div>

        <dl className="mt-5 divide-y divide-neutral-100 rounded-xl border border-neutral-200">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 px-4 py-3 text-sm">
              <dt className="text-neutral-600">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4 bg-neutral-50 px-4 py-4">
            <dt className="font-semibold">Totale</dt>
            <dd className="text-lg font-semibold">{formatMoney(invoice.total_amount)}</dd>
          </div>
          <div className="flex justify-between gap-4 px-4 py-3 text-sm">
            <dt className="text-neutral-600">Incassato</dt>
            <dd className="font-medium">{formatMoney(invoice.paid_amount)}</dd>
          </div>
        </dl>

        {(invoice.description || invoice.notes) && (
          <div className="mt-5 rounded-xl bg-neutral-50 p-4 text-sm">
            {invoice.description && <p>{invoice.description}</p>}
            {invoice.notes && <p className="mt-2 text-neutral-600">{invoice.notes}</p>}
          </div>
        )}

        {onEdit && (
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={onEdit}
              className="rounded-xl bg-neutral-900 px-5 py-3 text-sm font-medium text-white"
            >
              Modifica fattura
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function ClientFormModal({
  title,
  form,
  saving,
  message,
  onChange,
  onSubmit,
  onClose,
}: {
  title: string;
  form: ClientForm;
  saving: boolean;
  message: string;
  onChange: (field: keyof ClientForm, value: string) => void;
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
          <h3 className="text-xl font-semibold">{title}</h3>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-neutral-300 px-3 py-2 text-sm"
          >
            Chiudi
          </button>
        </div>

        <AnagraphicFormFields
          values={form}
          onChange={onChange}
          showBirthFields
        />

        {message && (
          <p className="mt-5 text-sm text-neutral-600">
            {message}
          </p>
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
            {saving ? "Salvataggio..." : "Salva cliente"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ClientInfoCard({
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
        {value || "Non indicato"}
      </p>
    </article>
  );
}

function ClientDetailRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <dt className="text-neutral-500">{label}</dt>
      <dd className="mt-1 font-medium">
        {value || "Non indicato"}
      </dd>
    </div>
  );
}

function formatBirthDate(value: string | null | undefined) {
  if (!value) return null;
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function formatMoney(value: number | null | undefined) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Non indicata";
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}
