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

    const email = String(body.email ?? "").trim().toLowerCase();
    const firstName = String(body.first_name ?? "").trim();
    const lastName = String(body.last_name ?? "").trim();
    const role = String(body.role ?? "collaborator").trim();
    const displayName =
      String(body.display_name ?? "").trim() ||
      `${firstName} ${lastName}`.trim() ||
      email;

    if (!email) {
      return NextResponse.json(
        { error: "L'indirizzo email è obbligatorio." },
        { status: 400 }
      );
    }

    const allowedRoles = [
      "admin",
      "lawyer",
      "secretary",
      "collaborator",
      "custom",
    ];

    if (!allowedRoles.includes(role)) {
      return NextResponse.json(
        { error: "Ruolo non valido." },
        { status: 400 }
      );
    }

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

    const { data: invitation, error: invitationError } =
      await adminClient.auth.admin.inviteUserByEmail(email, {
        redirectTo: appUrl,
        data: {
          first_name: firstName,
          last_name: lastName,
          display_name: displayName,
          role,
          studio_id: requestingProfile.studio_id,
        },
      });

    if (invitationError) {
      return NextResponse.json(
        { error: invitationError.message },
        { status: 400 }
      );
    }

    if (invitation.user) {
      const { error: updateError } = await adminClient
        .from("profiles")
        .update({
          studio_id: requestingProfile.studio_id,
          first_name: firstName || null,
          last_name: lastName || null,
          display_name: displayName,
          email,
          role,
          active: true,
        })
        .eq("id", invitation.user.id);

      if (updateError) {
        return NextResponse.json(
          {
            error:
              "Invito inviato, ma il profilo non è stato aggiornato: " +
              updateError.message,
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: "Invito inviato correttamente.",
      user_id: invitation.user?.id ?? null,
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