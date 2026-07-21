"use client";

import { FormEvent, useEffect, useEffectEvent, useState } from "react";
import { supabase } from "../../lib/supabase";

type ProfileRecord = {
  id: string;
  studio_id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  role: string;
  job_title: string | null;
  email: string | null;
  pec: string | null;
  phone: string | null;
  fiscal_code: string | null;
  address: string | null;
  active: boolean;
};

type PermissionRecord = {
  user_id: string;
  can_view_clients: boolean;
  can_edit_clients: boolean;
  can_view_cases: boolean;
  can_edit_cases: boolean;
  can_manage_deadlines: boolean;
  can_manage_hearings: boolean;
  can_manage_documents: boolean;
  can_view_billing: boolean;
  can_manage_billing: boolean;
  can_export_data: boolean;
  can_manage_users: boolean;
  can_manage_backups: boolean;
};

type UserForm = {
  first_name: string;
  last_name: string;
  display_name: string;
  email: string;
  role: string;
  job_title: string;
  pec: string;
  phone: string;
  fiscal_code: string;
  address: string;
  active: boolean;
};

type InviteForm = {
  email: string;
  first_name: string;
  last_name: string;
  display_name: string;
  role: string;
};

const emptyUserForm: UserForm = {
  first_name: "",
  last_name: "",
  display_name: "",
  email: "",
  role: "collaborator",
  job_title: "",
  pec: "",
  phone: "",
  fiscal_code: "",
  address: "",
  active: true,
};

const emptyInviteForm: InviteForm = {
  email: "",
  first_name: "",
  last_name: "",
  display_name: "",
  role: "collaborator",
};

const permissionLabels: Array<[keyof PermissionRecord, string]> = [
  ["can_view_clients", "Visualizzare clienti"],
  ["can_edit_clients", "Modificare clienti"],
  ["can_view_cases", "Visualizzare pratiche"],
  ["can_edit_cases", "Modificare pratiche"],
  ["can_manage_deadlines", "Gestire scadenze"],
  ["can_manage_hearings", "Gestire udienze"],
  ["can_manage_documents", "Gestire documenti"],
  ["can_view_billing", "Visualizzare fatturazione"],
  ["can_manage_billing", "Gestire fatturazione"],
  ["can_export_data", "Esportare dati"],
  ["can_manage_users", "Gestire utenti"],
  ["can_manage_backups", "Gestire backup"],
];

