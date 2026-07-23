"use client";

import { useState } from "react";
import {
  permanentlyDeleteTrashItem,
  type TrashResource,
} from "../../lib/permanent-delete";

export default function PermanentDeleteButton({
  resource,
  id,
  label,
  onDeleted,
  onMessage,
}: {
  resource: TrashResource;
  id: number | string;
  label: string;
  onDeleted: () => Promise<void>;
  onMessage: (message: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    const confirmed = window.confirm(
      `Eliminare definitivamente “${label}”?\n\nL’operazione è irreversibile e l’elemento non potrà più essere ripristinato.`
    );

    if (!confirmed) return;

    setDeleting(true);
    onMessage("");

    try {
      const result = await permanentlyDeleteTrashItem(resource, id);
      await onDeleted();
      onMessage(result.message);
    } catch (error) {
      onMessage(
        error instanceof Error
          ? `Errore: ${error.message}`
          : "Errore durante l’eliminazione definitiva."
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleDelete()}
      disabled={deleting}
      className="rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {deleting ? "Eliminazione..." : "Elimina definitivamente"}
    </button>
  );
}
