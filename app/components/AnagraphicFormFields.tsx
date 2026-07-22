export type AnagraphicFormValues = {
  first_name: string;
  last_name: string;
  display_name: string;
  fiscal_code: string;
  vat_number: string;
  email: string;
  pec: string;
  phone: string;
  mobile_phone: string;
  organization: string;
  job_title: string;
  address: string;
  city: string;
  postal_code: string;
  province: string;
  notes: string;
};

export const emptyAnagraphicForm: AnagraphicFormValues = {
  first_name: "",
  last_name: "",
  display_name: "",
  fiscal_code: "",
  vat_number: "",
  email: "",
  pec: "",
  phone: "",
  mobile_phone: "",
  organization: "",
  job_title: "",
  address: "",
  city: "",
  postal_code: "",
  province: "",
  notes: "",
};

export default function AnagraphicFormFields({
  values,
  onChange,
}: {
  values: AnagraphicFormValues;
  onChange: (field: keyof AnagraphicFormValues, value: string) => void;
}) {
  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      <AnagraphicInput
        label="Nome"
        value={values.first_name}
        onChange={(value) => onChange("first_name", value)}
      />

      <AnagraphicInput
        label="Cognome"
        value={values.last_name}
        onChange={(value) => onChange("last_name", value)}
      />

      <AnagraphicInput
        label="Nominativo visualizzato"
        value={values.display_name}
        onChange={(value) => onChange("display_name", value)}
      />

      <AnagraphicInput
        label="Società / organizzazione"
        value={values.organization}
        onChange={(value) => onChange("organization", value)}
      />

      <AnagraphicInput
        label="Codice fiscale"
        value={values.fiscal_code}
        onChange={(value) => onChange("fiscal_code", value)}
      />

      <AnagraphicInput
        label="Partita IVA"
        value={values.vat_number}
        onChange={(value) => onChange("vat_number", value)}
      />

      <AnagraphicInput
        label="Email"
        type="email"
        value={values.email}
        onChange={(value) => onChange("email", value)}
      />

      <AnagraphicInput
        label="PEC"
        type="email"
        value={values.pec}
        onChange={(value) => onChange("pec", value)}
      />

      <AnagraphicInput
        label="Telefono"
        value={values.phone}
        onChange={(value) => onChange("phone", value)}
      />

      <AnagraphicInput
        label="Cellulare"
        value={values.mobile_phone}
        onChange={(value) => onChange("mobile_phone", value)}
      />

      <AnagraphicInput
        label="Qualifica"
        value={values.job_title}
        onChange={(value) => onChange("job_title", value)}
      />

      <AnagraphicInput
        label="Indirizzo"
        value={values.address}
        onChange={(value) => onChange("address", value)}
      />

      <AnagraphicInput
        label="Città"
        value={values.city}
        onChange={(value) => onChange("city", value)}
      />

      <AnagraphicInput
        label="CAP"
        value={values.postal_code}
        onChange={(value) => onChange("postal_code", value)}
      />

      <AnagraphicInput
        label="Provincia"
        value={values.province}
        onChange={(value) => onChange("province", value)}
      />

      <label className="block sm:col-span-2">
        <span className="mb-2 block text-sm text-neutral-500">Note</span>
        <textarea
          rows={4}
          value={values.notes}
          onChange={(event) => onChange("notes", event.target.value)}
          className="w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-neutral-600"
        />
      </label>
    </div>
  );
}

function AnagraphicInput({
  label,
  value,
  type = "text",
  onChange,
}: {
  label: string;
  value: string;
  type?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-neutral-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-neutral-600"
      />
    </label>
  );
}
