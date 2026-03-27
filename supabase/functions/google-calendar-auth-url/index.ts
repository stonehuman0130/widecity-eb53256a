import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const encodeState = (payload: { user_id: string; group_id: string }) =>
  btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

  if (!GOOGLE_CLIENT_ID || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const token = authHeader.replace("Bearer ", "");
  const {
    data: { user },
    error: userError,
  } = await supabaseUser.auth.getUser(token);

  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let groupId: string | undefined;
  try {
    const body = await req.json();
    groupId = body?.group_id;
  } catch {
    // no-op
  }

  if (!groupId) {
    return new Response(JSON.stringify({ error: "Missing group_id" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: membership } = await supabaseUser
    .from("group_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("group_id", groupId)
    .maybeSingle();

  if (!membership) {
    return new Response(JSON.stringify({ error: "You are not a member of this group" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const redirectUri = `${SUPABASE_URL}/functions/v1/google-calendar-callback`;
  const scope = "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events";
  const state = encodeState({ user_id: user.id, group_id: groupId });

  const authUrl =
    `https://accounts.google.com/o/oauth2/v2/auth?` +
    new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      scope,
      access_type: "offline",
      prompt: "consent select_account",
      state,
    }).toString();

  return new Response(JSON.stringify({ url: authUrl }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});