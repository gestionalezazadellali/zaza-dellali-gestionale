"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import PermanentDeleteButton from "./PermanentDeleteButton";

type TrashClient = {
  id: number;
  display_name: string;
  email: string | null;
  organization: string | null;
  deleted_at: string | null;
  delete_reason: string | null;
};

export default function TrashClientsPage({
  studioId,
  onRefresh,
}: {
  studioId: string;
  onRefresh: () => Promise<void>;
}) {
  const [clients, setClients] = useState<TrashClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringClientId, setRestoringClientId] = useState<number | null>(
    null
  );
  const [message, setMessage] = useState("");

  const loadTrashClients = useCallback(async () => {
    const { data, error } = await supabase
      .from("contacts")
      .select(
        "id, display_name, email, organization, deleted_at, delete_reason"
      )
      .eq("studio_id", studioId)
      .eq("contact_type", "cliente")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });

    if (error) throw error;
    setClients((data ?? []) as TrashClient[]);
  }, [studioId]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setMessage("");

      try {
        await loadTrashClients();
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Errore durante il caricamento dei clienti eliminati."
        );
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [loadTrashClients]);

  async function handleRestore(item: TrashClient) {
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
      setMessage("Non disponi del permesso per ripristinare i clienti.");
      return;
    }

    const confirmed = window.confirm(
      `Vuoi ripristinare il cliente “${item.display_name}”?`
    );

    if (!confirmed) return;

    setRestoringClientId(item.id);
    setMessage("");

    try {
      const { error } = await supabase
        .from("contacts")
        .update({
          deleted_at: null,
          deleted_by: null,
          delete_reason: null,
        })
        .eq("id", item.id)
        .eq("studio_id", studioId);

      if (error) throw error;

      await loadTrashClients();
      await onRefresh();
      setMessage("Cliente ripristinato correttamente.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `Errore: ${error.message}`
          : "Errore durante il ripristino del cliente."
      );
    } finally {
      setRestoringClientId(null);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-8">
        Caricamento clienti eliminati...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">Clienti eliminati</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Ripristina le anagrafiche eliminate dalla sezione Clienti.
        </p>
      </section>

      {message && <p className="text-sm text-neutral-600">{message}</p>}

      {clients.length === 0 ? (
        <section className="rounded-2xl border border-neutral-200 bg-white p-8 text-sm text-neutral-500 shadow-sm">
          Non ci sono clienti eliminati.
        </section>
      ) : (
        <section className="grid gap-4">
          {clients.map((item) => (
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
                    Eliminato il: {formatDeletedAt(item.deleted_at)}
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
                    disabled={restoringClientId === item.id}
                    className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {restoringClientId === item.id
                      ? "Ripristino..."
                      : "Ripristina"}
                  </button>
                  <PermanentDeleteButton
                    resource="client"
                    id={item.id}
                    label={item.display_name}
                    onDeleted={async () => {
                      await Promise.all([loadTrashClients(), onRefresh()]);
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
