import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Configurazione di autenticazione incompleta." },
        { status: 500 }
      );
    }

    const body = await request.json();
    const username = normalizeUsername(String(body.username ?? ""));
    const password = String(body.password ?? "");

    if (!username || !password) {
      return invalidCredentials();
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: profile } = await adminClient
      .from("profiles")
      .select("id, active, deleted_at")
      .ilike("username", username)
      .maybeSingle();

    if (!profile || !profile.active || profile.deleted_at) {
      return invalidCredentials();
    }

    const { data: authUser, error: authUserError } =
      await adminClient.auth.admin.getUserById(profile.id);

    if (authUserError || !authUser.user?.email) {
      return invalidCredentials();
    }

    const authClient = createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await authClient.auth.signInWithPassword({
      email: authUser.user.email,
      password,
    });

    if (error || !data.session) {
      return invalidCredentials();
    }

    return NextResponse.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
  } catch {
    return invalidCredentials();
  }
}

function normalizeUsername(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ".");
}

function invalidCredentials() {
  return NextResponse.json(
    { error: "Username o password non corretti." },
    { status: 401 }
  );
}
