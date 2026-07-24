"use client";

import { useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { getCounterpartyNames, type CaseRecord } from "./CasesPage";
import type { CalendarEvent } from "./CaseDetail";

export default function HearingsPage({
  studioId,
  events,
  cases,
  onOpenCase,
  onRefresh,
}: {
  studioId: string;
  events: CalendarEvent[];
  cases: CaseRecord[];
  onOpenCase: (caseId: number) => void;
  onRefresh: () => Promise<void>;
}) {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [message, setMessage] = useState("");

  const hearings = useMemo(() => {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 15);
    to.setHours(23, 59, 59, 999);

    return events
      .filter(
        (item) =>
          item.is_hearing &&
          !item.is_deadline &&
          new Date(item.start_at) >= from &&
          new Date(item.start_at) <= to
      )
      .sort(
        (a, b) =>
          new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
      );
  }, [events]);

  function toggle(id: number) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  }

  async function moveSelectedToTrash() {
    if (selectedIds.length === 0) return;
    if (
      !window.confirm(
        `Spostare nel cestino le ${selectedIds.length} udienze selezionate?`
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
        delete_reason: "Eliminazione multipla dalla sezione Udienze",
      })
      .eq("studio_id", studioId)
      .in("id", selectedIds);

    if (error) {
      setMessage(`Errore: ${error.message}`);
      return;
    }
    setSelectedIds([]);
    await onRefresh();
    setMessage("Udienze spostate nel cestino.");
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h3 className="text-xl font-semibold">Udienze</h3>
        <p className="mt-1 text-sm text-neutral-500">
          Udienze da oggi ai prossimi 15 giorni.
        </p>
        {hearings.length > 0 && (
          <button
            type="button"
            onClick={() =>
              setSelectedIds((current) =>
                current.length === hearings.length
                  ? []
                  : hearings.map((item) => item.id)
              )
            }
            className="mt-4 rounded-xl border border-neutral-300 px-4 py-2 text-sm"
          >
            {selectedIds.length === hearings.length
              ? "Deseleziona tutte"
              : "Seleziona tutte"}
          </button>
        )}
        {selectedIds.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={moveSelectedToTrash}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm text-white"
            >
              Elimina selezionate ({selectedIds.length})
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="rounded-xl border border-neutral-300 px-4 py-2 text-sm"
            >
              Deseleziona
            </button>
          </div>
        )}
        {message && <p className="mt-4 text-sm">{message}</p>}
      </section>

      {hearings.length === 0 ? (
        <section className="rounded-2xl border border-neutral-200 bg-white p-8 text-sm text-neutral-500">
          Nessuna udienza nei prossimi 15 giorni.
        </section>
      ) : (
        <section className="space-y-3">
          {hearings.map((item) => {
            const linkedCase = cases.find((record) => record.id === item.case_id);
            return (
              <article
                key={item.id}
                className="flex gap-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(item.id)}
                  onChange={() => toggle(item.id)}
                  aria-label={`Seleziona ${item.title}`}
                  className="mt-1 h-5 w-5 rounded border-neutral-300"
                />
                <button
                  type="button"
                  disabled={!linkedCase}
                  onClick={() => linkedCase && onOpenCase(linkedCase.id)}
                  className="min-w-0 flex-1 text-left disabled:cursor-default"
                >
                  <p className="font-semibold">{formatDate(item.start_at)}</p>
                  <p className="mt-1">{item.title}</p>
                  <p className="mt-2 text-sm text-neutral-500">
                    {linkedCase ? getCaseLabel(linkedCase) : "Pratica non disponibile"}
                  </p>
                  {item.description && (
                    <p className="mt-2 text-sm text-neutral-600">
                      {item.description}
                    </p>
                  )}
                </button>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getCaseLabel(item: CaseRecord) {
  const contact = Array.isArray(item.contacts) ? item.contacts[0] : item.contacts;
  const claimant =
    contact?.display_name || item.claimant_name_raw || `Pratica n. ${item.id}`;
  const defendant =
    getCounterpartyNames(item).join(", ") ||
    item.defendant_name_raw ||
    "controparte non indicata";
  return `${claimant} c. ${defendant}`;
}
