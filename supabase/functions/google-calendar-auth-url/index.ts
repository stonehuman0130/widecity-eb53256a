const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");

  if (!GOOGLE_CLIENT_ID || !SUPABASE_URL) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Get user_id from request body
  const { user_id } = await req.json();
  if (!user_id) {
    return new Response(JSON.stringify({ error: "Missing user_id" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const redirectUri = `${SUPABASE_URL}/functions/v1/google-calendar-callback`;
  const scope = "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events";

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      scope,
      access_type: "offline",
      prompt: "consent",
      state: user_id,
    }).toString();

  return new Response(JSON.stringify({ url: authUrl }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
