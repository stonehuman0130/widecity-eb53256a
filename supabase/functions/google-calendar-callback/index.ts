import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const decodeState = (state: string): { user_id: string; group_id: string } | null => {
  try {
    const normalized = state.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");

  if (!code || !stateRaw) {
    return new Response("Missing code or state", { status: 400, headers: corsHeaders });
  }

  const state = decodeState(stateRaw);
  if (!state?.user_id || !state?.group_id) {
    return new Response("Invalid state", { status: 400, headers: corsHeaders });
  }

  const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
  const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response("Server misconfigured", { status: 500, headers: corsHeaders });
  }

  const redirectUri = `${SUPABASE_URL}/functions/v1/google-calendar-callback`;

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      console.error("Token exchange failed:", tokenData);
      return new Response(`Token exchange failed: ${tokenData.error_description || tokenData.error}`, {
        status: 400,
        headers: corsHeaders,
      });
    }

    const { access_token, refresh_token, expires_in } = tokenData;
    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: existing } = await supabase
      .from("google_calendar_tokens")
      .select("refresh_token")
      .eq("user_id", state.user_id)
      .eq("group_id", state.group_id)
      .maybeSingle();

    const finalRefreshToken = refresh_token || existing?.refresh_token;
    if (!finalRefreshToken) {
      return new Response("Missing refresh token from Google", { status: 400, headers: corsHeaders });
    }

    const { error } = await supabase
      .from("google_calendar_tokens")
      .upsert(
        {
          user_id: state.user_id,
          group_id: state.group_id,
          access_token,
          refresh_token: finalRefreshToken,
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,group_id" }
      );

    if (error) {
      console.error("DB upsert error:", error);
      return new Response("Failed to store tokens", { status: 500, headers: corsHeaders });
    }

    const appUrl = req.headers.get("origin") || "https://widecity.lovable.app";
    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        Location: `${appUrl}/?tab=settings&gcal=connected&group=${state.group_id}`,
      },
    });
  } catch (err) {
    console.error("Callback error:", err);
    return new Response("Internal error", { status: 500, headers: corsHeaders });
  }
});