import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Configurazione Supabase incompleta sul server Vercel." },
        { status: 500 }
      );
    }

    const authorization = request.headers.get("authorization");
    const accessToken = authorization?.replace(/^Bearer\s+/i, "");

    if (!accessToken) {
      return NextResponse.json(
        { error: "Autenticazione mancante." },
        { status: 401 }
      );
    }

    const userClient = createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user: requestingUser },
      error: requestingUserError,
    } = await userClient.auth.getUser(accessToken);

    if (requestingUserError || !requestingUser) {
      return NextResponse.json(
        { error: "Sessione non valida." },
        { status: 401 }
      );
    }

    const { data: requestingProfile, error: profileError } =
      await adminClient
        .from("profiles")
        .select("studio_id, role, active")
        .eq("id", requestingUser.id)
        .single();

    if (
      profileError ||
      !requestingProfile ||
      requestingProfile.role !== "admin" ||
      !requestingProfile.active
    ) {
      return NextResponse.json(
        {
          error:
            "Operazione consentita soltanto a un amministratore attivo.",
        },
        { status: 403 }
      );
    }

    const body = await request.json();

    const username = normalizeUsername(String(body.username ?? ""));
    const password = String(body.password ?? "");
    const contactEmail = String(body.email ?? "").trim().toLowerCase();
    const firstName = String(body.first_name ?? "").trim();
    const lastName = String(body.last_name ?? "").trim();
    const role = String(body.role ?? "external_collaborator").trim();
    const displayName =
      String(body.display_name ?? "").trim() ||
      `${firstName} ${lastName}`.trim() ||
      username;

    if (!username || !/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username)) {
      return NextResponse.json(
        {
          error:
            "Lo username deve contenere da 3 a 40 caratteri: lettere, numeri, punto, trattino o underscore.",
        },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "La password deve contenere almeno 8 caratteri." },
        { status: 400 }
      );
    }

    if (!displayName) {
      return NextResponse.json(
        { error: "Il nickname è obbligatorio." },
        { status: 400 }
      );
    }

    const allowedRoles = [
      "lawyer",
      "secretary",
      "trainee",
      "external_collaborator",
    ];

    if (!allowedRoles.includes(role)) {
      return NextResponse.json(
        { error: "Ruolo non valido." },
        { status: 400 }
      );
    }

    const authEmail = `${username}@auth.zazadellali.local`;
    const permissions =
      body.permissions && typeof body.permissions === "object"
        ? body.permissions
        : {};

    const { data: createdUser, error: creationError } =
      await adminClient.auth.admin.createUser({
        email: authEmail,
        password,
        email_confirm: true,
        user_metadata: {
          username,
          contact_email: contactEmail || null,
          first_name: firstName,
          last_name: lastName,
          display_name: displayName,
          role,
          studio_id: requestingProfile.studio_id,
        },
      });

    if (creationError) {
      return NextResponse.json(
        { error: creationError.message },
        { status: 400 }
      );
    }

    if (createdUser.user) {
      const { error: updateError } = await adminClient
        .from("profiles")
        .update({
          studio_id: requestingProfile.studio_id,
          username,
          first_name: firstName || null,
          last_name: lastName || null,
          display_name: displayName,
          email: contactEmail || null,
          role,
          active: true,
        })
        .eq("id", createdUser.user.id);

      if (updateError) {
        await adminClient.auth.admin.deleteUser(createdUser.user.id);
        return NextResponse.json(
          {
            error:
              "L’utente non è stato creato perché il profilo non è stato aggiornato: " +
              updateError.message,
          },
          { status: 500 }
        );
      }

      const permissionPayload = buildPermissionPayload(permissions);
      const { error: permissionError } = await adminClient
        .from("user_permissions")
        .upsert(
          {
            user_id: createdUser.user.id,
            ...permissionPayload,
          },
          { onConflict: "user_id" }
        );

      if (permissionError) {
        await adminClient.auth.admin.deleteUser(createdUser.user.id);
        return NextResponse.json(
          {
            error:
              "L’utente non è stato creato perché i permessi non sono stati salvati: " +
              permissionError.message,
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: "Utente creato correttamente.",
      user_id: createdUser.user?.id ?? null,
      username,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Errore imprevisto durante l'invito.",
      },
      { status: 500 }
    );
  }
}

function normalizeUsername(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ".");
}

const permissionNames = [
  "can_view_clients",
  "can_edit_clients",
  "can_view_cases",
  "can_edit_cases",
  "can_manage_deadlines",
  "can_manage_hearings",
  "can_manage_documents",
  "can_view_billing",
  "can_manage_billing",
  "can_export_data",
  "can_manage_users",
  "can_manage_backups",
  "can_manage_counterparties",
  "can_manage_case_activities",
  "can_manage_payments",
  "can_delete_clients",
  "can_delete_cases",
  "can_delete_counterparties",
  "can_delete_events",
  "can_restore_trash",
  "can_permanently_delete",
  "can_configure_backups",
  "can_run_backups",
  "can_restore_backups",
  "can_view_audit_log",
] as const;

function buildPermissionPayload(value: Record<string, unknown>) {
  return Object.fromEntries(
    permissionNames.map((permission) => [
      permission,
      value[permission] === true,
    ])
  );
}
