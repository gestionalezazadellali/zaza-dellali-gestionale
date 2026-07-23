import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const allowedResources = [
  "case",
  "client",
  "counterparty",
  "event",
  "user",
] as const;

type TrashResource = (typeof allowedResources)[number];

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

    const accessToken = request.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "");

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

    async function deleteOne(table: string, id: number, studioId: string) {
      const { data, error } = await adminClient
        .from(table)
        .delete()
        .eq("id", id)
        .eq("studio_id", studioId)
        .not("deleted_at", "is", null)
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error("Elemento non presente nel cestino.");
    }

    const {
      data: { user: requestingUser },
      error: userError,
    } = await userClient.auth.getUser(accessToken);

    if (userError || !requestingUser) {
      return NextResponse.json(
        { error: "Sessione non valida." },
        { status: 401 }
      );
    }

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("studio_id, role, active, deleted_at")
      .eq("id", requestingUser.id)
      .single();

    if (
      profileError ||
      !profile ||
      profile.role !== "admin" ||
      !profile.active ||
      profile.deleted_at
    ) {
      return NextResponse.json(
        { error: "Operazione consentita soltanto agli amministratori attivi." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const resource = String(body.resource ?? "") as TrashResource;
    const rawId = body.id;

    if (!allowedResources.includes(resource)) {
      return NextResponse.json(
        { error: "Tipo di elemento non valido." },
        { status: 400 }
      );
    }

    if (resource === "user") {
      const userId = String(rawId ?? "");

      if (!userId || userId === requestingUser.id) {
        return NextResponse.json(
          { error: "Non puoi eliminare definitivamente il tuo account." },
          { status: 400 }
        );
      }

      const { data: targetProfile } = await adminClient
        .from("profiles")
        .select("id")
        .eq("id", userId)
        .eq("studio_id", profile.studio_id)
        .not("deleted_at", "is", null)
        .maybeSingle();

      if (!targetProfile) {
        return NextResponse.json(
          { error: "Utente non presente nel cestino." },
          { status: 404 }
        );
      }

      const { error } = await adminClient.auth.admin.deleteUser(userId);
      if (error) throw error;

      return NextResponse.json({
        success: true,
        message: "Utente eliminato definitivamente.",
      });
    }

    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return NextResponse.json(
        { error: "Identificativo non valido." },
        { status: 400 }
      );
    }

    if (resource === "event") {
      await deleteOne("events", id, profile.studio_id);
    } else if (resource === "client") {
      const { count, error: linkedError } = await adminClient
        .from("cases")
        .select("*", { count: "exact", head: true })
        .eq("studio_id", profile.studio_id)
        .eq("client_contact_id", id);

      if (linkedError) throw linkedError;
      if ((count ?? 0) > 0) {
        return NextResponse.json(
          {
            error:
              "Il cliente è collegato a una o più pratiche. Elimina prima le pratiche collegate.",
          },
          { status: 409 }
        );
      }

      await deleteOne("contacts", id, profile.studio_id);
    } else if (resource === "counterparty") {
      const [{ count: directCases, error: directError }, { count: links, error: linkError }] =
        await Promise.all([
          adminClient
            .from("cases")
            .select("*", { count: "exact", head: true })
            .eq("studio_id", profile.studio_id)
            .eq("counterparty_id", id),
          adminClient
            .from("case_counterparties")
            .select("*", { count: "exact", head: true })
            .eq("studio_id", profile.studio_id)
            .eq("counterparty_id", id),
        ]);

      if (directError) throw directError;
      if (linkError) throw linkError;
      if ((directCases ?? 0) > 0 || (links ?? 0) > 0) {
        return NextResponse.json(
          {
            error:
              "La controparte è collegata a una o più pratiche. Rimuovi prima i collegamenti.",
          },
          { status: 409 }
        );
      }

      await deleteOne("counterparties", id, profile.studio_id);
    } else if (resource === "case") {
      const { data: invoices, error: invoicesReadError } = await adminClient
        .from("invoices")
        .select("id")
        .eq("studio_id", profile.studio_id)
        .eq("case_id", id);
      if (invoicesReadError) throw invoicesReadError;

      const invoiceIds = (invoices ?? []).map((invoice) => invoice.id);
      if (invoiceIds.length > 0) {
        const { error: paymentsError } = await adminClient
          .from("payments")
          .delete()
          .eq("studio_id", profile.studio_id)
          .in("invoice_id", invoiceIds);
        if (paymentsError) throw paymentsError;
      }

      const { data: titles, error: titlesReadError } = await adminClient
        .from("case_titles")
        .select("id")
        .eq("studio_id", profile.studio_id)
        .eq("case_id", id);
      if (titlesReadError) throw titlesReadError;

      const titleIds = (titles ?? []).map((title) => title.id);
      if (titleIds.length > 0) {
        const { error: titleActionsError } = await adminClient
          .from("enforcement_actions")
          .delete()
          .eq("studio_id", profile.studio_id)
          .in("case_title_id", titleIds);
        if (titleActionsError) throw titleActionsError;
      }

      const { error: relatedActionsError } = await adminClient
        .from("enforcement_actions")
        .delete()
        .eq("studio_id", profile.studio_id)
        .eq("related_case_id", id);
      if (relatedActionsError) throw relatedActionsError;

      const { data: caseEvents, error: eventsReadError } = await adminClient
        .from("events")
        .select("id")
        .eq("studio_id", profile.studio_id)
        .eq("case_id", id);
      if (eventsReadError) throw eventsReadError;

      const eventIds = (caseEvents ?? []).map((event) => event.id);
      if (eventIds.length > 0) {
        const { error: hearingUpdatesError } = await adminClient
          .from("hearing_updates")
          .delete()
          .eq("studio_id", profile.studio_id)
          .in("event_id", eventIds);
        if (hearingUpdatesError) throw hearingUpdatesError;
      }

      const tables = [
        "invoices",
        "case_titles",
        "case_activities",
        "events",
        "case_documents",
        "case_counterparties",
      ];

      for (const table of tables) {
        const { error } = await adminClient
          .from(table)
          .delete()
          .eq("studio_id", profile.studio_id)
          .eq("case_id", id);
        if (error) throw error;
      }

      await deleteOne("cases", id, profile.studio_id);
    }

    return NextResponse.json({
      success: true,
      message: "Elemento eliminato definitivamente.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Errore durante l’eliminazione definitiva.",
      },
      { status: 500 }
    );
  }
}
