"use client";

export type DeadlineDetails = {
  title: string;
  description: string;
  date: string;
  time: string;
};

export const emptyDeadlineDetails: DeadlineDetails = {
  title: "",
  description: "",
  date: "",
  time: "18:00",
};

export default function DeadlineFields({
  value,
  onChange,
}: {
  value: DeadlineDetails;
  onChange: (field: keyof DeadlineDetails, value: string) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block sm:col-span-2">
        <span className="mb-2 block text-sm text-neutral-500">Titolo *</span>
        <input
          value={value.title}
          onChange={(event) => onChange("title", event.target.value)}
          placeholder="Es. deposito note difensive"
          className="w-full rounded-xl border border-neutral-300 px-4 py-3"
        />
      </label>

      <label className="block">
        <span className="mb-2 block text-sm text-neutral-500">Data *</span>
        <input
          type="date"
          value={value.date}
          onChange={(event) => onChange("date", event.target.value)}
          className="w-full rounded-xl border border-neutral-300 px-4 py-3"
        />
      </label>

      <label className="block">
        <span className="mb-2 block text-sm text-neutral-500">
          Ora facoltativa
        </span>
        <input
          type="time"
          value={value.time}
          onChange={(event) => onChange("time", event.target.value)}
          className="w-full rounded-xl border border-neutral-300 px-4 py-3"
        />
      </label>

      <label className="block sm:col-span-2">
        <span className="mb-2 block text-sm text-neutral-500">
          Descrizione / cosa c’è da fare
        </span>
        <textarea
          rows={4}
          value={value.description}
          onChange={(event) => onChange("description", event.target.value)}
          className="w-full rounded-xl border border-neutral-300 px-4 py-3"
        />
      </label>
    </div>
  );
}
