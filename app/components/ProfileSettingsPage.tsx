"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type ProfileForm = {
  username: string;
  display_name: string;
  email: string;
  phone: string;
};

export default function ProfileSettingsPage({
  onProfileChanged,
}: {
  onProfileChanged: () => Promise<void>;
}) {
  const [form, setForm] = useState<ProfileForm>({
    username: "",
    display_name: "",
    email: "",
    phone: "",
  });
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("profiles")
        .select("username, display_name, email, phone")
        .eq("id", user.id)
        .single();

      if (error) {
        setMessage(`Errore: ${error.message}`);
        return;
      }

      setForm({
        username: data.username ?? "",
        display_name: data.display_name ?? "",
        email: data.email ?? "",
        phone: data.phone ?? "",
      });
    }

    void loadProfile();
  }, []);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.display_name.trim()) {
      setMessage("Il nickname è obbligatorio.");
      return;
    }

    setSaving(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage("Sessione non valida.");
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: form.display_name.trim(),
        email: form.email.trim().toLowerCase() || null,
        phone: form.phone.trim() || null,
      })
      .eq("id", user.id);

    if (error) {
      setMessage(`Errore: ${error.message}`);
    } else {
      await onProfileChanged();
      setMessage("Profilo aggiornato correttamente.");
    }
    setSaving(false);
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (newPassword.length < 8) {
      setMessage("La nuova password deve contenere almeno 8 caratteri.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage("Le nuove password non coincidono.");
      return;
    }

    setSaving(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      setMessage("Impossibile identificare l’account.");
      setSaving(false);
      return;
    }

    const { error: verificationError } =
      await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

    if (verificationError) {
      setMessage("La password attuale non è corretta.");
      setSaving(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      setMessage(`Errore: ${error.message}`);
    } else {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Password modificata correttamente.");
    }
    setSaving(false);
  }

  function update(field: keyof ProfileForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <form
        onSubmit={saveProfile}
        className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
      >
        <h3 className="text-xl font-semibold">Profilo personale</h3>
        <p className="mt-1 text-sm text-neutral-500">
          Il nickname sarà utilizzato in tutta l’app e nel registro attività.
        </p>
        <div className="mt-6 space-y-4">
          <ProfileInput label="Username" value={form.username} disabled />
          <ProfileInput
            label="Nickname *"
            value={form.display_name}
            onChange={(value) => update("display_name", value)}
          />
          <ProfileInput
            label="Email di contatto"
            type="email"
            value={form.email}
            onChange={(value) => update("email", value)}
          />
          <ProfileInput
            label="Telefono"
            value={form.phone}
            onChange={(value) => update("phone", value)}
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="mt-6 rounded-xl bg-neutral-900 px-5 py-3 text-sm text-white disabled:opacity-50"
        >
          Salva profilo
        </button>
      </form>

      <form
        onSubmit={changePassword}
        className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
      >
        <h3 className="text-xl font-semibold">Modifica password</h3>
        <p className="mt-1 text-sm text-neutral-500">
          Lo username non cambia quando modifichi la password.
        </p>
        <div className="mt-6 space-y-4">
          <ProfileInput
            label="Password attuale"
            type="password"
            value={currentPassword}
            onChange={setCurrentPassword}
          />
          <ProfileInput
            label="Nuova password"
            type="password"
            value={newPassword}
            onChange={setNewPassword}
          />
          <ProfileInput
            label="Conferma nuova password"
            type="password"
            value={confirmPassword}
            onChange={setConfirmPassword}
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="mt-6 rounded-xl bg-neutral-900 px-5 py-3 text-sm text-white disabled:opacity-50"
        >
          Cambia password
        </button>
      </form>

      {message && (
        <p className="rounded-xl border border-neutral-200 bg-white p-4 text-sm xl:col-span-2">
          {message}
        </p>
      )}
    </div>
  );
}

function ProfileInput({
  label,
  value,
  onChange,
  type = "text",
  disabled = false,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
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
        onChange={(event) => onChange?.(event.target.value)}
        className="w-full rounded-xl border border-neutral-300 px-4 py-3 disabled:bg-neutral-100"
      />
    </label>
  );
}
