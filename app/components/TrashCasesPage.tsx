"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import TrashClientsPage from "./TrashClientsPage";
import TrashCounterpartiesPage from "./TrashCounterpartiesPage";
import TrashEventsPage from "./TrashEventsPage";
import TrashUsersPage from "./TrashUsersPage";
import PermanentDeleteButton from "./PermanentDeleteButton";

type TrashCase = {
  id: number;
  title: string | null;
  claimant_name_raw: string | null;
  defendant_name_raw: string | null;
  rg_number: string | null;
  deleted_at: string | null;
  delete_reason: string | null;
};

export default function TrashCasesPage({
  studioId,
  onRefresh,
}: {
  studioId: string;
  onRefresh: () => Promise<void>;
}) {
  const [cases, setCases] = useState<TrashCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringCaseId, setRestoringCaseId] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  const loadTrashCases = useCallback(async () => {
    const { data, error } = await supabase
      .from("cases")
      .select(
        "id, title, claimant_name_raw, defendant_name_raw, rg_number, deleted_at, delete_reason"
      )
      .eq("studio_id", studioId)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });

    if (error) throw error;
    setCases((data ?? []) as TrashCase[]);
  }, [studioId]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setMessage("");

      try {
        await loadTrashCases();
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Errore durante il caricamento del cestino."
        );
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [loadTrashCases]);

  async function handleRestore(item: TrashCase) {
    const confirmed = window.confirm("Vuoi ripristinare questa pratica?");

    if (!confirmed) return;

    setRestoringCaseId(item.id);
    setMessage("");

    try {
      const { error } = await supabase
        .from("cases")
        .update({
          deleted_at: null,
          deleted_by: null,
          delete_reason: null,
        })
        .eq("id", item.id)
        .eq("studio_id", studioId);

      if (error) throw error;

      await loadTrashCases();
      await onRefresh();
      setMessage("Pratica ripristinata correttamente.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Errore durante il ripristino della pratica."
      );
    } finally {
      setRestoringCaseId(null);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-8">
        Caricamento cestino pratiche...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">Cestino pratiche</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Ripristina le pratiche eliminate dalla sezione Pratiche.
        </p>
      </section>

      {message && <p className="text-sm text-neutral-600">{message}</p>}

      {cases.length === 0 ? (
        <section className="rounded-2xl border border-neutral-200 bg-white p-8 text-sm text-neutral-500 shadow-sm">
          Il cestino delle pratiche è vuoto.
        </section>
      ) : (
        <section className="grid gap-4">
          {cases.map((item) => (
            <article
              key={item.id}
              className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold">
                    {item.title ||
                      item.claimant_name_raw ||
                      `Pratica n. ${item.id}`}
                  </h3>
                  <p className="mt-1 text-sm text-neutral-500">
                    Controparte: {item.defendant_name_raw || "Non indicata"}
                  </p>
                  <p className="mt-3 text-sm">
                    RG: {item.rg_number || "Non indicato"}
                  </p>
                  <p className="mt-1 text-sm text-neutral-500">
                    Eliminata il: {formatDeletedAt(item.deleted_at)}
                  </p>
                  {item.delete_reason && (
                    <p className="mt-1 text-sm text-neutral-500">
                      Motivo: {item.delete_reason}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleRestore(item)}
                    disabled={restoringCaseId === item.id}
                    className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {restoringCaseId === item.id
                      ? "Ripristino..."
                      : "Ripristina"}
                  </button>
                  <PermanentDeleteButton
                    resource="case"
                    id={item.id}
                    label={
                      item.title ||
                      item.claimant_name_raw ||
                      `Pratica n. ${item.id}`
                    }
                    onDeleted={async () => {
                      await Promise.all([loadTrashCases(), onRefresh()]);
                    }}
                    onMessage={setMessage}
                  />
                </div>
              </div>
            </article>
          ))}
        </section>
      )}

      <TrashClientsPage
        studioId={studioId}
        onRefresh={onRefresh}
      />

      <TrashCounterpartiesPage
        studioId={studioId}
        onRefresh={onRefresh}
      />

      <TrashEventsPage
        studioId={studioId}
        onRefresh={onRefresh}
      />

      <TrashUsersPage studioId={studioId} onRefresh={onRefresh} />
    </div>
  );
}

function formatDeletedAt(value: string | null) {
  if (!value) return "Data non disponibile";

  return new Date(value).toLocaleString("it-IT");
}
