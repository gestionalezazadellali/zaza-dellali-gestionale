"use client";

import { useCallback, useEffect, useState } from "react";
import {
  restoreCounterparty,
  searchCounterparties,
  type CounterpartyRecord,
} from "../../lib/counterparties";
import PermanentDeleteButton from "./PermanentDeleteButton";
import { permanentlyDeleteTrashItem } from "../../lib/permanent-delete";

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
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkWorking, setBulkWorking] = useState(false);
  const [message, setMessage] = useState("");

  const loadTrash = useCallback(async () => {
    const data = await searchCounterparties({
      studioId,
      onlyDeleted: true,
      limit: 100,
    });
    setCounterparties(data);
    setSelectedIds((current) =>
      current.filter((id) => data.some((item) => item.id === id))
    );
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

  function toggleSelection(id: number) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  }

  async function handleBulkDelete() {
    if (selectedIds.length === 0) return;
    const confirmed = window.confirm(
      `Eliminare definitivamente ${selectedIds.length} controparti selezionate?\n\nI collegamenti storici verranno trasferiti alla controparte attiva equivalente quando possibile. L’operazione è irreversibile.`
    );
    if (!confirmed) return;

    setBulkWorking(true);
    setMessage("");
    const errors: string[] = [];

    for (const id of selectedIds) {
      try {
        await permanentlyDeleteTrashItem("counterparty", id);
      } catch (error) {
        const item = counterparties.find((entry) => entry.id === id);
        errors.push(
          `${item?.display_name || `Controparte ${id}`}: ${
            error instanceof Error ? error.message : "eliminazione non riuscita"
          }`
        );
      }
    }

    await Promise.all([loadTrash(), onRefresh()]);
    setBulkWorking(false);
    setMessage(
      errors.length === 0
        ? "Controparti selezionate eliminate definitivamente."
        : `Operazione completata con ${errors.length} elementi non eliminati: ${errors.join(" · ")}`
    );
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
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={
                  counterparties.length > 0 &&
                  selectedIds.length === counterparties.length
                }
                onChange={(event) =>
                  setSelectedIds(
                    event.target.checked
                      ? counterparties.map((item) => item.id)
                      : []
                  )
                }
                className="h-4 w-4 rounded border-neutral-300"
              />
              Seleziona tutte
            </label>
            <button
              type="button"
              onClick={() => void handleBulkDelete()}
              disabled={selectedIds.length === 0 || bulkWorking}
              className="rounded-xl border border-red-300 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-40"
            >
              {bulkWorking
                ? "Eliminazione..."
                : `Elimina definitivamente (${selectedIds.length})`}
            </button>
          </div>
          {counterparties.map((item) => (
            <article
              key={item.id}
              className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 gap-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(item.id)}
                    onChange={() => toggleSelection(item.id)}
                    aria-label={`Seleziona ${item.display_name}`}
                    className="mt-1 h-4 w-4 shrink-0 rounded border-neutral-300"
                  />
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
