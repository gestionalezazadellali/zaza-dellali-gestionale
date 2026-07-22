"use client";

import { FormEvent, useState } from "react";
import { supabase } from "../../lib/supabase";

type SearchResult = {
  id: string;
  category: string;
  title: string;
  subtitle: string;
  caseId?: number;
};

export default function GlobalSearchPage({
  onOpenCase,
  onOpenSection,
}: {
  onOpenCase: (caseId: number) => void;
  onOpenSection: (section: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(
    "Cerca per cliente, controparte, RG, giudice, fattura, sentenza o evento."
  );

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const value = query.trim();

    if (value.length < 2) {
      setMessage("Inserisci almeno due caratteri.");
      setResults([]);
      return;
    }

    setLoading(true);
    setMessage("");

    const pattern = `%${value}%`;

    const [
      contactsResult,
      counterpartiesResult,
      casesResult,
      eventsResult,
      invoicesResult,
      titlesResult,
    ] = await Promise.all([
      supabase
        .from("contacts")
        .select(
          "id, display_name, fiscal_code, email, pec, phone, organization"
        )
        .or(
          `display_name.ilike.${pattern},fiscal_code.ilike.${pattern},email.ilike.${pattern},pec.ilike.${pattern},phone.ilike.${pattern},organization.ilike.${pattern}`
        )
        .is("deleted_at", null)
        .limit(20),

      supabase
        .from("counterparties")
        .select("id, name, fiscal_code, vat_number, lawyer_name")
        .or(
          `name.ilike.${pattern},fiscal_code.ilike.${pattern},vat_number.ilike.${pattern},lawyer_name.ilike.${pattern}`
        )
        .limit(20),

      supabase
        .from("cases")
        .select(
          "id, title, claimant_name_raw, defendant_name_raw, rg_number, court_city, section, judge_name, status"
        )
        .or(
          `title.ilike.${pattern},claimant_name_raw.ilike.${pattern},defendant_name_raw.ilike.${pattern},rg_number.ilike.${pattern},court_city.ilike.${pattern},section.ilike.${pattern},judge_name.ilike.${pattern},status.ilike.${pattern}`
        )
        .limit(30),

      supabase
        .from("events")
        .select("id, case_id, title, description, event_type, start_at")
        .or(
          `title.ilike.${pattern},description.ilike.${pattern},event_type.ilike.${pattern}`
        )
        .limit(20),

      supabase
        .from("invoices")
        .select(
          "id, case_id, invoice_number, description, issuing_lawyer_name, status, total_amount"
        )
        .or(
          `invoice_number.ilike.${pattern},description.ilike.${pattern},issuing_lawyer_name.ilike.${pattern},status.ilike.${pattern}`
        )
        .limit(20),

      supabase
        .from("case_titles")
        .select(
          "id, case_id, title_type, title_number, outcome, summary, payment_status"
        )
        .or(
          `title_type.ilike.${pattern},title_number.ilike.${pattern},outcome.ilike.${pattern},summary.ilike.${pattern},payment_status.ilike.${pattern}`
        )
        .limit(20),
    ]);

    const firstError =
      contactsResult.error ||
      counterpartiesResult.error ||
      casesResult.error ||
      eventsResult.error ||
      invoicesResult.error ||
      titlesResult.error;

    if (firstError) {
      setMessage(`Errore: ${firstError.message}`);
      setResults([]);
      setLoading(false);
      return;
    }

    const combined: SearchResult[] = [];

    for (const item of contactsResult.data ?? []) {
      combined.push({
        id: `contact-${item.id}`,
        category: "Cliente",
        title: item.display_name || `Contatto n. ${item.id}`,
        subtitle:
          [
            item.fiscal_code ? `CF ${item.fiscal_code}` : "",
            item.organization || "",
            item.email || item.pec || item.phone || "",
          ]
            .filter(Boolean)
            .join(" · ") || "Anagrafica cliente",
      });
    }

    for (const item of counterpartiesResult.data ?? []) {
      combined.push({
        id: `counterparty-${item.id}`,
        category: "Controparte",
        title: item.name || `Controparte n. ${item.id}`,
        subtitle:
          [
            item.fiscal_code || item.vat_number || "",
            item.lawyer_name ? `Avv. ${item.lawyer_name}` : "",
          ]
            .filter(Boolean)
            .join(" · ") || "Anagrafica controparte",
      });
    }

    for (const item of casesResult.data ?? []) {
      combined.push({
        id: `case-${item.id}`,
        category: "Pratica",
        title:
          item.title ||
          item.claimant_name_raw ||
          `Pratica n. ${item.id}`,
        subtitle: [
          item.defendant_name_raw
            ? `contro ${item.defendant_name_raw}`
            : "",
          item.rg_number ? `RG ${item.rg_number}` : "",
          item.court_city || "",
          item.judge_name ? `Giudice ${item.judge_name}` : "",
        ]
          .filter(Boolean)
          .join(" · "),
        caseId: item.id,
      });
    }

    for (const item of eventsResult.data ?? []) {
      combined.push({
        id: `event-${item.id}`,
        category: item.event_type || "Evento",
        title: item.title,
        subtitle: [
          formatDateTime(item.start_at),
          item.description || "",
        ]
          .filter(Boolean)
          .join(" · "),
        caseId: item.case_id ?? undefined,
      });
    }

    for (const item of invoicesResult.data ?? []) {
      combined.push({
        id: `invoice-${item.id}`,
        category: "Fattura",
        title: `Fattura n. ${item.invoice_number}`,
        subtitle: [
          formatMoney(item.total_amount),
          item.status?.replaceAll("_", " "),
          item.issuing_lawyer_name || "",
        ]
          .filter(Boolean)
          .join(" · "),
        caseId: item.case_id ?? undefined,
      });
    }

    for (const item of titlesResult.data ?? []) {
      combined.push({
        id: `title-${item.id}`,
        category:
          item.title_type?.replaceAll("_", " ") || "Provvedimento",
        title: item.title_number
          ? `n. ${item.title_number}`
          : "Numero non indicato",
        subtitle: [
          item.outcome || "",
          item.payment_status?.replaceAll("_", " ") || "",
          item.summary || "",
        ]
          .filter(Boolean)
          .join(" · "),
        caseId: item.case_id,
      });
    }

    setResults(combined);
    setMessage(
      combined.length === 0
        ? "Nessun risultato trovato."
        : `Risultati trovati: ${combined.length}`
    );
    setLoading(false);
  }

  function openResult(result: SearchResult) {
    if (result.caseId) {
      onOpenCase(result.caseId);
      return;
    }

    if (result.category === "Cliente") {
      onOpenSection("Clienti");
      return;
    }

    if (result.category === "Controparte") {
      onOpenSection("Pratiche");
      return;
    }

    if (result.category === "Fattura") {
      onOpenSection("Fatture");
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div>
          <p className="text-sm text-neutral-500">
            Ricerca trasversale nel gestionale
          </p>
          <h3 className="mt-1 text-xl font-semibold">Ricerca globale</h3>
        </div>

        <form
          onSubmit={handleSearch}
          className="mt-6 flex flex-col gap-3 sm:flex-row"
        >
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Es. Bovenzi, 11884/2025, Engie, 4446/2026..."
            className="min-w-0 flex-1 rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-neutral-600"
          />

          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-neutral-900 px-6 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "Ricerca..." : "Cerca"}
          </button>
        </form>

        <p className="mt-4 text-sm text-neutral-500">{message}</p>
      </section>

      <section className="grid gap-4">
        {results.map((result) => (
          <button
            key={result.id}
            type="button"
            onClick={() => openResult(result)}
            className="rounded-2xl border border-neutral-200 bg-white p-5 text-left shadow-sm transition hover:border-neutral-400 hover:bg-neutral-50"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-neutral-500">
                  {result.category}
                </p>

                <h4 className="mt-1 text-lg font-semibold">
                  {result.title}
                </h4>

                <p className="mt-2 text-sm text-neutral-500">
                  {result.subtitle || "Nessun dettaglio disponibile"}
                </p>
              </div>

              <span className="rounded-xl border border-neutral-300 px-3 py-2 text-xs">
                {result.caseId ? "Apri pratica" : "Apri sezione"}
              </span>
            </div>
          </button>
        ))}
      </section>
    </div>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(Number(value || 0));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
