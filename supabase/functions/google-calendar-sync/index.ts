import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
  const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
  const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    console.error("Token refresh failed:", await res.text());
    return null;
  }

  return await res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Get user from JWT
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = authHeader.replace("Bearer ", "");
  const supabaseUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userError } = await supabaseUser.auth.getUser(token);
  
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Get stored tokens
  const { data: tokenRow, error: tokenErr } = await supabase
    .from("google_calendar_tokens")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (tokenErr || !tokenRow) {
    return new Response(JSON.stringify({ error: "Google Calendar not connected" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let accessToken = tokenRow.access_token;

  // Refresh if expired
  if (new Date(tokenRow.expires_at) <= new Date()) {
    const refreshed = await refreshAccessToken(tokenRow.refresh_token);
    if (!refreshed) {
      return new Response(JSON.stringify({ error: "Failed to refresh token. Please reconnect Google Calendar." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    accessToken = refreshed.access_token;
    const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

    await supabase
      .from("google_calendar_tokens")
      .update({ access_token: accessToken, expires_at: newExpiry, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);
  }

  // Parse date range from query params
  const url = new URL(req.url);
  const timeMin = url.searchParams.get("timeMin") || new Date().toISOString();
  const timeMax = url.searchParams.get("timeMax") || new Date(Date.now() + 30 * 86400000).toISOString();

  try {
    const calRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
        new URLSearchParams({
          timeMin,
          timeMax,
          singleEvents: "true",
          orderBy: "startTime",
          maxResults: "250",
        }),
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!calRes.ok) {
      const errText = await calRes.text();
      console.error("Google Calendar API error:", errText);
      return new Response(JSON.stringify({ error: "Failed to fetch calendar events" }), {
        status: calRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const calData = await calRes.json();

    // Map to simplified format
    const events = (calData.items || []).map((item: any) => ({
      id: item.id,
      title: item.summary || "(No title)",
      description: item.description || null,
      start: item.start?.dateTime || item.start?.date,
      end: item.end?.dateTime || item.end?.date,
      allDay: !item.start?.dateTime,
      location: item.location || null,
      htmlLink: item.htmlLink,
    }));

    return new Response(JSON.stringify({ events }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Sync error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
