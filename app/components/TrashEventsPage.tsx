"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import PermanentDeleteButton from "./PermanentDeleteButton";

type TrashEvent = {
  id: number;
  title: string;
  event_type: string | null;
  description: string | null;
  start_at: string | null;
  end_at: string | null;
  is_hearing: boolean;
  is_deadline: boolean;
  status: string | null;
  case_id: number | null;
  deleted_at: string | null;
  delete_reason: string | null;
};

export default function TrashEventsPage({
  studioId,
  onRefresh,
}: {
  studioId: string;
  onRefresh: () => Promise<void>;
}) {
  const [events, setEvents] = useState<TrashEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringEventId, setRestoringEventId] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  const loadTrashEvents = useCallback(async () => {
    const { data, error } = await supabase
      .from("events")
      .select(
        "id, title, event_type, description, start_at, end_at, is_hearing, is_deadline, status, case_id, deleted_at, delete_reason"
      )
      .eq("studio_id", studioId)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });

    if (error) throw error;
    setEvents((data ?? []) as TrashEvent[]);
  }, [studioId]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setMessage("");

      try {
        await loadTrashEvents();
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Errore durante il caricamento degli eventi eliminati."
        );
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [loadTrashEvents]);

  async function handleRestore(item: TrashEvent) {
    const confirmed = window.confirm("Vuoi ripristinare questo evento?");

    if (!confirmed) return;

    setRestoringEventId(item.id);
    setMessage("");

    try {
      const { error } = await supabase
        .from("events")
        .update({
          deleted_at: null,
          deleted_by: null,
          delete_reason: null,
        })
        .eq("id", item.id)
        .eq("studio_id", studioId);

      if (error) throw error;

      await loadTrashEvents();
      await onRefresh();
      setMessage("Evento ripristinato correttamente.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Errore durante il ripristino dell’evento."
      );
    } finally {
      setRestoringEventId(null);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-8">
        Caricamento eventi eliminati...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold">Eventi eliminati</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Ripristina udienze, scadenze e altre attività eliminate.
        </p>
      </section>

      {message && <p className="text-sm text-neutral-600">{message}</p>}

      {events.length === 0 ? (
        <section className="rounded-2xl border border-neutral-200 bg-white p-8 text-sm text-neutral-500 shadow-sm">
          Non ci sono eventi eliminati.
        </section>
      ) : (
        <section className="grid gap-4">
          {events.map((item) => (
            <article
              key={item.id}
              className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold">{item.title}</h3>
                    <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-700">
                      {getEventCategory(item)}
                    </span>
                    <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs capitalize text-neutral-700">
                      {(item.status || "aperto").replaceAll("_", " ")}
                    </span>
                  </div>

                  {item.start_at && (
                    <p className="mt-2 text-sm text-neutral-500">
                      Data evento: {formatDate(item.start_at)}
                      {item.end_at ? ` – ${formatDate(item.end_at)}` : ""}
                    </p>
                  )}

                  <p className="mt-1 text-sm text-neutral-500">
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
                    onClick={() => handleRestore(item)}
                    disabled={restoringEventId === item.id}
                    className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {restoringEventId === item.id
                      ? "Ripristino..."
                      : "Ripristina"}
                  </button>
                  <PermanentDeleteButton
                    resource="event"
                    id={item.id}
                    label={item.title}
                    onDeleted={async () => {
                      await Promise.all([loadTrashEvents(), onRefresh()]);
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

function getEventCategory(item: TrashEvent) {
  if (item.is_hearing) return "Udienza";
  if (item.is_deadline) return "Scadenza";
  return "Altra attività";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDeletedAt(value: string | null) {
  if (!value) return "Data non disponibile";

  return formatDate(value);
}
