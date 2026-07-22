import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  createCompleteBackup,
  projectRefFromUrl,
} from "../../../../lib/backup";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Configurazione Supabase incompleta sul server." },
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
      data: { user },
      error: userError,
    } = await userClient.auth.getUser(accessToken);
    if (userError || !user) {
      return NextResponse.json(
        { error: "Sessione non valida." },
        { status: 401 }
      );
    }

    const body = (await request.json()) as { studio_id?: unknown };
    const studioId = String(body.studio_id ?? "").trim();

    const [{ data: profile, error: profileError }, permissionResult] =
      await Promise.all([
        adminClient
          .from("profiles")
          .select("studio_id, role, active, deleted_at")
          .eq("id", user.id)
          .single(),
        adminClient
          .from("user_permissions")
          .select("can_manage_backups")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

    if (
      profileError ||
      !profile ||
      !profile.active ||
      profile.deleted_at ||
      !studioId ||
      profile.studio_id !== studioId
    ) {
      return NextResponse.json(
        { error: "Profilo non autorizzato per questo studio." },
        { status: 403 }
      );
    }

    const canManageBackups =
      profile.role === "admin" ||
      permissionResult.data?.can_manage_backups === true;
    if (permissionResult.error || !canManageBackups) {
      return NextResponse.json(
        { error: "Permesso di gestione backup mancante." },
        { status: 403 }
      );
    }

    const bundle = await createCompleteBackup(adminClient, {
      studioId,
      projectRef: projectRefFromUrl(supabaseUrl),
    });

    return NextResponse.json({
      success: true,
      fileName: bundle.fileName,
      content: bundle.content,
      sha256: bundle.sha256,
      sha256Content: bundle.sha256Content,
      manifestFileName: bundle.manifestFileName,
      manifestContent: bundle.manifestContent,
      integrityReportFileName: bundle.integrityReportFileName,
      integrityReportContent: bundle.integrityReportContent,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Errore imprevisto durante il backup.",
      },
      { status: 500 }
    );
  }
}
