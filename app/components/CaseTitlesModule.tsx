"use client";

import { FormEvent, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

export type CaseTitleRecord = {
  id: number;
  case_id: number;
  title_type: string;
  title_number: string | null;
  issue_date: string | null;
  publication_date: string | null;
  outcome: string | null;
  summary: string | null;
  principal_amount: number;
  legal_costs: number;
  accessories: number;
  costs_awarded_to: string | null;
  notified: boolean;
  notification_date: string | null;
  notification_method: string | null;
  notification_recipient: string | null;
  payment_status: string;
  paid_amount: number;
  payment_date: string | null;
  provisional_enforcement: boolean | null;
  opposition_filed: boolean | null;
  enforceability_date: string | null;
  notes: string | null;
};

export type EnforcementActionRecord = {
  id: number;
  case_title_id: number;
  action_type: string;
  status: string | null;
  writ_served: boolean;
  writ_date: string | null;
  writ_amount: number | null;
  enforcement_type: string | null;
  public_body: string | null;
  voluntary_compliance_deadline: string | null;
  filing_date: string | null;
  compliance_rg: string | null;
  commissioner_name: string | null;
  commissioner_appointed_at: string | null;
  amount_recovered: number;
  notes: string | null;
};

type TitleForm = {
  title_type: string;
  title_number: string;
  issue_date: string;
  publication_date: string;
  outcome: string;
  summary: string;
  principal_amount: string;
  legal_costs: string;
  accessories: string;
  costs_awarded_to: string;
  notified: boolean;
  notification_date: string;
  notification_method: string;
  notification_recipient: string;
  payment_status: string;
  paid_amount: string;
  payment_date: string;
  provisional_enforcement: string;
  opposition_filed: string;
  enforceability_date: string;
  notes: string;
};

type EnforcementForm = {
  case_title_id: string;
  action_type: string;
  status: string;
  writ_served: boolean;
  writ_date: string;
  writ_amount: string;
  enforcement_type: string;
  public_body: string;
  voluntary_compliance_deadline: string;
  filing_date: string;
  compliance_rg: string;
  commissioner_name: string;
  commissioner_appointed_at: string;
  amount_recovered: string;
  notes: string;
};

const emptyTitleForm: TitleForm = {
  title_type: "sentenza",
  title_number: "",
  issue_date: "",
  publication_date: "",
  outcome: "",
  summary: "",
  principal_amount: "0",
  legal_costs: "0",
  accessories: "0",
  costs_awarded_to: "",
  notified: false,
  notification_date: "",
  notification_method: "",
  notification_recipient: "",
  payment_status: "non_pagato",
  paid_amount: "0",
  payment_date: "",
  provisional_enforcement: "",
  opposition_filed: "",
  enforceability_date: "",
  notes: "",
};

const emptyEnforcementForm: EnforcementForm = {
  case_title_id: "",
  action_type: "precetto",
  status: "da_valutare",
  writ_served: false,
  writ_date: "",
  writ_amount: "0",
  enforcement_type: "",
  public_body: "",
  voluntary_compliance_deadline: "",
  filing_date: "",
  compliance_rg: "",
  commissioner_name: "",
  commissioner_appointed_at: "",
  amount_recovered: "0",
  notes: "",
};

export default function CaseTitlesModule({
  studioId,
  caseId,
  titles,
  actions,
  onRefresh,
}: {
  studioId: string;
  caseId: number;
  titles: CaseTitleRecord[];
  actions: EnforcementActionRecord[];
  onRefresh: () => Promise<void>;
}) {
  const [showTitleForm, setShowTitleForm] = useState(false);
  const [showActionForm, setShowActionForm] = useState(false);
  const [editingTitle, setEditingTitle] = useState<CaseTitleRecord | null>(null);
  const [editingAction, setEditingAction] =
    useState<EnforcementActionRecord | null>(null);
  const [titleForm, setTitleForm] = useState<TitleForm>(emptyTitleForm);
  const [actionForm, setActionForm] =
    useState<EnforcementForm>(emptyEnforcementForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const actionsByTitle = useMemo(() => {
    const map = new Map<number, EnforcementActionRecord[]>();
    for (const action of actions) {
      map.set(action.case_title_id, [
        ...(map.get(action.case_title_id) ?? []),
        action,
      ]);
    }
    return map;
  }, [actions]);

  function updateTitle(field: keyof TitleForm, value: string | boolean) {
    setTitleForm((current) => ({ ...current, [field]: value }));
  }

  function updateAction(
    field: keyof EnforcementForm,
    value: string | boolean
  ) {
    setActionForm((current) => ({ ...current, [field]: value }));
  }

  function openNewTitle() {
    setEditingTitle(null);
    setTitleForm(emptyTitleForm);
    setMessage("");
    setShowTitleForm(true);
  }

  function openEditTitle(item: CaseTitleRecord) {
    setEditingTitle(item);
    setTitleForm({
      title_type: item.title_type,
      title_number: item.title_number ?? "",
      issue_date: item.issue_date ?? "",
      publication_date: item.publication_date ?? "",
      outcome: item.outcome ?? "",
      summary: item.summary ?? "",
      principal_amount: String(item.principal_amount ?? 0),
      legal_costs: String(item.legal_costs ?? 0),
      accessories: String(item.accessories ?? 0),
      costs_awarded_to: item.costs_awarded_to ?? "",
      notified: item.notified,
      notification_date: item.notification_date ?? "",
      notification_method: item.notification_method ?? "",
      notification_recipient: item.notification_recipient ?? "",
      payment_status: item.payment_status ?? "non_pagato",
      paid_amount: String(item.paid_amount ?? 0),
      payment_date: item.payment_date ?? "",
      provisional_enforcement:
        item.provisional_enforcement === null
          ? ""
          : String(item.provisional_enforcement),
      opposition_filed:
        item.opposition_filed === null ? "" : String(item.opposition_filed),
      enforceability_date: item.enforceability_date ?? "",
      notes: item.notes ?? "",
    });
    setMessage("");
    setShowTitleForm(true);
  }

  function openNewAction(titleId: number) {
    setEditingAction(null);
    setActionForm({
      ...emptyEnforcementForm,
      case_title_id: String(titleId),
    });
    setMessage("");
    setShowActionForm(true);
  }

  function openEditAction(item: EnforcementActionRecord) {
    setEditingAction(item);
    setActionForm({
      case_title_id: String(item.case_title_id),
      action_type: item.action_type,
      status: item.status ?? "da_valutare",
      writ_served: item.writ_served,
      writ_date: item.writ_date ?? "",
      writ_amount: String(item.writ_amount ?? 0),
      enforcement_type: item.enforcement_type ?? "",
      public_body: item.public_body ?? "",
      voluntary_compliance_deadline:
        item.voluntary_compliance_deadline ?? "",
      filing_date: item.filing_date ?? "",
      compliance_rg: item.compliance_rg ?? "",
      commissioner_name: item.commissioner_name ?? "",
      commissioner_appointed_at: item.commissioner_appointed_at ?? "",
      amount_recovered: String(item.amount_recovered ?? 0),
      notes: item.notes ?? "",
    });
    setMessage("");
    setShowActionForm(true);
  }

  async function saveTitle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    const payload = {
      studio_id: studioId,
      case_id: caseId,
      title_type: titleForm.title_type,
      title_number: titleForm.title_number.trim() || null,
      issue_date: titleForm.issue_date || null,
      publication_date: titleForm.publication_date || null,
      outcome: titleForm.outcome || null,
      summary: titleForm.summary.trim() || null,
      principal_amount: Number(titleForm.principal_amount || 0),
      legal_costs: Number(titleForm.legal_costs || 0),
      accessories: Number(titleForm.accessories || 0),
      costs_awarded_to: titleForm.costs_awarded_to || null,
      notified: titleForm.notified,
      notification_date: titleForm.notified
        ? titleForm.notification_date || null
        : null,
      notification_method: titleForm.notified
        ? titleForm.notification_method.trim() || null
        : null,
      notification_recipient: titleForm.notified
        ? titleForm.notification_recipient.trim() || null
        : null,
      payment_status: titleForm.payment_status,
      paid_amount: Number(titleForm.paid_amount || 0),
      payment_date: titleForm.payment_date || null,
      provisional_enforcement:
        titleForm.provisional_enforcement === ""
          ? null
          : titleForm.provisional_enforcement === "true",
      opposition_filed:
        titleForm.opposition_filed === ""
          ? null
          : titleForm.opposition_filed === "true",
      enforceability_date: titleForm.enforceability_date || null,
      notes: titleForm.notes.trim() || null,
    };

    const result = editingTitle
      ? await supabase
          .from("case_titles")
          .update(payload)
          .eq("id", editingTitle.id)
      : await supabase.from("case_titles").insert(payload);

    if (result.error) {
      setMessage(`Errore: ${result.error.message}`);
      setSaving(false);
      return;
    }

    await onRefresh();
    setShowTitleForm(false);
    setEditingTitle(null);
    setTitleForm(emptyTitleForm);
    setMessage("Provvedimento salvato.");
    setSaving(false);
  }

  async function saveAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    const payload = {
      studio_id: studioId,
      case_title_id: Number(actionForm.case_title_id),
      related_case_id: caseId,
      action_type: actionForm.action_type,
      status: actionForm.status,
      writ_served: actionForm.writ_served,
      writ_date: actionForm.writ_date || null,
      writ_amount: Number(actionForm.writ_amount || 0),
      enforcement_type: actionForm.enforcement_type.trim() || null,
      public_body: actionForm.public_body.trim() || null,
      voluntary_compliance_deadline:
        actionForm.voluntary_compliance_deadline || null,
      filing_date: actionForm.filing_date || null,
      compliance_rg: actionForm.compliance_rg.trim() || null,
      commissioner_name: actionForm.commissioner_name.trim() || null,
      commissioner_appointed_at:
        actionForm.commissioner_appointed_at || null,
      amount_recovered: Number(actionForm.amount_recovered || 0),
      notes: actionForm.notes.trim() || null,
    };

    const result = editingAction
      ? await supabase
          .from("enforcement_actions")
          .update(payload)
          .eq("id", editingAction.id)
      : await supabase.from("enforcement_actions").insert(payload);

    if (result.error) {
      setMessage(`Errore: ${result.error.message}`);
      setSaving(false);
      return;
    }

    await onRefresh();
    setShowActionForm(false);
    setEditingAction(null);
    setActionForm(emptyEnforcementForm);
    setMessage("Azione successiva salvata.");
    setSaving(false);
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="text-lg font-semibold">Provvedimenti e recupero</h4>
          <p className="mt-1 text-sm text-neutral-500">
            Sentenze, decreti ingiuntivi, notifiche, pagamenti, esecuzioni e
            ottemperanze.
          </p>
        </div>

        <button
          type="button"
          onClick={openNewTitle}
          className="rounded-xl bg-neutral-900 px-4 py-3 text-sm text-white"
        >
          Nuovo provvedimento
        </button>
      </div>

      {message && <p className="mt-4 text-sm text-neutral-600">{message}</p>}

      <div className="mt-6 space-y-4">
        {titles.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Nessun provvedimento inserito.
          </p>
        ) : (
          titles.map((item) => (
            <article
              key={item.id}
              className="rounded-2xl border border-neutral-200 p-5"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-neutral-500">
                    {item.title_type.replaceAll("_", " ")}
                  </p>
                  <h5 className="mt-1 text-lg font-semibold">
                    {item.title_number
                      ? `n. ${item.title_number}`
                      : "Numero non indicato"}
                  </h5>
                  <p className="mt-2 text-sm text-neutral-500">
                    Pubblicazione: {formatDate(item.publication_date)}
                  </p>
                  <p className="mt-1 text-sm">
                    Sorte: {item.outcome || "Non indicata"}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openEditTitle(item)}
                    className="rounded-xl border border-neutral-300 px-3 py-2 text-xs"
                  >
                    Modifica
                  </button>
                  <button
                    type="button"
                    onClick={() => openNewAction(item.id)}
                    className="rounded-xl bg-neutral-900 px-3 py-2 text-xs text-white"
                  >
                    Esecuzione / ottemperanza
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MiniCard
                  label="Sorte capitale"
                  value={formatMoney(item.principal_amount)}
                />
                <MiniCard
                  label="Spese liquidate"
                  value={formatMoney(item.legal_costs)}
                />
                <MiniCard
                  label="Notifica"
                  value={
                    item.notified
                      ? formatDate(item.notification_date)
                      : "Non notificata"
                  }
                />
                <MiniCard
                  label="Pagamento"
                  value={item.payment_status.replaceAll("_", " ")}
                />
              </div>

              <div className="mt-5 space-y-3">
                {(actionsByTitle.get(item.id) ?? []).map((action) => (
                  <div
                    key={action.id}
                    className="rounded-xl border border-neutral-200 bg-neutral-50 p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-medium capitalize">
                          {action.action_type.replaceAll("_", " ")}
                        </p>
                        <p className="mt-1 text-sm text-neutral-500 capitalize">
                          Stato: {(action.status || "non indicato").replaceAll(
                            "_",
                            " "
                          )}
                        </p>
                        {action.compliance_rg && (
                          <p className="mt-1 text-sm">
                            RG ottemperanza: {action.compliance_rg}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => openEditAction(action)}
                        className="rounded-lg border border-neutral-300 px-3 py-2 text-xs"
                      >
                        Modifica
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))
        )}
      </div>

      {showTitleForm && (
        <TitleModal
          form={titleForm}
          editing={Boolean(editingTitle)}
          saving={saving}
          message={message}
          onChange={updateTitle}
          onSubmit={saveTitle}
          onClose={() => {
            setShowTitleForm(false);
            setEditingTitle(null);
            setTitleForm(emptyTitleForm);
            setMessage("");
          }}
        />
      )}

      {showActionForm && (
        <EnforcementModal
          form={actionForm}
          editing={Boolean(editingAction)}
          saving={saving}
          message={message}
          onChange={updateAction}
          onSubmit={saveAction}
          onClose={() => {
            setShowActionForm(false);
            setEditingAction(null);
            setActionForm(emptyEnforcementForm);
            setMessage("");
          }}
        />
      )}
    </section>
  );
}

function TitleModal({
  form,
  editing,
  saving,
  message,
  onChange,
  onSubmit,
  onClose,
}: {
  form: TitleForm;
  editing: boolean;
  saving: boolean;
  message: string;
  onChange: (field: keyof TitleForm, value: string | boolean) => void;
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
          eyebrow="Provvedimento"
          title={editing ? "Modifica provvedimento" : "Nuovo provvedimento"}
          onClose={onClose}
        />

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Select
            label="Tipo"
            value={form.title_type}
            onChange={(value) => onChange("title_type", value)}
            options={[
              ["sentenza", "Sentenza"],
              ["decreto_ingiuntivo", "Decreto ingiuntivo"],
              ["ordinanza", "Ordinanza"],
              ["decreto", "Decreto"],
              ["altro", "Altro"],
            ]}
          />
          <Input
            label="Numero"
            value={form.title_number}
            onChange={(value) => onChange("title_number", value)}
          />
          <Input
            label="Data emissione"
            type="date"
            value={form.issue_date}
            onChange={(value) => onChange("issue_date", value)}
          />
          <Input
            label="Data pubblicazione"
            type="date"
            value={form.publication_date}
            onChange={(value) => onChange("publication_date", value)}
          />
          <Select
            label="Sorte"
            value={form.outcome}
            onChange={(value) => onChange("outcome", value)}
            options={[
              ["", "Seleziona"],
              ["accolta", "Accolta"],
              ["rigettata", "Rigettata"],
              ["parzialmente_accolta", "Parzialmente accolta"],
              ["improcedibile", "Improcedibile"],
              ["inammissibile", "Inammissibile"],
              ["estinta", "Estinta"],
              ["altro", "Altro"],
            ]}
          />
          <Select
            label="Spese liquidate in favore di"
            value={form.costs_awarded_to}
            onChange={(value) => onChange("costs_awarded_to", value)}
            options={[
              ["", "Non indicato"],
              ["studio_distrattario", "Studio distrattario"],
              ["ricorrente", "Ricorrente"],
              ["controparte", "Controparte"],
            ]}
          />
          <Input
            label="Sorte capitale"
            type="number"
            value={form.principal_amount}
            onChange={(value) => onChange("principal_amount", value)}
          />
          <Input
            label="Spese liquidate"
            type="number"
            value={form.legal_costs}
            onChange={(value) => onChange("legal_costs", value)}
          />
          <Input
            label="Accessori"
            type="number"
            value={form.accessories}
            onChange={(value) => onChange("accessories", value)}
          />
          <Select
            label="Stato pagamento"
            value={form.payment_status}
            onChange={(value) => onChange("payment_status", value)}
            options={[
              ["non_pagato", "Non pagato"],
              ["parzialmente_pagato", "Parzialmente pagato"],
              ["pagato", "Pagato"],
            ]}
          />
          <Input
            label="Importo pagato"
            type="number"
            value={form.paid_amount}
            onChange={(value) => onChange("paid_amount", value)}
          />
          <Input
            label="Data pagamento"
            type="date"
            value={form.payment_date}
            onChange={(value) => onChange("payment_date", value)}
          />

          <label className="flex items-center gap-3 rounded-xl border border-neutral-300 px-4 py-3">
            <input
              type="checkbox"
              checked={form.notified}
              onChange={(event) => onChange("notified", event.target.checked)}
            />
            Sentenza/provvedimento notificato
          </label>

          <Input
            label="Data notifica"
            type="date"
            value={form.notification_date}
            onChange={(value) => onChange("notification_date", value)}
          />
          <Input
            label="Modalità notifica"
            value={form.notification_method}
            onChange={(value) => onChange("notification_method", value)}
          />
          <Input
            label="Destinatario notifica"
            value={form.notification_recipient}
            onChange={(value) =>
              onChange("notification_recipient", value)
            }
          />
          <Select
            label="Provvisoriamente esecutivo"
            value={form.provisional_enforcement}
            onChange={(value) =>
              onChange("provisional_enforcement", value)
            }
            options={[
              ["", "Non indicato"],
              ["true", "Sì"],
              ["false", "No"],
            ]}
          />
          <Select
            label="Opposizione proposta"
            value={form.opposition_filed}
            onChange={(value) => onChange("opposition_filed", value)}
            options={[
              ["", "Non indicato"],
              ["true", "Sì"],
              ["false", "No"],
            ]}
          />
          <Input
            label="Data esecutività / giudicato"
            type="date"
            value={form.enforceability_date}
            onChange={(value) => onChange("enforceability_date", value)}
          />

          <TextArea
            label="Sintesi"
            value={form.summary}
            onChange={(value) => onChange("summary", value)}
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

function EnforcementModal({
  form,
  editing,
  saving,
  message,
  onChange,
  onSubmit,
  onClose,
}: {
  form: EnforcementForm;
  editing: boolean;
  saving: boolean;
  message: string;
  onChange: (
    field: keyof EnforcementForm,
    value: string | boolean
  ) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 px-4 py-8">
      <form
        onSubmit={onSubmit}
        className="mx-auto w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl"
      >
        <ModalHeader
          eyebrow="Fase successiva"
          title={editing ? "Modifica azione" : "Nuova azione"}
          onClose={onClose}
        />

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Select
            label="Tipo azione"
            value={form.action_type}
            onChange={(value) => onChange("action_type", value)}
            options={[
              ["precetto", "Precetto"],
              ["pignoramento", "Pignoramento"],
              ["esecuzione_mobiliare", "Esecuzione mobiliare"],
              ["esecuzione_immobiliare", "Esecuzione immobiliare"],
              ["esecuzione_presso_terzi", "Esecuzione presso terzi"],
              ["ottemperanza", "Giudizio di ottemperanza"],
              ["messa_in_mora", "Messa in mora"],
              ["altro", "Altro"],
            ]}
          />
          <Select
            label="Stato"
            value={form.status}
            onChange={(value) => onChange("status", value)}
            options={[
              ["da_valutare", "Da valutare"],
              ["da_avviare", "Da avviare"],
              ["in_preparazione", "In preparazione"],
              ["depositata", "Depositata"],
              ["in_corso", "In corso"],
              ["definita", "Definita"],
              ["pagata", "Pagata"],
              ["archiviata", "Archiviata"],
            ]}
          />

          <label className="flex items-center gap-3 rounded-xl border border-neutral-300 px-4 py-3">
            <input
              type="checkbox"
              checked={form.writ_served}
              onChange={(event) =>
                onChange("writ_served", event.target.checked)
              }
            />
            Precetto notificato
          </label>

          <Input
            label="Data precetto"
            type="date"
            value={form.writ_date}
            onChange={(value) => onChange("writ_date", value)}
          />
          <Input
            label="Importo precetto"
            type="number"
            value={form.writ_amount}
            onChange={(value) => onChange("writ_amount", value)}
          />
          <Input
            label="Tipo esecuzione"
            value={form.enforcement_type}
            onChange={(value) => onChange("enforcement_type", value)}
          />
          <Input
            label="Pubblica amministrazione"
            value={form.public_body}
            onChange={(value) => onChange("public_body", value)}
          />
          <Input
            label="Termine adempimento spontaneo"
            type="date"
            value={form.voluntary_compliance_deadline}
            onChange={(value) =>
              onChange("voluntary_compliance_deadline", value)
            }
          />
          <Input
            label="Data deposito"
            type="date"
            value={form.filing_date}
            onChange={(value) => onChange("filing_date", value)}
          />
          <Input
            label="RG ottemperanza/esecuzione"
            value={form.compliance_rg}
            onChange={(value) => onChange("compliance_rg", value)}
          />
          <Input
            label="Commissario ad acta"
            value={form.commissioner_name}
            onChange={(value) => onChange("commissioner_name", value)}
          />
          <Input
            label="Data nomina commissario"
            type="date"
            value={form.commissioner_appointed_at}
            onChange={(value) =>
              onChange("commissioner_appointed_at", value)
            }
          />
          <Input
            label="Importo recuperato"
            type="number"
            value={form.amount_recovered}
            onChange={(value) => onChange("amount_recovered", value)}
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
  eyebrow,
  title,
  onClose,
}: {
  eyebrow: string;
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm text-neutral-500">{eyebrow}</p>
        <h3 className="mt-1 text-xl font-semibold">{title}</h3>
      </div>
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
        step={type === "number" ? "0.01" : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-neutral-300 px-4 py-3"
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

function MiniCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-neutral-50 p-4">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 text-sm font-medium capitalize">{value}</p>
    </div>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(value || 0);
}

function formatDate(value: string | null) {
  if (!value) return "Non indicata";

  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}