export default function UsersPage() {
  const [profiles, setProfiles] = useState<ProfileRecord[]>([]);
  const [permissions, setPermissions] = useState<PermissionRecord[]>([]);
  const [selectedUser, setSelectedUser] = useState<ProfileRecord | null>(null);
  const [userForm, setUserForm] = useState<UserForm>(emptyUserForm);
  const [permissionForm, setPermissionForm] =
    useState<PermissionRecord | null>(null);
  const [inviteForm, setInviteForm] =
    useState<InviteForm>(emptyInviteForm);
  const [showInvite, setShowInvite] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deactivatingUserId, setDeactivatingUserId] = useState<string | null>(
    null
  );
  const [message, setMessage] = useState("");

  async function loadUsers() {
    setLoading(true);
    setMessage("");

    const [profileResult, permissionResult] = await Promise.all([
      supabase
        .from("profiles")
        .select(
          "id, studio_id, first_name, last_name, display_name, role, job_title, email, pec, phone, fiscal_code, address, active"
        )
        .is("deleted_at", null)
        .order("display_name", { ascending: true }),

      supabase
        .from("user_permissions")
        .select(
          "user_id, can_view_clients, can_edit_clients, can_view_cases, can_edit_cases, can_manage_deadlines, can_manage_hearings, can_manage_documents, can_view_billing, can_manage_billing, can_export_data, can_manage_users, can_manage_backups"
        ),
    ]);

    const error = profileResult.error || permissionResult.error;

    if (error) {
      setMessage(`Errore: ${error.message}`);
      setLoading(false);
      return;
    }

    setProfiles((profileResult.data ?? []) as ProfileRecord[]);
    setPermissions((permissionResult.data ?? []) as PermissionRecord[]);
    setLoading(false);
  }

  const loadUsersEffect = useEffectEvent(loadUsers);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadUsersEffect();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  function openEdit(user: ProfileRecord) {
    const permission = permissions.find(
      (item) => item.user_id === user.id
    );

    setSelectedUser(user);
    setUserForm({
      first_name: user.first_name ?? "",
      last_name: user.last_name ?? "",
      display_name: user.display_name ?? "",
      email: user.email ?? "",
      role: user.role,
      job_title: user.job_title ?? "",
      pec: user.pec ?? "",
      phone: user.phone ?? "",
      fiscal_code: user.fiscal_code ?? "",
      address: user.address ?? "",
      active: user.active,
    });

    setPermissionForm(
      permission ?? {
        user_id: user.id,
        can_view_clients: true,
        can_edit_clients: false,
        can_view_cases: true,
        can_edit_cases: false,
        can_manage_deadlines: false,
        can_manage_hearings: false,
        can_manage_documents: false,
        can_view_billing: false,
        can_manage_billing: false,
        can_export_data: false,
        can_manage_users: false,
        can_manage_backups: false,
      }
    );

    setMessage("");
    setShowEdit(true);
  }

  function updateUserForm(field: keyof UserForm, value: string | boolean) {
    setUserForm((current) => ({ ...current, [field]: value }));
  }

  function updateInviteForm(field: keyof InviteForm, value: string) {
    setInviteForm((current) => ({ ...current, [field]: value }));
  }

  function updatePermission(
    field: keyof PermissionRecord,
    value: boolean
  ) {
    setPermissionForm((current) =>
      current ? { ...current, [field]: value } : current
    );
  }

  async function inviteUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!inviteForm.email.trim()) {
      setMessage("Inserisci l’email del nuovo utente.");
      return;
    }

    setSaving(true);
    setMessage("");

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setMessage("Sessione non valida.");
      setSaving(false);
      return;
    }

    const response = await fetch("/api/admin/invite-user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(inviteForm),
    });

    const result = await response.json();

    if (!response.ok) {
      setMessage(result.error || "Invito non riuscito.");
      setSaving(false);
      return;
    }

    setInviteForm(emptyInviteForm);
    setShowInvite(false);
    setMessage("Invito inviato correttamente.");

    setTimeout(() => {
      loadUsers();
    }, 1000);

    setSaving(false);
  }

  async function saveUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedUser || !permissionForm) return;

    setSaving(true);
    setMessage("");

    const profilePayload = {
      first_name: userForm.first_name.trim() || null,
      last_name: userForm.last_name.trim() || null,
      display_name:
        userForm.display_name.trim() ||
        `${userForm.first_name} ${userForm.last_name}`.trim() ||
        userForm.email,
      role: userForm.role,
      job_title: userForm.job_title.trim() || null,
      pec: userForm.pec.trim() || null,
      phone: userForm.phone.trim() || null,
      fiscal_code: userForm.fiscal_code.trim() || null,
      address: userForm.address.trim() || null,
      active: userForm.active,
    };

    const profileResult = await supabase
      .from("profiles")
      .update(profilePayload)
      .eq("id", selectedUser.id);

    if (profileResult.error) {
      setMessage(`Errore profilo: ${profileResult.error.message}`);
      setSaving(false);
      return;
    }

    const permissionPayload = {
      can_view_clients: permissionForm.can_view_clients,
      can_edit_clients: permissionForm.can_edit_clients,
      can_view_cases: permissionForm.can_view_cases,
      can_edit_cases: permissionForm.can_edit_cases,
      can_manage_deadlines: permissionForm.can_manage_deadlines,
      can_manage_hearings: permissionForm.can_manage_hearings,
      can_manage_documents: permissionForm.can_manage_documents,
      can_view_billing: permissionForm.can_view_billing,
      can_manage_billing: permissionForm.can_manage_billing,
      can_export_data: permissionForm.can_export_data,
      can_manage_users: permissionForm.can_manage_users,
      can_manage_backups: permissionForm.can_manage_backups,
    };

    const permissionResult = await supabase
      .from("user_permissions")
      .update(permissionPayload)
      .eq("user_id", selectedUser.id);

    if (permissionResult.error) {
      setMessage(`Errore permessi: ${permissionResult.error.message}`);
      setSaving(false);
      return;
    }

    await loadUsers();
    setShowEdit(false);
    setSelectedUser(null);
    setPermissionForm(null);
    setMessage("Utente aggiornato correttamente.");
    setSaving(false);
  }

  async function handleDeactivate(user: ProfileRecord) {
    setDeactivatingUserId(user.id);
    setMessage("");

    try {
      const {
        data: { user: authenticatedUser },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;

      if (!authenticatedUser) {
        setMessage("Utente non autenticato.");
        return;
      }

      if (authenticatedUser.id === user.id) {
        setMessage("Non puoi disattivare il tuo stesso account.");
        return;
      }

      const confirmed = window.confirm(
        "Vuoi disattivare questo utente? Non potrà più accedere e potrà essere ripristinato dal cestino."
      );

      if (!confirmed) return;

      const { error } = await supabase
        .from("profiles")
        .update({
          active: false,
          deleted_at: new Date().toISOString(),
          deleted_by: authenticatedUser.id,
          delete_reason: "Account disattivato dalla sezione Utenti",
        })
        .eq("id", user.id);

      if (error) throw error;

      await loadUsers();
      setMessage("Utente disattivato correttamente.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `Errore: ${error.message}`
          : "Errore durante la disattivazione dell’utente."
      );
    } finally {
      setDeactivatingUserId(null);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-8">
        Caricamento utenti...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-xl font-semibold">Utenti dello studio</h3>
            <p className="mt-1 text-sm text-neutral-500">
              Schede personali, ruoli e permessi di accesso.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setInviteForm(emptyInviteForm);
              setMessage("");
              setShowInvite(true);
            }}
            className="rounded-xl bg-neutral-900 px-4 py-3 text-sm text-white"
          >
            Aggiungi utente
          </button>
        </div>

        {message && <p className="mt-4 text-sm">{message}</p>}
      </section>

      <section className="grid gap-4">
        {profiles.map((user) => {
          const permission = permissions.find(
            (item) => item.user_id === user.id
          );

          return (
            <article
              key={user.id}
              className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-lg font-semibold">
                      {getUserName(user)}
                    </h4>

                    <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs capitalize">
                      {user.role.replaceAll("_", " ")}
                    </span>

                    {!user.active && (
                      <span className="rounded-full bg-red-100 px-3 py-1 text-xs text-red-700">
                        Disattivato
                      </span>
                    )}
                  </div>

                  <p className="mt-2 text-sm text-neutral-500">
                    {user.email || "Email non indicata"}
                  </p>

                  <p className="mt-1 text-sm text-neutral-500">
                    {user.job_title || "Qualifica non indicata"}
                  </p>

                  <p className="mt-3 text-xs text-neutral-500">
                    Permessi attivi:{" "}
                    {permission
                      ? countEnabledPermissions(permission)
                      : 0}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(user)}
                    className="rounded-xl border border-neutral-300 px-4 py-2 text-sm"
                  >
                    Modifica accessi
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeactivate(user)}
                    disabled={deactivatingUserId === user.id}
                    className="rounded-xl bg-red-600 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {deactivatingUserId === user.id
                      ? "Disattivazione..."
                      : "Disattiva"}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      {showInvite && (
        <InviteModal
          form={inviteForm}
          saving={saving}
          message={message}
          onChange={updateInviteForm}
          onSubmit={inviteUser}
          onClose={() => {
            setShowInvite(false);
            setInviteForm(emptyInviteForm);
            setMessage("");
          }}
        />
      )}

      {showEdit && selectedUser && permissionForm && (
        <EditUserModal
          form={userForm}
          permissions={permissionForm}
          saving={saving}
          message={message}
          onUserChange={updateUserForm}
          onPermissionChange={updatePermission}
          onSubmit={saveUser}
          onClose={() => {
            setShowEdit(false);
            setSelectedUser(null);
            setPermissionForm(null);
            setMessage("");
          }}
        />
      )}
    </div>
  );
}

