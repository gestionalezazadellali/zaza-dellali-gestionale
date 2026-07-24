"use client";

import {
  FormEvent,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
} from "react";
import { supabase } from "../../lib/supabase";
import {
  InvoiceSummaryModal,
  type ClientInvoice,
  type ClientRecord,
} from "./ClientsPage";
import type { CaseRecord } from "./CasesPage";

type ProfileOption = {
  id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

type InvoiceRecord = {
  id: number;
  case_id: number | null;
  client_contact_id: number | null;
  invoice_number: string;
  issue_date: string | null;
  due_date: string | null;
  description: string | null;
  taxable_amount: number;
  general_expenses_amount: number;
  cpa_amount: number;
  vat_enabled: boolean;
  exempt_expenses_amount: number;
  withholding_enabled: boolean;
  withholding_amount: number;
  expenses_amount: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  status: string;
  cost_destination: string | null;
  issuing_lawyer_user_id: string | null;
  issuing_lawyer_name: string | null;
  notes: string | null;
};

type PaymentRecord = {
  id: number;
  invoice_id: number;
  amount: number;
  paid_at: string;
  payment_method: string | null;
  transaction_reference: string | null;
  notes: string | null;
};

type InvoiceForm = {
  case_id: string;
  client_contact_id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  description: string;
  taxable_amount: string;
  general_expenses_amount: string;
  cpa_amount: string;
  vat_enabled: boolean;
  exempt_expenses_amount: string;
  withholding_enabled: boolean;
  withholding_amount: string;
  tax_amount: string;
  total_amount: string;
  cost_destination: string;
  issuing_lawyer_user_id: string;
  issuing_lawyer_name: string;
  notes: string;
};

type PaymentForm = {
  invoice_id: string;
  amount: string;
  paid_at: string;
  payment_method: string;
  transaction_reference: string;
  notes: string;
};

const emptyInvoiceForm: InvoiceForm = {
  case_id: "",
  client_contact_id: "",
  invoice_number: "",
  issue_date: "",
  due_date: "",
  description: "",
  taxable_amount: "0",
  general_expenses_amount: "0",
  cpa_amount: "0",
  vat_enabled: true,
  exempt_expenses_amount: "0",
  withholding_enabled: true,
  withholding_amount: "0",
  tax_amount: "0",
  total_amount: "0",
  cost_destination: "compensi_cliente",
  issuing_lawyer_user_id: "",
  issuing_lawyer_name: "",
  notes: "",
};

const emptyPaymentForm: PaymentForm = {
  invoice_id: "",
  amount: "",
  paid_at: new Date().toISOString().slice(0, 10),
  payment_method: "bonifico",
  transaction_reference: "",
  notes: "",
};

function calculateInvoice(form: InvoiceForm): InvoiceForm {
  const fees = Number(form.taxable_amount || 0);
  const generalExpenses = roundMoney(fees * 0.15);
  const cpa = roundMoney((fees + generalExpenses) * 0.04);
  const vat = form.vat_enabled
    ? roundMoney((fees + generalExpenses + cpa) * 0.22)
    : 0;
  const withholding = form.withholding_enabled
    ? roundMoney((fees + generalExpenses) * 0.2)
    : 0;
  const exempt = Number(form.exempt_expenses_amount || 0);
  const total = roundMoney(
    fees + generalExpenses + cpa + vat + exempt - withholding
  );

  return {
    ...form,
    general_expenses_amount: String(generalExpenses),
    cpa_amount: String(cpa),
    tax_amount: String(vat),
    withholding_amount: String(withholding),
    total_amount: String(total),
  };
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export default function BillingPage({
  studioId,
  clients,
  cases,
  initialInvoiceId = null,
  onInitialInvoiceHandled,
}: {
  studioId: string;
  clients: ClientRecord[];
  cases: CaseRecord[];
  initialInvoiceId?: number | null;
  onInitialInvoiceHandled?: () => void;
}) {
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [showPaid, setShowPaid] = useState(false);
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [editingInvoice, setEditingInvoice] =
    useState<InvoiceRecord | null>(null);
  const [invoiceForm, setInvoiceForm] =
    useState<InvoiceForm>(emptyInvoiceForm);
  const [paymentForm, setPaymentForm] =
    useState<PaymentForm>(emptyPaymentForm);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<number[]>([]);
  const [previewInvoice, setPreviewInvoice] =
    useState<InvoiceRecord | null>(null);

  async function loadBillingData() {
    setLoading(true);
    setMessage("");

    const [invoiceResult, paymentResult, profileResult] = await Promise.all([
      supabase
        .from("invoices")
        .select(
          "id, case_id, client_contact_id, invoice_number, issue_date, due_date, description, taxable_amount, expenses_amount, general_expenses_amount, cpa_amount, vat_enabled, exempt_expenses_amount, withholding_enabled, withholding_amount, tax_amount, total_amount, paid_amount, status, cost_destination, issuing_lawyer_user_id, issuing_lawyer_name, notes"
        )
        .order("issue_date", { ascending: false }),

      supabase
        .from("payments")
        .select(
          "id, invoice_id, amount, paid_at, payment_method, transaction_reference, notes"
        )
        .order("paid_at", { ascending: false }),

      supabase
        .from("profiles")
        .select("id, display_name, first_name, last_name, email")
        .eq("active", true)
        .order("display_name", { ascending: true }),
    ]);

    const error =
      invoiceResult.error || paymentResult.error || profileResult.error;

    if (error) {
      setMessage(`Errore: ${error.message}`);
      setLoading(false);
      return;
    }

    setInvoices((invoiceResult.data ?? []) as InvoiceRecord[]);
    setPayments((paymentResult.data ?? []) as PaymentRecord[]);
    setProfiles((profileResult.data ?? []) as ProfileOption[]);
    setLoading(false);
  }

  useEffect(() => {
    if (!initialInvoiceId || invoices.length === 0) return;
    const invoice = invoices.find((item) => item.id === initialInvoiceId);
    if (invoice) setPreviewInvoice(invoice);
    onInitialInvoiceHandled?.();
  }, [initialInvoiceId, invoices, onInitialInvoiceHandled]);

  const loadBillingDataEffect = useEffectEvent(loadBillingData);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadBillingDataEffect();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  const unpaidInvoices = useMemo(
    () => invoices.filter((item) => item.status !== "saldata"),
    [invoices]
  );

  const paidInvoices = useMemo(
    () => invoices.filter((item) => item.status === "saldata"),
    [invoices]
  );

  const summary = useMemo(() => {
    const totalIssued = invoices.reduce(
      (sum, item) => sum + Number(item.total_amount || 0),
      0
    );
    const totalPaid = invoices.reduce(
      (sum, item) => sum + Number(item.paid_amount || 0),
      0
    );
    const outstanding = invoices.reduce(
      (sum, item) =>
        sum +
        Math.max(
          Number(item.total_amount || 0) - Number(item.paid_amount || 0),
          0
        ),
      0
    );

    return {
      totalIssued,
      totalPaid,
      outstanding,
      unpaidCount: unpaidInvoices.length,
    };
  }, [invoices, unpaidInvoices.length]);

  const selectedInvoiceTotal = useMemo(
    () =>
      invoices
        .filter((item) => selectedInvoiceIds.includes(item.id))
        .reduce((sum, item) => sum + Number(item.total_amount || 0), 0),
    [invoices, selectedInvoiceIds]
  );

  function toggleInvoiceSelection(id: number) {
    setSelectedInvoiceIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  }

  function updateInvoiceForm(
    field: keyof InvoiceForm,
    value: string | boolean
  ) {
    setInvoiceForm((current) => {
      const updated = { ...current, [field]: value };

      if (
        [
          "taxable_amount",
          "exempt_expenses_amount",
          "vat_enabled",
          "withholding_enabled",
        ].includes(field)
      ) {
        return calculateInvoice(updated);
      }

      if (field === "case_id" && value) {
        const selectedCase = cases.find((item) => item.id === Number(value));
        if (selectedCase?.client_contact_id) {
          updated.client_contact_id = String(
            selectedCase.client_contact_id
          );
        }
      }

      if (field === "issuing_lawyer_user_id" && value) {
        const profile = profiles.find((item) => item.id === value);
        updated.issuing_lawyer_name = profile
          ? getProfileName(profile)
          : "";
      }

      return updated;
    });
  }

  function updatePaymentForm(field: keyof PaymentForm, value: string) {
    setPaymentForm((current) => ({ ...current, [field]: value }));
  }

  function openNewInvoice() {
    setEditingInvoice(null);
    setInvoiceForm(emptyInvoiceForm);
    setMessage("");
    setShowInvoiceForm(true);
  }

  function openEditInvoice(item: InvoiceRecord) {
    setEditingInvoice(item);
    setInvoiceForm({
      case_id: item.case_id ? String(item.case_id) : "",
      client_contact_id: item.client_contact_id
        ? String(item.client_contact_id)
        : "",
      invoice_number: item.invoice_number,
      issue_date: item.issue_date ?? "",
      due_date: item.due_date ?? "",
      description: item.description ?? "",
      taxable_amount: String(item.taxable_amount ?? 0),
      general_expenses_amount: String(item.general_expenses_amount ?? 0),
      cpa_amount: String(item.cpa_amount ?? 0),
      vat_enabled: item.vat_enabled ?? true,
      exempt_expenses_amount: String(
        item.exempt_expenses_amount ?? item.expenses_amount ?? 0
      ),
      withholding_enabled: item.withholding_enabled ?? true,
      withholding_amount: String(item.withholding_amount ?? 0),
      tax_amount: String(item.tax_amount ?? 0),
      total_amount: String(item.total_amount ?? 0),
      cost_destination: item.cost_destination ?? "compensi_cliente",
      issuing_lawyer_user_id: item.issuing_lawyer_user_id ?? "",
      issuing_lawyer_name: item.issuing_lawyer_name ?? "",
      notes: item.notes ?? "",
    });
    setMessage("");
    setShowInvoiceForm(true);
  }

  function openPayment(item: InvoiceRecord) {
    const residual =
      Number(item.total_amount || 0) - Number(item.paid_amount || 0);

    setPaymentForm({
      ...emptyPaymentForm,
      invoice_id: String(item.id),
      amount: String(Math.max(residual, 0)),
    });
    setMessage("");
    setShowPaymentForm(true);
  }

  async function saveInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!invoiceForm.invoice_number.trim()) {
      setMessage("Inserisci il numero della fattura.");
      return;
    }

    if (!invoiceForm.client_contact_id) {
      setMessage("Seleziona il cliente.");
      return;
    }

    setSaving(true);
    setMessage("");

    const payload = {
      studio_id: studioId,
      case_id: invoiceForm.case_id
        ? Number(invoiceForm.case_id)
        : null,
      client_contact_id: Number(invoiceForm.client_contact_id),
      invoice_number: invoiceForm.invoice_number.trim(),
      issue_date: invoiceForm.issue_date || null,
      due_date: invoiceForm.due_date || null,
      description: invoiceForm.description.trim() || null,
      taxable_amount: Number(invoiceForm.taxable_amount || 0),
      expenses_amount: Number(invoiceForm.exempt_expenses_amount || 0),
      general_expenses_amount: Number(
        invoiceForm.general_expenses_amount || 0
      ),
      cpa_amount: Number(invoiceForm.cpa_amount || 0),
      vat_enabled: invoiceForm.vat_enabled,
      exempt_expenses_amount: Number(
        invoiceForm.exempt_expenses_amount || 0
      ),
      withholding_enabled: invoiceForm.withholding_enabled,
      withholding_amount: Number(invoiceForm.withholding_amount || 0),
      tax_amount: Number(invoiceForm.tax_amount || 0),
      total_amount: Number(invoiceForm.total_amount || 0),
      cost_destination: invoiceForm.cost_destination,
      issuing_lawyer_user_id:
        invoiceForm.issuing_lawyer_user_id || null,
      issuing_lawyer_name:
        invoiceForm.issuing_lawyer_name.trim() || null,
      notes: invoiceForm.notes.trim() || null,
    };

    const result = editingInvoice
      ? await supabase
          .from("invoices")
          .update(payload)
          .eq("id", editingInvoice.id)
      : await supabase.from("invoices").insert(payload);

    if (result.error) {
      setMessage(`Errore: ${result.error.message}`);
      setSaving(false);
      return;
    }

    await loadBillingData();
    setShowInvoiceForm(false);
    setEditingInvoice(null);
    setInvoiceForm(emptyInvoiceForm);
    setMessage("Fattura salvata correttamente.");
    setSaving(false);
  }

  async function savePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!paymentForm.invoice_id || Number(paymentForm.amount) <= 0) {
      setMessage("Inserisci un importo valido.");
      return;
    }

    setSaving(true);
    setMessage("");

    const { error } = await supabase.from("payments").insert({
      studio_id: studioId,
      invoice_id: Number(paymentForm.invoice_id),
      amount: Number(paymentForm.amount),
      paid_at: paymentForm.paid_at,
      payment_method: paymentForm.payment_method || null,
      transaction_reference:
        paymentForm.transaction_reference.trim() || null,
      notes: paymentForm.notes.trim() || null,
    });

    if (error) {
      setMessage(`Errore: ${error.message}`);
      setSaving(false);
      return;
    }

    await loadBillingData();
    setShowPaymentForm(false);
    setPaymentForm(emptyPaymentForm);
    setMessage("Pagamento registrato.");
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-8">
        Caricamento fatture...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Totale fatturato"
          value={formatMoney(summary.totalIssued)}
        />
        <SummaryCard
          label="Totale incassato"
          value={formatMoney(summary.totalPaid)}
        />
        <SummaryCard
          label="Da incassare"
          value={formatMoney(summary.outstanding)}
        />
        <SummaryCard
          label="Fatture aperte"
          value={String(summary.unpaidCount)}
        />
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-xl font-semibold">Fatture da saldare</h3>
            <p className="mt-1 text-sm text-neutral-500">
              Fatture insolute o parzialmente saldate.
            </p>
          </div>

          <button
            type="button"
            onClick={openNewInvoice}
            className="rounded-xl bg-neutral-900 px-4 py-3 text-sm text-white"
          >
            Nuova fattura
          </button>
        </div>

        {message && <p className="mt-4 text-sm">{message}</p>}

        {unpaidInvoices.length > 0 && (
          <button
            type="button"
            onClick={() =>
              setSelectedInvoiceIds((current) =>
                unpaidInvoices.every((invoice) => current.includes(invoice.id))
                  ? current.filter(
                      (id) => !unpaidInvoices.some((invoice) => invoice.id === id)
                    )
                  : Array.from(
                      new Set([
                        ...current,
                        ...unpaidInvoices.map((invoice) => invoice.id),
                      ])
                    )
              )
            }
            className="mt-4 rounded-xl border border-neutral-300 px-4 py-2 text-sm"
          >
            {unpaidInvoices.every((invoice) =>
              selectedInvoiceIds.includes(invoice.id)
            )
              ? "Deseleziona tutte"
              : "Seleziona tutte"}
          </button>
        )}

        {selectedInvoiceIds.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-neutral-100 p-3 text-sm">
            <span>
              Selezionate: {selectedInvoiceIds.length} · Totale{" "}
              <strong>{formatMoney(selectedInvoiceTotal)}</strong>
            </span>
            <button
              type="button"
              onClick={() => setSelectedInvoiceIds([])}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5"
            >
              Deseleziona
            </button>
          </div>
        )}

        <div className="mt-6 space-y-4">
          {unpaidInvoices.length === 0 ? (
            <p className="text-sm text-neutral-500">
              Non risultano fatture da saldare.
            </p>
          ) : (
            unpaidInvoices.map((item) => (
              <InvoiceCard
                key={item.id}
                invoice={item}
                clients={clients}
                cases={cases}
                payments={payments.filter(
                  (payment) => payment.invoice_id === item.id
                )}
                onEdit={() => openEditInvoice(item)}
                onView={() => setPreviewInvoice(item)}
                onPayment={() => openPayment(item)}
                selected={selectedInvoiceIds.includes(item.id)}
                onToggleSelected={() => toggleInvoiceSelection(item.id)}
              />
            ))
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <button
          type="button"
          onClick={() => setShowPaid((current) => !current)}
          className="flex w-full items-center justify-between text-left"
        >
          <div>
            <h3 className="text-xl font-semibold">Fatture saldate</h3>
            <p className="mt-1 text-sm text-neutral-500">
              Archivio fatture interamente pagate: {paidInvoices.length}
            </p>
          </div>

          <span className="rounded-lg border border-neutral-300 px-3 py-2 text-sm">
            {showPaid ? "Chiudi elenco" : "Apri elenco"}
          </span>
        </button>

        {showPaid && (
          <div className="mt-6 space-y-4">
            {paidInvoices.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  setSelectedInvoiceIds((current) =>
                    paidInvoices.every((invoice) => current.includes(invoice.id))
                      ? current.filter(
                          (id) => !paidInvoices.some((invoice) => invoice.id === id)
                        )
                      : Array.from(
                          new Set([
                            ...current,
                            ...paidInvoices.map((invoice) => invoice.id),
                          ])
                        )
                  )
                }
                className="rounded-xl border border-neutral-300 px-4 py-2 text-sm"
              >
                {paidInvoices.every((invoice) =>
                  selectedInvoiceIds.includes(invoice.id)
                )
                  ? "Deseleziona tutte"
                  : "Seleziona tutte"}
              </button>
            )}
            {paidInvoices.length === 0 ? (
              <p className="text-sm text-neutral-500">
                Nessuna fattura saldata.
              </p>
            ) : (
              paidInvoices.map((item) => (
                <InvoiceCard
                  key={item.id}
                  invoice={item}
                  clients={clients}
                  cases={cases}
                  payments={payments.filter(
                    (payment) => payment.invoice_id === item.id
                  )}
                  onEdit={() => openEditInvoice(item)}
                  onView={() => setPreviewInvoice(item)}
                  selected={selectedInvoiceIds.includes(item.id)}
                  onToggleSelected={() => toggleInvoiceSelection(item.id)}
                />
              ))
            )}
          </div>
        )}
      </section>

      {showInvoiceForm && (
        <InvoiceModal
          form={invoiceForm}
          editing={Boolean(editingInvoice)}
          clients={clients}
          cases={cases}
          profiles={profiles}
          saving={saving}
          message={message}
          onChange={updateInvoiceForm}
          onSubmit={saveInvoice}
          onClose={() => {
            setShowInvoiceForm(false);
            setEditingInvoice(null);
            setInvoiceForm(emptyInvoiceForm);
            setMessage("");
          }}
        />
      )}

      {previewInvoice && !showInvoiceForm && (
        <InvoiceSummaryModal
          invoice={previewInvoice as ClientInvoice}
          onClose={() => setPreviewInvoice(null)}
          onEdit={() => {
            const invoice = previewInvoice;
            setPreviewInvoice(null);
            openEditInvoice(invoice);
          }}
        />
      )}

      {showPaymentForm && (
        <PaymentModal
          form={paymentForm}
          saving={saving}
          message={message}
          onChange={updatePaymentForm}
          onSubmit={savePayment}
          onClose={() => {
            setShowPaymentForm(false);
            setPaymentForm(emptyPaymentForm);
            setMessage("");
          }}
        />
      )}
    </div>
  );
}

