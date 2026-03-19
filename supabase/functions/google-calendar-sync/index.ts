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
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
  
  if (userError || !user) {
    console.error("Auth error:", userError?.message);
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = supabaseAdmin;

  // Parse request params
  const url = new URL(req.url);
  const groupId = url.searchParams.get("groupId");
  const allGroups = url.searchParams.get("allGroups") === "true";
  const timeMin = url.searchParams.get("timeMin") || new Date().toISOString();
  const timeMax = url.searchParams.get("timeMax") || new Date(Date.now() + 30 * 86400000).toISOString();

  if (!groupId && !allGroups) {
    return new Response(JSON.stringify({ error: "Missing groupId or allGroups" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Fetch token rows — either one group or all groups
  let tokenRows: any[] = [];
  if (allGroups) {
    const { data, error: tokenErr } = await supabase
      .from("google_calendar_tokens")
      .select("*")
      .eq("user_id", user.id);
    if (!tokenErr && data) tokenRows = data;
  } else {
    const { data, error: tokenErr } = await supabase
      .from("google_calendar_tokens")
      .select("*")
      .eq("user_id", user.id)
      .eq("group_id", groupId!)
      .maybeSingle();
    if (!tokenErr && data) tokenRows = [data];
  }

  if (tokenRows.length === 0) {
    return new Response(JSON.stringify({ events: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Deduplicate by refresh_token to avoid fetching same Google account twice
  const seenRefreshTokens = new Set<string>();
  const uniqueTokenRows: any[] = [];
  for (const row of tokenRows) {
    if (!seenRefreshTokens.has(row.refresh_token)) {
      seenRefreshTokens.add(row.refresh_token);
      uniqueTokenRows.push(row);
    }
  }

  const allEvents: any[] = [];
  const seenEventIds = new Set<string>();

  for (const tokenRow of uniqueTokenRows) {
    let accessToken = tokenRow.access_token;

    // Refresh if expired
    if (new Date(tokenRow.expires_at) <= new Date()) {
      const refreshed = await refreshAccessToken(tokenRow.refresh_token);
      if (!refreshed) continue;

      accessToken = refreshed.access_token;
      const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

      await supabase
        .from("google_calendar_tokens")
        .update({ access_token: accessToken, expires_at: newExpiry, updated_at: new Date().toISOString() })
        .eq("id", tokenRow.id);
    }

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
        console.error("Google Calendar API error for group", tokenRow.group_id, ":", await calRes.text());
        continue;
      }

      const calData = await calRes.json();

      for (const item of (calData.items || [])) {
        if (seenEventIds.has(item.id)) continue;
        seenEventIds.add(item.id);
        allEvents.push({
          id: item.id,
          title: item.summary || "(No title)",
          description: item.description || null,
          start: item.start?.dateTime || item.start?.date,
          end: item.end?.dateTime || item.end?.date,
          allDay: !item.start?.dateTime,
          location: item.location || null,
          htmlLink: item.htmlLink,
        });
      }
    } catch (err) {
      console.error("Sync error for group", tokenRow.group_id, ":", err);
    }
  }

  return new Response(JSON.stringify({ events: allEvents }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