function InviteModal({
  form,
  saving,
  message,
  onChange,
  onSubmit,
  onClose,
}: {
  form: InviteForm;
  saving: boolean;
  message: string;
  onChange: (field: keyof InviteForm, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl"
      >
        <ModalHeader title="Invita nuovo utente" onClose={onClose} />

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Input
            label="Nome"
            value={form.first_name}
            onChange={(value) => onChange("first_name", value)}
          />
          <Input
            label="Cognome"
            value={form.last_name}
            onChange={(value) => onChange("last_name", value)}
          />
          <Input
            label="Nome visualizzato"
            value={form.display_name}
            onChange={(value) => onChange("display_name", value)}
          />
          <Input
            label="Email *"
            type="email"
            value={form.email}
            onChange={(value) => onChange("email", value)}
          />
          <Select
            label="Ruolo iniziale"
            value={form.role}
            onChange={(value) => onChange("role", value)}
            options={[
              ["admin", "Amministratore"],
              ["lawyer", "Avvocato"],
              ["secretary", "Segreteria"],
              ["collaborator", "Collaboratore"],
              ["custom", "Personalizzato"],
            ]}
          />
        </div>

        <p className="mt-5 text-sm text-neutral-500">
          L’utente riceverà un’email per impostare la propria password.
        </p>

        <ModalFooter saving={saving} message={message} onClose={onClose} />
      </form>
    </div>
  );
}

function EditUserModal({
  form,
  permissions,
  saving,
  message,
  onUserChange,
  onPermissionChange,
  onSubmit,
  onClose,
}: {
  form: UserForm;
  permissions: PermissionRecord;
  saving: boolean;
  message: string;
  onUserChange: (field: keyof UserForm, value: string | boolean) => void;
  onPermissionChange: (
    field: keyof PermissionRecord,
    value: boolean
  ) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 px-4 py-8">
      <form
        onSubmit={onSubmit}
        className="mx-auto w-full max-w-5xl rounded-2xl bg-white p-6 shadow-2xl"
      >
        <ModalHeader title="Scheda utente e accessi" onClose={onClose} />

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Input
            label="Nome"
            value={form.first_name}
            onChange={(value) => onUserChange("first_name", value)}
          />
          <Input
            label="Cognome"
            value={form.last_name}
            onChange={(value) => onUserChange("last_name", value)}
          />
          <Input
            label="Nome visualizzato"
            value={form.display_name}
            onChange={(value) => onUserChange("display_name", value)}
          />
          <Input
            label="Email"
            value={form.email}
            disabled
            onChange={() => undefined}
          />
          <Select
            label="Ruolo"
            value={form.role}
            onChange={(value) => onUserChange("role", value)}
            options={[
              ["admin", "Amministratore"],
              ["lawyer", "Avvocato"],
              ["secretary", "Segreteria"],
              ["collaborator", "Collaboratore"],
              ["custom", "Personalizzato"],
            ]}
          />
          <Input
            label="Qualifica"
            value={form.job_title}
            onChange={(value) => onUserChange("job_title", value)}
          />
          <Input
            label="PEC"
            value={form.pec}
            onChange={(value) => onUserChange("pec", value)}
          />
          <Input
            label="Telefono"
            value={form.phone}
            onChange={(value) => onUserChange("phone", value)}
          />
          <Input
            label="Codice fiscale"
            value={form.fiscal_code}
            onChange={(value) => onUserChange("fiscal_code", value)}
          />
          <Input
            label="Indirizzo"
            value={form.address}
            onChange={(value) => onUserChange("address", value)}
          />

          <label className="flex items-center gap-3 rounded-xl border border-neutral-300 px-4 py-3">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) =>
                onUserChange("active", event.target.checked)
              }
            />
            Utente attivo
          </label>
        </div>

        <div className="mt-8">
          <h4 className="text-lg font-semibold">Permessi</h4>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {permissionLabels.map(([key, label]) => (
              <label
                key={key}
                className="flex items-center gap-3 rounded-xl border border-neutral-300 px-4 py-3 text-sm"
              >
                <input
                  type="checkbox"
                  checked={Boolean(permissions[key])}
                  onChange={(event) =>
                    onPermissionChange(key, event.target.checked)
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <ModalFooter saving={saving} message={message} onClose={onClose} />
      </form>
    </div>
  );
}

function ModalHeader({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <h3 className="text-xl font-semibold">{title}</h3>
      <button
        type="button"
        onClick={onClose}
        className="rounded-xl border border-neutral-300 px-3 py-2 text-sm"
      >
        Chiudi
      </button>
    </div>
  );
}

function ModalFooter({
  saving,
  message,
  onClose,
}: {
  saving: boolean;
  message: string;
  onClose: () => void;
}) {
  return (
    <>
      {message && <p className="mt-5 text-sm">{message}</p>}

      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-neutral-300 px-5 py-3 text-sm"
        >
          Annulla
        </button>

        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-neutral-900 px-5 py-3 text-sm text-white disabled:opacity-50"
        >
          {saving ? "Salvataggio..." : "Salva"}
        </button>
      </div>
    </>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-neutral-500">{label}</span>
      <input
        type={type}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-neutral-300 px-4 py-3 disabled:bg-neutral-100"
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[][];
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-neutral-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={`${optionValue}-${optionLabel}`} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function getUserName(user: ProfileRecord) {
  return (
    user.display_name ||
    [user.first_name, user.last_name].filter(Boolean).join(" ") ||
    user.email ||
    "Utente"
  );
}

function countEnabledPermissions(permission: PermissionRecord) {
  return permissionLabels.filter(([key]) => Boolean(permission[key])).length;
}
