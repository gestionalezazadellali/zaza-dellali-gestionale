import { supabase } from "./supabase";

export type TrashResource =
  | "case"
  | "client"
  | "counterparty"
  | "event"
  | "user";

export async function permanentlyDeleteTrashItem(
  resource: TrashResource,
  id: number | string
) {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    throw new Error("Sessione non valida. Accedi nuovamente.");
  }

  const response = await fetch("/api/admin/permanently-delete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ resource, id }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Eliminazione definitiva non riuscita.");
  }

  return payload as { success: true; message: string };
}
