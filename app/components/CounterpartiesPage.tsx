"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  createCounterparty,
  getCounterparty,
  listCounterpartyCases,
  searchCounterparties,
  softDeleteCounterparty,
  updateCounterparty,
  type CounterpartyCaseRecord,
  type CounterpartyInput,
  type CounterpartyRecord,
} from "../../lib/counterparties";
import AnagraphicFormFields, {
  emptyAnagraphicForm,
  type AnagraphicFormValues,
} from "./AnagraphicFormFields";

type CounterpartyForm = AnagraphicFormValues;

export default function CounterpartiesPage({
  studioId,
  initialCounterpartyId = null,
  onOpenCase,
  onChanged,
  onDetailClose,
}: {
  studioId: string;
  initialCounterpartyId?: number | null;
  onOpenCase: (caseId: number) => void;
  onChanged: () => Promise<void>;
  onDetailClose?: () => void;
}) {
  const [counterparties, setCounterparties] = useState<CounterpartyRecord[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCounterparty, setSelectedCounterparty] =
    useState<CounterpartyRecord | null>(null);
  const [linkedCases, setLinkedCases] = useState<CounterpartyCaseRecord[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingCounterparty, setEditingCounterparty] =
    useState<CounterpartyRecord | null>(null);
  const [form, setForm] = useState<CounterpartyForm>(emptyAnagraphicForm);
  const [loading, setLoading] = useState(true);
  const [loadingCases, setLoadingCases] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [message, setMessage] = useState("");

  const loadCounterparties = useCallback(
    async (query: string) => {
      setLoading(true);

      try {
        const data = await searchCounterparties({
          studioId,
          query,
          limit: 100,
        });
        setCounterparties(data);
      } catch (error) {
        setCounterparties([]);
        setMessage(formatError(error, "Errore durante il caricamento."));
      } finally {
        setLoading(false);
      }
    },
    [studioId]
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadCounterparties(search);
    }, search ? 250 : 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadCounterparties, search]);

  useEffect(() => {
    if (initialCounterpartyId === null) return;

    async function loadInitialCounterparty() {
      setLoadingCases(true);
      setMessage("");

      try {
        const item = await getCounterparty(studioId, initialCounterpartyId!, {
          includeDeleted: true,
        });

        if (!item) {
          setMessage("Controparte non trovata.");
          return;
        }

        setSelectedCounterparty(item);
        setLinkedCases(await listCounterpartyCases(studioId, item.id));
      } catch (error) {
        setMessage(
          formatError(error, "Errore durante l’apertura della controparte.")
        );
      } finally {
        setLoadingCases(false);
      }
    }

    void loadInitialCounterparty();
  }, [initialCounterpartyId, studioId]);

  const linkedCasesLabel = useMemo(
    () =>
      loadingCases
        ? "Caricamento pratiche..."
        : `Pratiche collegate: ${linkedCases.length}`,
    [linkedCases.length, loadingCases]
  );

  function updateForm(field: keyof CounterpartyForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function openNewForm() {
    setEditingCounterparty(null);
    setForm(emptyAnagraphicForm);
    setMessage("");
    setShowForm(true);
  }

  function openEditForm(item: CounterpartyRecord) {
    setEditingCounterparty(item);
    setForm(formFromCounterparty(item));
    setMessage("");
    setShowForm(true);
  }

  async function openDetail(item: CounterpartyRecord) {
    setSelectedCounterparty(item);
    setLinkedCases([]);
    setLoadingCases(true);
    setMessage("");

    try {
      setLinkedCases(await listCounterpartyCases(studioId, item.id));
    } catch (error) {
      setMessage(
        formatError(error, "Errore durante il caricamento delle pratiche.")
      );
    } finally {
      setLoadingCases(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const input: CounterpartyInput = {
        ...form,
        counterparty_type:
          editingCounterparty?.counterparty_type || "da_classificare",
        needs_review: editingCounterparty?.needs_review ?? false,
      };
      const saved = editingCounterparty
        ? await updateCounterparty(studioId, editingCounterparty.id, input)
        : await createCounterparty(studioId, input);

      const { supabase } = await import("../../lib/supabase");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await supabase.from("audit_log").insert({
        studio_id: studioId,
        user_id: user?.id ?? null,
        action: editingCounterparty ? "update" : "insert",
        entity_type: "controparte",
        entity_id: String(saved.id),
        new_data: {
          display_name: saved.display_name,
          fiscal_code: saved.fiscal_code,
          organization: saved.organization,
        },
      });

      await Promise.all([onChanged(), loadCounterparties(search)]);
      setSelectedCounterparty(saved);
      setLinkedCases(
        editingCounterparty
          ? await listCounterpartyCases(studioId, saved.id)
          : []
      );
      setEditingCounterparty(null);
      setForm(emptyAnagraphicForm);
      setShowForm(false);
      setMessage(
        editingCounterparty
          ? "Controparte aggiornata correttamente."
          : "Nuova controparte salvata correttamente."
      );
    } catch (error) {
      setMessage(formatError(error, "Errore durante il salvataggio."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: CounterpartyRecord) {
    const linkedWarning =
      linkedCases.length > 0
        ? `\n\nLe ${linkedCases.length} pratiche collegate manterranno il collegamento storico.`
        : "";
    const confirmed = window.confirm(
      `Vuoi spostare la controparte “${item.display_name}” nel cestino?${linkedWarning}`
    );

    if (!confirmed) return;

    setDeleting(true);
    setMessage("");

    try {
      await softDeleteCounterparty(studioId, item.id);
      await Promise.all([onChanged(), loadCounterparties(search)]);
      setSelectedCounterparty(null);
      setLinkedCases([]);
      setMessage("Controparte spostata nel cestino.");
    } catch (error) {
      setMessage(formatError(error, "Errore durante l’eliminazione."));
    } finally {
      setDeleting(false);
    }
  }

  function toggleSelection(id: number) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  }

  async function deleteSelected() {
    if (selectedIds.length === 0) return;
    if (
      !window.confirm(
        `Spostare nel cestino le ${selectedIds.length} controparti selezionate? I collegamenti storici con le pratiche resteranno disponibili.`
      )
    )
      return;
    setDeleting(true);
    setMessage("");
    try {
      for (const id of selectedIds) {
        await softDeleteCounterparty(
          studioId,
          id,
          "Eliminazione multipla dalla sezione Controparti"
        );
      }
      setSelectedIds([]);
      await Promise.all([onChanged(), loadCounterparties(search)]);
      setMessage("Controparti selezionate spostate nel cestino.");
    } catch (error) {
      setMessage(formatError(error, "Errore durante l’eliminazione multipla."));
    } finally {
      setDeleting(false);
    }
  }

  const formModal = showForm ? (
    <CounterpartyFormModal
      form={form}
      editing={Boolean(editingCounterparty)}
      saving={saving}
      message={message}
      onChange={updateForm}
      onSubmit={handleSubmit}
      onClose={() => {
        setShowForm(false);
        setEditingCounterparty(null);
        setForm(emptyAnagraphicForm);
        setMessage("");
      }}
    />
  ) : null;

  if (selectedCounterparty) {
    return (
      <>
        <CounterpartyDetail
          counterparty={selectedCounterparty}
          cases={linkedCases}
          casesLabel={linkedCasesLabel}
          deleting={deleting}
          message={message}
          onBack={() => {
            setSelectedCounterparty(null);
            setLinkedCases([]);
            setMessage("");
            onDetailClose?.();
          }}
          onEdit={() => openEditForm(selectedCounterparty)}
          onDelete={() => handleDelete(selectedCounterparty)}
          onOpenCase={onOpenCase}
        />
        {formModal}
      </>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <label className="block flex-1">
            <span className="mb-2 block text-sm text-neutral-500">
              Cerca controparte
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
            onClick={openNewForm}
            className="rounded-xl bg-neutral-900 px-5 py-3 text-sm font-medium text-white"
          >
            Aggiungi controparte
          </button>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-500">
          {loading
            ? "Ricerca in corso..."
            : `Anagrafiche trovate: ${counterparties.length}`}
        </p>
        {message && <p className="text-sm text-neutral-600">{message}</p>}
      </div>

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-2 rounded-xl border border-neutral-200 bg-white p-3">
          <button
            type="button"
            onClick={deleteSelected}
            disabled={deleting}
            className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            Elimina selezionate ({selectedIds.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds([])}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          >
            Deseleziona
          </button>
        </div>
      )}

      {loading && counterparties.length === 0 ? (
        <section className="rounded-2xl border border-neutral-200 bg-white p-8 text-sm text-neutral-500 shadow-sm">
          Caricamento controparti...
        </section>
      ) : counterparties.length === 0 ? (
        <section className="rounded-2xl border border-neutral-200 bg-white p-8 text-sm text-neutral-500 shadow-sm">
          Nessuna controparte trovata.
        </section>
      ) : (
        <section className="grid gap-4">
          {counterparties.map((item) => (
            <article
              key={item.id}
              className="flex gap-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-neutral-400 hover:bg-neutral-50"
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(item.id)}
                onChange={() => toggleSelection(item.id)}
                aria-label={`Seleziona ${item.display_name}`}
                className="mt-1 h-5 w-5 rounded border-neutral-300"
              />
              <button
                type="button"
                onClick={() => void openDetail(item)}
                className="min-w-0 flex-1 text-left"
              >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold">
                      {item.display_name}
                    </h3>
                    {item.needs_review && (
                      <span className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-800">
                        Da verificare
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-neutral-500">
                    {item.fiscal_code
                      ? `CF: ${item.fiscal_code}`
                      : "Codice fiscale non indicato"}
                  </p>
                  <p className="mt-1 text-sm text-neutral-500">
                    {item.email ||
                      item.pec ||
                      item.phone ||
                      item.mobile_phone ||
                      "Recapiti non indicati"}
                  </p>
                </div>

                <span className="rounded-xl bg-neutral-100 px-4 py-3 text-xs text-neutral-600">
                  Apri scheda
                </span>
              </div>
              </button>
            </article>
          ))}
        </section>
      )}

      {formModal}
    </div>
  );
}

function CounterpartyDetail({
  counterparty,
  cases,
  casesLabel,
  deleting,
  message,
  onBack,
  onEdit,
  onDelete,
  onOpenCase,
}: {
  counterparty: CounterpartyRecord;
  cases: CounterpartyCaseRecord[];
  casesLabel: string;
  deleting: boolean;
  message: string;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => Promise<void>;
  onOpenCase: (caseId: number) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm"
        >
          ← Torna alle controparti
        </button>
        {!counterparty.deleted_at && (
          <>
            <button
              type="button"
              onClick={onEdit}
              className="rounded-xl bg-neutral-900 px-4 py-2 text-sm text-white"
            >
              Modifica controparte
            </button>
            <button
              type="button"
              onClick={() => void onDelete()}
              disabled={deleting}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deleting ? "Eliminazione..." : "Elimina controparte"}
            </button>
          </>
        )}
      </div>

      {message && (
        <div className="rounded-xl border border-neutral-200 bg-white p-4 text-sm">
          {message}
        </div>
      )}

      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-neutral-500">Controparte</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h3 className="text-2xl font-semibold">
            {counterparty.display_name}
          </h3>
          {counterparty.needs_review && (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-800">
              Da verificare
            </span>
          )}
          {counterparty.deleted_at && (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-800">
              Eliminata · collegamento storico
            </span>
          )}
        </div>
        {counterparty.organization && (
          <p className="mt-2 text-neutral-600">{counterparty.organization}</p>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <InfoCard label="Codice fiscale" value={counterparty.fiscal_code} />
        <InfoCard label="Email" value={counterparty.email} />
        <InfoCard label="PEC" value={counterparty.pec} />
        <InfoCard
          label="Telefono"
          value={counterparty.mobile_phone || counterparty.phone}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h4 className="text-lg font-semibold">Dati anagrafici</h4>
          <dl className="mt-5 space-y-4 text-sm">
            <DetailRow label="Nome" value={counterparty.first_name} />
            <DetailRow label="Cognome" value={counterparty.last_name} />
            <DetailRow label="Partita IVA" value={counterparty.vat_number} />
            <DetailRow label="Qualifica" value={counterparty.job_title} />
          </dl>
        </article>

        <article className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h4 className="text-lg font-semibold">Indirizzo e note</h4>
          <dl className="mt-5 space-y-4 text-sm">
            <DetailRow label="Indirizzo" value={counterparty.address} />
            <DetailRow label="Città" value={counterparty.city} />
            <DetailRow
              label="CAP e provincia"
              value={
                [counterparty.postal_code, counterparty.province]
                  .filter(Boolean)
                  .join(" - ") || null
              }
            />
            <DetailRow label="Note" value={counterparty.notes} />
          </dl>
        </article>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h4 className="text-lg font-semibold">Pratiche della controparte</h4>
        <p className="mt-1 text-sm text-neutral-500">{casesLabel}</p>

        <div className="mt-5 space-y-3">
          {cases.length === 0 ? (
            <p className="text-sm text-neutral-500">
              Nessuna pratica collegata.
            </p>
          ) : (
            cases.map((caseRecord) => (
              <button
                key={caseRecord.link_id}
                type="button"
                onClick={() => onOpenCase(caseRecord.case_id)}
                className="w-full rounded-xl border border-neutral-200 p-4 text-left transition hover:bg-neutral-50"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-medium">
                      {caseRecord.title ||
                        caseRecord.claimant_name_raw ||
                        `Pratica n. ${caseRecord.case_id}`}
                    </p>
                    <p className="mt-1 text-sm text-neutral-500">
                      RG: {caseRecord.rg_number || "Non indicato"}
                    </p>
                    <p className="mt-1 text-sm text-neutral-500">
                      {caseRecord.court_type || "Ufficio non indicato"}
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

function CounterpartyFormModal({
  form,
  editing,
  saving,
  message,
  onChange,
  onSubmit,
  onClose,
}: {
  form: CounterpartyForm;
  editing: boolean;
  saving: boolean;
  message: string;
  onChange: (field: keyof CounterpartyForm, value: string) => void;
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
          <h3 className="text-xl font-semibold">
            {editing ? "Modifica controparte" : "Nuova controparte"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-neutral-300 px-3 py-2 text-sm"
          >
            Chiudi
          </button>
        </div>

        <AnagraphicFormFields values={form} onChange={onChange} />

        {message && <p className="mt-5 text-sm text-neutral-600">{message}</p>}

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
            {saving ? "Salvataggio..." : "Salva controparte"}
          </button>
        </div>
      </form>
    </div>
  );
}

function formFromCounterparty(
  item: CounterpartyRecord
): CounterpartyForm {
  return {
    first_name: item.first_name ?? "",
    last_name: item.last_name ?? "",
    display_name: item.display_name ?? "",
    fiscal_code: item.fiscal_code ?? "",
    vat_number: item.vat_number ?? "",
    email: item.email ?? "",
    pec: item.pec ?? "",
    phone: item.phone ?? "",
    mobile_phone: item.mobile_phone ?? "",
    organization: item.organization ?? "",
    job_title: item.job_title ?? "",
    address: item.address ?? "",
    city: item.city ?? "",
    postal_code: item.postal_code ?? "",
    province: item.province ?? "",
    notes: item.notes ?? "",
  };
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
      <p className="mt-2 font-semibold">{value || "Non indicato"}</p>
    </article>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <dt className="text-neutral-500">{label}</dt>
      <dd className="mt-1 font-medium">{value || "Non indicato"}</dd>
    </div>
  );
}

function formatError(error: unknown, fallback: string) {
  return error instanceof Error ? `Errore: ${error.message}` : fallback;
}
