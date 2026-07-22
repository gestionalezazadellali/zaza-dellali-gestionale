"use client";

import { FormEvent, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

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

type ClientForm = {
  first_name: string;
  last_name: string;
  display_name: string;
  fiscal_code: string;
  vat_number: string;
  email: string;
  pec: string;
  phone: string;
  mobile_phone: string;
  organization: string;
  job_title: string;
  address: string;
  city: string;
  postal_code: string;
  province: string;
  notes: string;
};

const emptyForm: ClientForm = {
  first_name: "",
  last_name: "",
  display_name: "",
  fiscal_code: "",
  vat_number: "",
  email: "",
  pec: "",
  phone: "",
  mobile_phone: "",
  organization: "",
  job_title: "",
  address: "",
  city: "",
  postal_code: "",
  province: "",
  notes: "",
};

export default function ClientsPage({
  clients,
  cases,
  studioId,
  initialClientId = null,
  onClientsChanged,
  onOpenCase,
  onAddCase,
  onClientDetailClose,
}: {
  clients: ClientRecord[];
  cases: ClientCase[];
  studioId: string;
  initialClientId?: number | null;
  onClientsChanged: () => Promise<void>;
  onOpenCase: (caseId: number) => void;
  onAddCase: (clientId: number) => void;
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
  const [message, setMessage] = useState("");

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
      notes: form.notes.trim() || null,
      needs_review: false,
      active: true,
    };

    const result = editingClient
      ? await supabase
          .from("contacts")
          .update(payload)
          .eq("id", editingClient.id)
      : await supabase.from("contacts").insert(payload);

    if (result.error) {
      setMessage(`Errore: ${result.error.message}`);
      setSaving(false);
      return;
    }

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
          onAddCase={() => onAddCase(selectedClient.id)}
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

        {message && (
          <p className="text-sm text-neutral-600">{message}</p>
        )}
      </div>

      <section className="grid gap-4">
        {filteredClients.map((client) => {
          const linkedCases = cases.filter(
            (item) => item.client_contact_id === client.id
          ).length;

          return (
            <button
              key={client.id}
              type="button"
              onClick={() => setSelectedClient(client)}
              className="rounded-2xl border border-neutral-200 bg-white p-5 text-left shadow-sm transition hover:border-neutral-400 hover:bg-neutral-50"
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
  onAddCase,
}: {
  client: ClientRecord;
  cases: ClientCase[];
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => Promise<void>;
  deleting: boolean;
  message: string;
  onOpenCase: (caseId: number) => void;
  onAddCase: () => void;
}) {
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
              <button
                key={caseRecord.id}
                type="button"
                onClick={() => onOpenCase(caseRecord.id)}
                className="w-full rounded-xl border border-neutral-200 p-4 text-left transition hover:bg-neutral-50"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
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
                  </div>

                  <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs capitalize text-neutral-700">
                    {caseRecord.status?.replaceAll("_", " ") ||
                      "Stato non indicato"}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
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

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <ClientInput
            label="Nome"
            value={form.first_name}
            onChange={(value) => onChange("first_name", value)}
          />

          <ClientInput
            label="Cognome"
            value={form.last_name}
            onChange={(value) => onChange("last_name", value)}
          />

          <ClientInput
            label="Nominativo visualizzato"
            value={form.display_name}
            onChange={(value) =>
              onChange("display_name", value)
            }
          />

          <ClientInput
            label="Società / organizzazione"
            value={form.organization}
            onChange={(value) =>
              onChange("organization", value)
            }
          />

          <ClientInput
            label="Codice fiscale"
            value={form.fiscal_code}
            onChange={(value) =>
              onChange("fiscal_code", value)
            }
          />

          <ClientInput
            label="Partita IVA"
            value={form.vat_number}
            onChange={(value) =>
              onChange("vat_number", value)
            }
          />

          <ClientInput
            label="Email"
            type="email"
            value={form.email}
            onChange={(value) => onChange("email", value)}
          />

          <ClientInput
            label="PEC"
            type="email"
            value={form.pec}
            onChange={(value) => onChange("pec", value)}
          />

          <ClientInput
            label="Telefono"
            value={form.phone}
            onChange={(value) => onChange("phone", value)}
          />

          <ClientInput
            label="Cellulare"
            value={form.mobile_phone}
            onChange={(value) =>
              onChange("mobile_phone", value)
            }
          />

          <ClientInput
            label="Qualifica"
            value={form.job_title}
            onChange={(value) =>
              onChange("job_title", value)
            }
          />

          <ClientInput
            label="Indirizzo"
            value={form.address}
            onChange={(value) => onChange("address", value)}
          />

          <ClientInput
            label="Città"
            value={form.city}
            onChange={(value) => onChange("city", value)}
          />

          <ClientInput
            label="CAP"
            value={form.postal_code}
            onChange={(value) =>
              onChange("postal_code", value)
            }
          />

          <ClientInput
            label="Provincia"
            value={form.province}
            onChange={(value) =>
              onChange("province", value)
            }
          />

          <label className="block sm:col-span-2">
            <span className="mb-2 block text-sm text-neutral-500">
              Note
            </span>

            <textarea
              rows={4}
              value={form.notes}
              onChange={(event) =>
                onChange("notes", event.target.value)
              }
              className="w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-neutral-600"
            />
          </label>
        </div>

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

function ClientInput({
  label,
  value,
  type = "text",
  onChange,
}: {
  label: string;
  value: string;
  type?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-neutral-500">
        {label}
      </span>

      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-neutral-600"
      />
    </label>
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
