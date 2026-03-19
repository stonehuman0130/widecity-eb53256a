import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Assignee = "me" | "partner" | "both";

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

function toViewerPerspective(assignee: Assignee, isOwnerView: boolean): Assignee {
  if (isOwnerView) return assignee;
  if (assignee === "me") return "partner";
  if (assignee === "partner") return "me";
  return "both";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Get user from JWT
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = authHeader.replace("Bearer ", "");
  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);

  if (claimsError || !claimsData?.claims?.sub) {
    console.error("Auth error:", claimsError?.message);
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userId = claimsData.claims.sub as string;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Parse request params
  const url = new URL(req.url);
  const groupId = url.searchParams.get("groupId");
  const allGroups = url.searchParams.get("allGroups") === "true";
  const groupShared = url.searchParams.get("groupShared") === "true";
  const timeMin = url.searchParams.get("timeMin") || new Date().toISOString();
  const timeMax = url.searchParams.get("timeMax") || new Date(Date.now() + 30 * 86400000).toISOString();

  if (!groupId && !allGroups) {
    return new Response(JSON.stringify({ error: "Missing groupId or allGroups" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Fetch token rows
  let tokenRows: any[] = [];

  if (allGroups) {
    // "All" mode: fetch tokens from the user AND from all groups the user belongs to
    const { data: userTokens } = await supabase
      .from("google_calendar_tokens")
      .select("*")
      .eq("user_id", userId);
    if (userTokens) tokenRows = userTokens;

    // Also fetch tokens from group members for groups the user belongs to
    const { data: memberships } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("user_id", userId);

    if (memberships && memberships.length > 0) {
      const groupIds = memberships.map((m: any) => m.group_id);
      const { data: groupTokens } = await supabase
        .from("google_calendar_tokens")
        .select("*")
        .in("group_id", groupIds)
        .neq("user_id", userId);
      if (groupTokens) tokenRows = [...tokenRows, ...groupTokens];
    }
  } else if (groupShared && groupId) {
    // Fetch ALL tokens for this group (from all members), not just the requesting user
    const { data: isMember } = await supabase
      .from("group_members")
      .select("id")
      .eq("user_id", userId)
      .eq("group_id", groupId)
      .maybeSingle();

    if (!isMember) {
      return new Response(JSON.stringify({ error: "Not a group member" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data, error: tokenErr } = await supabase
      .from("google_calendar_tokens")
      .select("*")
      .eq("group_id", groupId);
    if (!tokenErr && data) tokenRows = data;
  } else {
    const { data, error: tokenErr } = await supabase
      .from("google_calendar_tokens")
      .select("*")
      .eq("user_id", userId)
      .eq("group_id", groupId!)
      .maybeSingle();
    if (!tokenErr && data) tokenRows = [data];
  }

  if (tokenRows.length === 0) {
    return new Response(JSON.stringify({ events: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Load hidden gcal events for the requesting user
  const { data: hiddenRows } = await supabase
    .from("hidden_gcal_events")
    .select("gcal_event_id")
    .eq("user_id", userId);
  const hiddenEventIds = new Set((hiddenRows || []).map((r: any) => r.gcal_event_id));

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
    const isOwnToken = tokenRow.user_id === userId;

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

        // If this event was hidden by the requesting user, skip it
        if (hiddenEventIds.has(item.id)) continue;

        // If this token belongs to another user, check if they hid this event from group
        if (!isOwnToken) {
          const { data: ownerHidden } = await supabase
            .from("hidden_gcal_events")
            .select("id")
            .eq("user_id", tokenRow.user_id)
            .eq("gcal_event_id", item.id)
            .maybeSingle();
          if (ownerHidden) continue;
        }

        allEvents.push({
          id: item.id,
          title: item.summary || "(No title)",
          description: item.description || null,
          start: item.start?.dateTime || item.start?.date,
          end: item.end?.dateTime || item.end?.date,
          allDay: !item.start?.dateTime,
          location: item.location || null,
          htmlLink: item.htmlLink,
          ownerUserId: tokenRow.user_id,
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
