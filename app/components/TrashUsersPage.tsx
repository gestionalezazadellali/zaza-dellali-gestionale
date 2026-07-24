"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import PermanentDeleteButton from "./PermanentDeleteButton";
import { permanentlyDeleteTrashItem } from "../../lib/permanent-delete";

type TrashUser = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  email: string | null;
  role: string;
  job_title: string | null;
  active: boolean;
  deleted_at: string | null;
  delete_reason: string | null;
};

export default function TrashUsersPage({
  studioId,
  onRefresh,
}: {
  studioId: string;
  onRefresh: () => Promise<void>;
}) {
  const [users, setUsers] = useState<TrashUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringUserId, setRestoringUserId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkWorking, setBulkWorking] = useState(false);

  const loadTrashUsers = useCallback(async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, first_name, last_name, display_name, email, role, job_title, active, deleted_at, delete_reason"
      )
      .eq("studio_id", studioId)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });

    if (error) throw error;
    setUsers((data ?? []) as TrashUser[]);
    setSelectedIds((current) =>
      current.filter((id) => (data ?? []).some((item) => item.id === id))
    );
  }, [studioId]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setMessage("");

      try {
        await loadTrashUsers();
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Errore durante il caricamento degli utenti disattivati."
        );
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [loadTrashUsers]);

  async function handleRestore(user: TrashUser) {
    const confirmed = window.confirm("Vuoi ripristinare questo utente?");

    if (!confirmed) return;

    setRestoringUserId(user.id);
    setMessage("");

    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          active: true,
          deleted_at: null,
          deleted_by: null,
          delete_reason: null,
        })
        .eq("id", user.id)
        .eq("studio_id", studioId);

      if (error) throw error;

      await loadTrashUsers();
      setMessage("Utente ripristinato correttamente.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Errore durante il ripristino dell’utente."
      );
    } finally {
      setRestoringUserId(null);
    }
  }

  async function deleteSelected() {
    if (!selectedIds.length) return;
    if (!window.confirm(`Eliminare definitivamente ${selectedIds.length} utenti selezionati?`)) return;
    setBulkWorking(true);
    try {
      for (const id of selectedIds) await permanentlyDeleteTrashItem("user", id);
      await Promise.all([loadTrashUsers(), onRefresh()]);
      setMessage("Utenti selezionati eliminati definitivamente.");
    } catch (error) {
      setMessage(error instanceof Error ? `Errore: ${error.message}` : "Eliminazione non riuscita.");
    } finally {
      setBulkWorking(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-8">
        Caricamento utenti disattivati...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">Utenti disattivati</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Ripristina gli account disattivati dalla sezione Utenti.
        </p>
      </section>

      {message && <p className="text-sm text-neutral-600">{message}</p>}

      {users.length === 0 ? (
        <section className="rounded-2xl border border-neutral-200 bg-white p-8 text-sm text-neutral-500 shadow-sm">
          Non ci sono utenti disattivati.
        </section>
      ) : (
        <section className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white p-4">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={selectedIds.length === users.length}
                onChange={() =>
                  setSelectedIds(
                    selectedIds.length === users.length ? [] : users.map((item) => item.id)
                  )
                }
              />
              Seleziona tutti
            </label>
            <button
              type="button"
              onClick={() => void deleteSelected()}
              disabled={!selectedIds.length || bulkWorking}
              className="rounded-xl border border-red-300 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-40"
            >
              {bulkWorking ? "Eliminazione..." : `Elimina definitivamente (${selectedIds.length})`}
            </button>
          </div>
          {users.map((user) => (
            <article
              key={user.id}
              className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 gap-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(user.id)}
                    onChange={() =>
                      setSelectedIds((current) =>
                        current.includes(user.id)
                          ? current.filter((id) => id !== user.id)
                          : [...current, user.id]
                      )
                    }
                    className="mt-1 h-4 w-4 shrink-0 rounded border-neutral-300"
                  />
                  <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold">
                      {getUserName(user)}
                    </h3>
                    <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs capitalize text-neutral-700">
                      {user.role.replaceAll("_", " ")}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-neutral-500">
                    {user.email || "Email non indicata"}
                  </p>
                  {user.job_title && (
                    <p className="mt-1 text-sm text-neutral-500">
                      Qualifica: {user.job_title}
                    </p>
                  )}
                  <p className="mt-3 text-sm text-neutral-500">
                    Disattivato il: {formatDeletedAt(user.deleted_at)}
                  </p>
                  {user.delete_reason && (
                    <p className="mt-1 text-sm text-neutral-500">
                      Motivo: {user.delete_reason}
                    </p>
                  )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleRestore(user)}
                    disabled={restoringUserId === user.id}
                    className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {restoringUserId === user.id
                      ? "Ripristino..."
                      : "Ripristina"}
                  </button>
                  <PermanentDeleteButton
                    resource="user"
                    id={user.id}
                    label={getUserName(user)}
                    onDeleted={async () => {
                      await Promise.all([loadTrashUsers(), onRefresh()]);
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

function getUserName(user: TrashUser) {
  return (
    [user.first_name, user.last_name].filter(Boolean).join(" ") ||
    user.display_name ||
    "Utente"
  );
}

function formatDeletedAt(value: string | null) {
  if (!value) return "Data non disponibile";

  return new Date(value).toLocaleString("it-IT");
}
