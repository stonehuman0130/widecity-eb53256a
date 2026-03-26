import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Assignee = "me" | "partner" | "both";

type MembershipCheckResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const isDefinitelyInvalidTokenError = (message?: string) => {
  if (!message) return false;
  return /invalid|jwt|expired|signature|malformed/i.test(message);
};

async function resolveUserId(
  supabaseUrl: string,
  anonKey: string,
  authHeader: string,
  token: string,
): Promise<{ userId?: string; status?: number; error?: string }> {
  const supabaseAuth = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  for (let attempt = 0; attempt < 2; attempt++) {
    const {
      data: { user },
      error,
    } = await supabaseAuth.auth.getUser(token);

    if (user?.id) {
      return { userId: user.id };
    }

    const message = error?.message ?? "";

    if (isDefinitelyInvalidTokenError(message)) {
      return { status: 401, error: "Invalid token" };
    }

    if (attempt === 1) {
      return { status: 503, error: "Authentication temporarily unavailable" };
    }

    await wait(150 * (attempt + 1));
  }

  return { status: 503, error: "Authentication temporarily unavailable" };
}

async function assertGroupMembership(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  groupId: string,
): Promise<MembershipCheckResult> {
  let lastMembershipError: string | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: membership, error: membershipError } = await supabase
      .from("group_members")
      .select("id")
      .eq("user_id", userId)
      .eq("group_id", groupId)
      .maybeSingle();

    if (membership?.id) {
      return { ok: true };
    }

    if (membershipError) {
      lastMembershipError = membershipError.message;
      if (attempt < 1) {
        await wait(150 * (attempt + 1));
        continue;
      }
    }

    break;
  }

  const { data: rpcResult, error: rpcError } = await supabase.rpc("is_group_member", {
    _user_id: userId,
    _group_id: groupId,
  });

  if (rpcError) {
    return {
      ok: false,
      status: 503,
      error: lastMembershipError
        ? `Membership check temporarily unavailable: ${lastMembershipError}`
        : "Membership check temporarily unavailable",
    };
  }

  if (!rpcResult) {
    return { ok: false, status: 403, error: "Not a group member" };
  }

  return { ok: true };
}

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

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return jsonResponse({ error: "Not authenticated" }, 401);
    }

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return jsonResponse({ error: "Not authenticated" }, 401);
    }

    const authResult = await resolveUserId(SUPABASE_URL, SUPABASE_ANON_KEY, authHeader, token);
    if (!authResult.userId) {
      return jsonResponse({ error: authResult.error ?? "Invalid token" }, authResult.status ?? 401);
    }

    const userId = authResult.userId;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const url = new URL(req.url);
    const groupId = url.searchParams.get("groupId");
    const allGroups = url.searchParams.get("allGroups") === "true";
    const groupShared = url.searchParams.get("groupShared") === "true";
    const timeMin = url.searchParams.get("timeMin") || new Date().toISOString();
    const timeMax = url.searchParams.get("timeMax") || new Date(Date.now() + 30 * 86400000).toISOString();

    if (!groupId && !allGroups) {
      return jsonResponse({ error: "Missing groupId or allGroups" }, 400);
    }

    let tokenRows: any[] = [];

    if (allGroups) {
      const { data: userTokens } = await supabase
        .from("google_calendar_tokens")
        .select("*")
        .eq("user_id", userId);
      if (userTokens) tokenRows = userTokens;

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
      const membershipCheck = await assertGroupMembership(supabase, userId, groupId);
      if (!membershipCheck.ok) {
        return jsonResponse({ error: membershipCheck.error }, membershipCheck.status);
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
      return jsonResponse({ events: [] });
    }

    const { data: hiddenRows } = await supabase
      .from("hidden_gcal_events")
      .select("gcal_event_id")
      .eq("user_id", userId);
    const hiddenEventIds = new Set((hiddenRows || []).map((r: any) => r.gcal_event_id));

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
        // Get visible Google calendars for this user from DB
        const { data: visibleCalendars } = await supabase
          .from("calendars")
          .select("provider_calendar_id, color")
          .eq("user_id", tokenRow.user_id)
          .eq("provider", "google")
          .eq("is_visible", true);

        // If no calendars in DB yet, default to primary only
        const calendarIds = visibleCalendars && visibleCalendars.length > 0
          ? visibleCalendars.map((c: any) => c.provider_calendar_id).filter(Boolean)
          : ["primary"];

        const calendarColorMap = new Map<string, string>();
        if (visibleCalendars) {
          visibleCalendars.forEach((c: any) => {
            if (c.provider_calendar_id) calendarColorMap.set(c.provider_calendar_id, c.color);
          });
        }

        for (const calendarId of calendarIds) {
          try {
            const calRes = await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?` +
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
              console.error("Google Calendar API error for calendar", calendarId, "group", tokenRow.group_id, ":", await calRes.text());
              continue;
            }

            const calData = await calRes.json();
            const calColor = calendarColorMap.get(calendarId) || null;

            for (const item of (calData.items || [])) {
              if (seenEventIds.has(item.id)) continue;
              seenEventIds.add(item.id);

              if (hiddenEventIds.has(item.id)) continue;

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
                calendarId: calendarId,
                calendarColor: calColor,
              });
            }
          } catch (calErr) {
            console.error("Error fetching calendar", calendarId, ":", calErr);
          }
        }
      } catch (err) {
        console.error("Sync error for group", tokenRow.group_id, ":", err);
      }
    }

    const ownerUserIds = [...new Set(allEvents.map((e: any) => e.ownerUserId).filter(Boolean))];
    const eventIds = [...new Set(allEvents.map((e: any) => e.id).filter(Boolean))];

    const designationMap = new Map<string, Assignee>();
    if (ownerUserIds.length > 0 && eventIds.length > 0) {
      const { data: designationRows } = await supabase
        .from("gcal_event_designations")
        .select("user_id, gcal_event_id, assignee")
        .in("user_id", ownerUserIds)
        .in("gcal_event_id", eventIds);

      (designationRows || []).forEach((row: any) => {
        designationMap.set(`${row.user_id}:${row.gcal_event_id}`, row.assignee as Assignee);
      });
    }

    const events = allEvents.map((event: any) => {
      const key = `${event.ownerUserId}:${event.id}`;
      const ownerAssignee = designationMap.get(key);
      const assignee = ownerAssignee
        ? toViewerPerspective(ownerAssignee, event.ownerUserId === userId)
        : (event.ownerUserId === userId ? "me" : "partner");

      return { ...event, assignee };
    });

    return jsonResponse({ events });
  } catch (error) {
    console.error("google-calendar-sync runtime error:", error);
    return jsonResponse({ error: "Sync failed" }, 500);
  }
});