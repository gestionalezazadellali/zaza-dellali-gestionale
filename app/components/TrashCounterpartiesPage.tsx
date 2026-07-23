"use client";

import { useCallback, useEffect, useState } from "react";
import {
  restoreCounterparty,
  searchCounterparties,
  type CounterpartyRecord,
} from "../../lib/counterparties";
import PermanentDeleteButton from "./PermanentDeleteButton";

export default function TrashCounterpartiesPage({
  studioId,
  onRefresh,
}: {
  studioId: string;
  onRefresh: () => Promise<void>;
}) {
  const [counterparties, setCounterparties] = useState<CounterpartyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  const loadTrash = useCallback(async () => {
    const data = await searchCounterparties({
      studioId,
      onlyDeleted: true,
      limit: 100,
    });
    setCounterparties(data);
  }, [studioId]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setMessage("");

      try {
        await loadTrash();
      } catch (error) {
        setMessage(
          error instanceof Error
            ? `Errore: ${error.message}`
            : "Errore durante il caricamento delle controparti eliminate."
        );
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [loadTrash]);

  async function handleRestore(item: CounterpartyRecord) {
    const confirmed = window.confirm(
      `Vuoi ripristinare la controparte “${item.display_name}”?`
    );

    if (!confirmed) return;

    setRestoringId(item.id);
    setMessage("");

    try {
      await restoreCounterparty(studioId, item.id);
      await Promise.all([loadTrash(), onRefresh()]);
      setMessage("Controparte ripristinata correttamente.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `Errore: ${error.message}`
          : "Errore durante il ripristino della controparte."
      );
    } finally {
      setRestoringId(null);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-8">
        Caricamento controparti eliminate...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">Controparti eliminate</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Ripristina le anagrafiche eliminate dalla sezione Controparti.
        </p>
      </section>

      {message && <p className="text-sm text-neutral-600">{message}</p>}

      {counterparties.length === 0 ? (
        <section className="rounded-2xl border border-neutral-200 bg-white p-8 text-sm text-neutral-500 shadow-sm">
          Non ci sono controparti eliminate.
        </section>
      ) : (
        <section className="grid gap-4">
          {counterparties.map((item) => (
            <article
              key={item.id}
              className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold">
                    {item.display_name}
                  </h3>
                  {(item.organization || item.email) && (
                    <p className="mt-1 text-sm text-neutral-500">
                      {[item.organization, item.email]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                  <p className="mt-3 text-sm text-neutral-500">
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
                    onClick={() => void handleRestore(item)}
                    disabled={restoringId === item.id}
                    className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {restoringId === item.id ? "Ripristino..." : "Ripristina"}
                  </button>
                  <PermanentDeleteButton
                    resource="counterparty"
                    id={item.id}
                    label={item.display_name}
                    onDeleted={async () => {
                      await Promise.all([loadTrash(), onRefresh()]);
                    }}
                    onMessage={setMessage}
                  />
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

function formatDeletedAt(value: string | null) {
  if (!value) return "Data non disponibile";
  return new Date(value).toLocaleString("it-IT");
}