function InvoiceCard({
  invoice,
  clients,
  cases,
  payments,
  onEdit,
  onView,
  onPayment,
  selected,
  onToggleSelected,
}: {
  invoice: InvoiceRecord;
  clients: ClientRecord[];
  cases: CaseRecord[];
  payments: PaymentRecord[];
  onEdit: () => void;
  onView: () => void;
  onPayment?: () => void;
  selected: boolean;
  onToggleSelected: () => void;
}) {
  const client = clients.find(
    (item) => item.id === invoice.client_contact_id
  );
  const caseRecord = cases.find((item) => item.id === invoice.case_id);
  const residual =
    Number(invoice.total_amount || 0) - Number(invoice.paid_amount || 0);

  return (
    <article className="rounded-2xl border border-neutral-200 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelected}
            aria-label={`Seleziona fattura ${invoice.invoice_number}`}
            className="mt-1 h-5 w-5 rounded border-neutral-300"
          />
          <div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onView}
              className="text-left text-lg font-semibold text-[#17376f] underline decoration-[#17376f]/30 underline-offset-4"
            >
              Fattura n. {invoice.invoice_number}
            </button>
            <StatusBadge status={invoice.status} />
          </div>

          <p className="mt-2 text-sm text-neutral-500">
            Cliente: {client?.display_name || "Non indicato"}
          </p>

          <p className="mt-1 text-sm text-neutral-500">
            Pratica:{" "}
            {caseRecord?.title ||
              caseRecord?.claimant_name_raw ||
              "Non collegata"}
          </p>

          <p className="mt-1 text-sm text-neutral-500">
            Emittente: {invoice.issuing_lawyer_name || "Non indicato"}
          </p>

          <p className="mt-1 text-sm capitalize text-neutral-500">
            Tipologia:{" "}
            {(invoice.cost_destination || "non indicata").replaceAll(
              "_",
              " "
            )}
          </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-xl border border-neutral-300 px-3 py-2 text-xs"
          >
            Modifica
          </button>

          {onPayment && (
            <button
              type="button"
              onClick={onPayment}
              className="rounded-xl bg-neutral-900 px-3 py-2 text-xs text-white"
            >
              Registra pagamento
            </button>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MiniCard
          label="Data emissione"
          value={formatDate(invoice.issue_date)}
        />
        <MiniCard
          label="Totale"
          value={formatMoney(invoice.total_amount)}
        />
        <MiniCard
          label="Pagato"
          value={formatMoney(invoice.paid_amount)}
        />
        <MiniCard
          label="Residuo"
          value={formatMoney(Math.max(residual, 0))}
        />
      </div>

      {payments.length > 0 && (
        <div className="mt-5 rounded-xl bg-neutral-50 p-4">
          <p className="text-sm font-medium">Pagamenti registrati</p>

          <div className="mt-3 space-y-2">
            {payments.map((payment) => (
              <div
                key={payment.id}
                className="flex flex-col justify-between gap-1 text-sm sm:flex-row"
              >
                <span>
                  {formatDate(payment.paid_at)} ·{" "}
                  {payment.payment_method || "Metodo non indicato"}
                </span>
                <span className="font-medium">
                  {formatMoney(payment.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function InvoiceModal({
  form,
  editing,
  clients,
  cases,
  profiles,
  saving,
  message,
  onChange,
  onSubmit,
  onClose,
}: {
  form: InvoiceForm;
  editing: boolean;
  clients: ClientRecord[];
  cases: CaseRecord[];
  profiles: ProfileOption[];
  saving: boolean;
  message: string;
  onChange: (field: keyof InvoiceForm, value: string | boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 px-4 py-8">
      <form
        onSubmit={onSubmit}
        className="mx-auto w-full max-w-5xl rounded-2xl bg-white p-6 shadow-2xl"
      >
        <ModalHeader
          title={editing ? "Modifica fattura" : "Nuova fattura"}
          onClose={onClose}
        />

        <div className="mt-6 space-y-5">
          <InvoiceFormSection
            title="Dati della fattura"
            description="Cliente, pratica, numero e date del documento."
          >
            <Select
              label="Cliente *"
              value={form.client_contact_id}
              onChange={(value) => onChange("client_contact_id", value)}
              options={[
                ["", "Seleziona cliente"],
                ...clients.map((item) => [
                  String(item.id),
                  item.display_name,
                ]),
              ]}
            />
            <Select
              label="Pratica collegata"
              value={form.case_id}
              onChange={(value) => onChange("case_id", value)}
              options={[
                ["", "Nessuna pratica"],
                ...cases.map((item) => [
                  String(item.id),
                  item.title ||
                    item.claimant_name_raw ||
                    `Pratica n. ${item.id}`,
                ]),
              ]}
            />
            <Input
              label="Numero fattura *"
              value={form.invoice_number}
              onChange={(value) => onChange("invoice_number", value)}
            />
            <Select
              label="Tipologia"
              value={form.cost_destination}
              onChange={(value) => onChange("cost_destination", value)}
              options={[
                ["compensi_cliente", "Compensi a carico del cliente"],
                ["spese_distratte", "Spese distratte in favore dello studio"],
                ["spese_ricorrente", "Spese liquidate al ricorrente"],
                ["recupero_spese_legali", "Recupero spese legali"],
                ["altro", "Altro"],
              ]}
            />
            <Input
              label="Data emissione"
              type="date"
              value={form.issue_date}
              onChange={(value) => onChange("issue_date", value)}
            />
            <Input
              label="Scadenza"
              type="date"
              value={form.due_date}
              onChange={(value) => onChange("due_date", value)}
            />
          </InvoiceFormSection>

          <InvoiceFormSection
            title="Professionista emittente"
            description="Seleziona un utente dello studio oppure indica un altro avvocato."
          >
            <Select
              label="Avvocato emittente"
              value={form.issuing_lawyer_user_id}
              onChange={(value) =>
                onChange("issuing_lawyer_user_id", value)
              }
              options={[
                ["", "Seleziona utente"],
                ...profiles.map((profile) => [
                  profile.id,
                  getProfileName(profile),
                ]),
              ]}
            />
            <Input
              label="Altro avvocato emittente"
              value={form.issuing_lawyer_name}
              onChange={(value) => onChange("issuing_lawyer_name", value)}
            />
          </InvoiceFormSection>

          <InvoiceFormSection
            title="Compensi e calcoli fiscali"
            description="Gli importi in grigio sono calcolati automaticamente."
          >
            <Input
              label="Onorari"
              type="number"
              value={form.taxable_amount}
              onChange={(value) => onChange("taxable_amount", value)}
            />
            <Input
              label="Spese generali 15%"
              type="number"
              value={form.general_expenses_amount}
              readOnly
            />
            <Input
              label="CPA 4%"
              type="number"
              value={form.cpa_amount}
              readOnly
            />
            <Input
              label="Spese esenti"
              type="number"
              value={form.exempt_expenses_amount}
              onChange={(value) =>
                onChange("exempt_expenses_amount", value)
              }
            />

            <TaxField
              label="IVA"
              optionLabel="Applica IVA 22%"
              checked={form.vat_enabled}
              value={form.tax_amount}
              onChange={(value) => onChange("vat_enabled", value)}
            />
            <TaxField
              label="Ritenuta d’acconto"
              optionLabel="Applica ritenuta 20%"
              checked={form.withholding_enabled}
              value={form.withholding_amount}
              onChange={(value) => onChange("withholding_enabled", value)}
            />

            <div className="rounded-xl border-2 border-neutral-900 bg-neutral-50 p-4 sm:col-span-2">
              <Input
                label="Totale fattura"
                type="number"
                value={form.total_amount}
                readOnly
              />
            </div>
          </InvoiceFormSection>

          <InvoiceFormSection
            title="Descrizione e note"
            description="Informazioni aggiuntive relative alla fattura."
          >
            <TextArea
              label="Descrizione"
              value={form.description}
              onChange={(value) => onChange("description", value)}
            />
            <TextArea
              label="Note"
              value={form.notes}
              onChange={(value) => onChange("notes", value)}
            />
          </InvoiceFormSection>
        </div>

        <ModalFooter saving={saving} message={message} onClose={onClose} />
      </form>
    </div>
  );
}

function InvoiceFormSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-neutral-50/60 p-4 sm:p-5">
      <h4 className="font-semibold text-neutral-900">{title}</h4>
      <p className="mt-1 text-sm text-neutral-500">{description}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function TaxField({
  label,
  optionLabel,
  checked,
  value,
  onChange,
}: {
  label: string;
  optionLabel: string;
  checked: boolean;
  value: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="rounded-xl border border-neutral-300 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-neutral-700">{label}</span>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => onChange(event.target.checked)}
            className="h-5 w-5 rounded border-neutral-300"
          />
          <span>{optionLabel}</span>
        </label>
      </div>
      <input
        type="number"
        step="0.01"
        value={value}
        readOnly
        className="w-full rounded-xl border border-neutral-300 bg-neutral-100 px-4 py-3 text-neutral-600"
      />
    </div>
  );
}

function PaymentModal({
  form,
  saving,
  message,
  onChange,
  onSubmit,
  onClose,
}: {
  form: PaymentForm;
  saving: boolean;
  message: string;
  onChange: (field: keyof PaymentForm, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl"
      >
        <ModalHeader title="Registra pagamento" onClose={onClose} />

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Input
            label="Importo"
            type="number"
            value={form.amount}
            onChange={(value) => onChange("amount", value)}
          />
          <Input
            label="Data pagamento"
            type="date"
            value={form.paid_at}
            onChange={(value) => onChange("paid_at", value)}
          />
          <Select
            label="Metodo"
            value={form.payment_method}
            onChange={(value) => onChange("payment_method", value)}
            options={[
              ["bonifico", "Bonifico"],
              ["contanti", "Contanti"],
              ["carta", "Carta"],
              ["assegno", "Assegno"],
              ["compensazione", "Compensazione"],
              ["altro", "Altro"],
            ]}
          />
          <Input
            label="Riferimento operazione"
            value={form.transaction_reference}
            onChange={(value) =>
              onChange("transaction_reference", value)
            }
          />
          <TextArea
            label="Note"
            value={form.notes}
            onChange={(value) => onChange("notes", value)}
          />
        </div>

        <ModalFooter saving={saving} message={message} onClose={onClose} />
      </form>
    </div>
  );
}

function ModalHeader({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  return (
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
  );
}

function ModalFooter({
  saving,
  message,
  onClose,
}: {
  saving: boolean;
  message: string;
  onClose: () => void;
}) {
  return (
    <>
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
          {saving ? "Salvataggio..." : "Salva"}
        </button>
      </div>
    </>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  type?: string;
  readOnly?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-neutral-500">{label}</span>
      <input
        type={type}
        step={type === "number" ? "0.01" : undefined}
        value={value}
        readOnly={readOnly}
        onChange={(event) => onChange?.(event.target.value)}
        className={`w-full rounded-xl border border-neutral-300 px-4 py-3 ${
          readOnly ? "bg-neutral-100 text-neutral-600" : ""
        }`}
      />
    </label>
  );
}

function Select({
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
        className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3"
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

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block sm:col-span-2">
      <span className="mb-2 block text-sm text-neutral-500">{label}</span>
      <textarea
        rows={4}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-neutral-300 px-4 py-3"
      />
    </label>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <p className="text-sm text-neutral-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold">{value}</p>
    </article>
  );
}

function MiniCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-neutral-50 p-4">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs capitalize text-neutral-700">
      {status.replaceAll("_", " ")}
    </span>
  );
}

function getProfileName(profile: ProfileOption) {
  return (
    profile.display_name ||
    [profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
    profile.email ||
    "Utente"
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(Number(value || 0));
}

function formatDate(value: string | null) {
  if (!value) return "Non indicata";

  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}
