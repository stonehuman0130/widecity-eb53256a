import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { message, groupId, conversationHistory, phase, context, timezone, appContext, executeActions } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    // Create admin client for executing actions
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Get user ID from token
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey);
    const { data: { user } } = await userClient.auth.getUser(token);
    const userId = user?.id;
    if (!userId) throw new Error("Not authenticated");

    // If executeActions is set, run the actions directly
    if (executeActions && Array.isArray(executeActions)) {
      const results = await executeAppActions(adminClient, userId, groupId, executeActions);
      return new Response(JSON.stringify({ success: true, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userTz = timezone || "America/New_York";
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const userName = appContext?.userName || "there";
    const groups = appContext?.groups || [];
    const activeGroupName = appContext?.activeGroupName || "your group";

    // Fetch current app data for context
    let currentData = "";
    try {
      const [workoutsRes, eventsRes, habitsRes, sectionsRes, sobrietyRes, specialDaysRes, exerciseLogsRes] = await Promise.all([
        adminClient.from("workouts").select("id,title,emoji,tag,duration,cal,done,scheduled_date,exercises").eq("user_id", userId).eq("group_id", groupId).order("scheduled_date", { ascending: true }).limit(50),
        adminClient.from("events").select("id,title,day,month,year,time,end_time,assignee,done,description").eq("group_id", groupId).order("year", { ascending: true }).order("month", { ascending: true }).order("day", { ascending: true }).limit(50),
        adminClient.from("habits").select("id,label,category").eq("user_id", userId).eq("group_id", groupId),
        adminClient.from("habit_sections").select("id,key,label,icon,sort_order").eq("user_id", userId).eq("group_id", groupId).order("sort_order"),
        adminClient.from("sobriety_categories").select("id,label,icon,start_date,money_per_day").eq("user_id", userId).eq("group_id", groupId),
        adminClient.from("special_days").select("id,title,icon,event_date,count_direction,repeats_yearly,is_featured").eq("user_id", userId).eq("group_id", groupId),
        adminClient.from("exercise_logs").select("exercise_name,set_number,weight,unit,reps,completed,logged_date,workout_id").eq("user_id", userId).order("logged_date", { ascending: false }).order("exercise_name").order("set_number").limit(200),
      ]);

      const upcoming = (eventsRes.data || []).filter((e: any) => {
        const d = new Date(e.year, e.month, e.day);
        return d >= new Date(todayStr);
      }).slice(0, 20);

      const futureWorkouts = (workoutsRes.data || []).filter((w: any) => w.scheduled_date >= todayStr && !w.done).slice(0, 20);

      currentData = `
CURRENT APP DATA (for this group "${activeGroupName}"):
Workouts (upcoming/incomplete): ${JSON.stringify(futureWorkouts)}
Events (upcoming): ${JSON.stringify(upcoming)}
Habits: ${JSON.stringify(habitsRes.data || [])}
Habit Sections: ${JSON.stringify(sectionsRes.data || [])}
Sobriety Trackers: ${JSON.stringify(sobrietyRes.data || [])}
Special Days: ${JSON.stringify(specialDaysRes.data || [])}
Exercise Logs (recent weight/rep history, sorted newest first): ${JSON.stringify(exerciseLogsRes.data || [])}

EXERCISE LOG INSTRUCTIONS: When the user asks about weights they've used, their recent lifts, or strength progress, use the Exercise Logs data above. Each log entry has exercise_name, weight, unit (lb/kg), reps, set_number, logged_date, and workout_id. Summarize clearly (e.g. "Your last bench press was 185 lb for 3 sets of 8 reps on March 20").`;
    } catch (e) {
      console.error("Failed to fetch context data:", e);
    }

    const systemPrompt = `You are a friendly, knowledgeable universal AI assistant inside a shared planning & wellness app. Today is ${todayStr}. User timezone: ${userTz}. User's name: ${userName}. Active group: ${activeGroupName}. Group ID: ${groupId}.

Available groups: ${groups.map((g: any) => `${g.emoji} ${g.name} (${g.memberCount} members, id: ${g.id})`).join(", ") || "none"}

${currentData}

YOU ARE THE APP'S CENTRAL AI. You can help with EVERYTHING and EXECUTE REAL ACTIONS.

CAPABILITIES:
1. **Workouts** - Create, edit, delete workout plans with exercises
2. **Events/Scheduling** - Create, edit, delete calendar events with dates/times
3. **Habits** - Create, delete habits in sections
4. **Habit Sections** - Create, rename, delete habit sections
5. **Sobriety Tracking** - Set up/delete sobriety trackers
6. **Special Days** - Add/delete special day trackers
7. **Group Chat** - Send messages to group chats
8. **Tasks** - Create, edit, delete tasks
9. **Summaries** - Summarize activity, completions, streaks

ACTION SYSTEM:
When the user wants you to DO something (create, edit, delete, send), you MUST include an "actions" array.
Each action has an "action_type" and relevant fields.

ACTION TYPES:
- "create_workout": { title, emoji, duration, cal, tag, exercises: [{name, sets, reps}], scheduled_date }
- "delete_workout": { workout_id } (use ID from current data)
- "create_event": { title, day, month, year, time, end_time, assignee, description }
- "delete_event": { event_id }
- "create_habit": { label, category }
- "delete_habit": { habit_id }
- "create_section": { key, label, icon, shared }
- "delete_section": { section_id }
- "rename_section": { section_id, new_label }
- "create_sobriety": { label, icon, start_date, money_per_day }
- "delete_sobriety": { sobriety_id }
- "create_special_day": { title, icon, event_date, count_direction, repeats_yearly }
- "delete_special_day": { special_day_id }
- "send_message": { group_id, content }
- "create_task": { title, tag, time, assignee, scheduled_day, scheduled_month, scheduled_year }
- "delete_task": { task_id }

CRITICAL RULES:
1. When the user clearly states what they want, EXECUTE IT with actions. Don't just suggest—DO IT.
2. If details are missing or ambiguous, ask follow-up questions first (no actions yet).
3. After executing, confirm what you did clearly.
4. For delete requests with multiple possible targets, ask which one(s) to delete.
5. When creating workout plans, include real exercises with sets/reps.
6. Keep responses concise and mobile-friendly.
7. Always provide 2-4 quick-reply suggestions.
8. Use the CURRENT APP DATA above to reference existing items by ID when editing/deleting.
9. For multi-day workout plans, create one action per day.

CONVERSATION PHASES:
- "idle": Ready to help
- "gathering": Collecting info for a task
- "executing": Taking action (include actions array)
- "done": Action completed`;

    const messages: any[] = [{ role: "system", content: systemPrompt }];
    if (conversationHistory && Array.isArray(conversationHistory)) {
      for (const msg of conversationHistory) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
    messages.push({ role: "user", content: message });

    const tools = [
      {
        type: "function",
        function: {
          name: "assistant_response",
          description: "Respond and optionally execute actions in the app.",
          parameters: {
            type: "object",
            properties: {
              reply: { type: "string", description: "The conversational reply to the user" },
              phase: { type: "string", enum: ["idle", "gathering", "executing", "done"] },
              suggestions: { type: "array", items: { type: "string" } },
              actions: {
                type: "array",
                description: "Actions to execute in the app. Include when the user wants something done.",
                items: {
                  type: "object",
                  properties: {
                    action_type: { type: "string", enum: [
                      "create_workout", "delete_workout",
                      "create_event", "delete_event",
                      "create_habit", "delete_habit",
                      "create_section", "delete_section", "rename_section",
                      "create_sobriety", "delete_sobriety",
                      "create_special_day", "delete_special_day",
                      "send_message",
                      "create_task", "delete_task"
                    ]},
                    title: { type: "string" },
                    emoji: { type: "string" },
                    duration: { type: "string" },
                    cal: { type: "number" },
                    tag: { type: "string" },
                    exercises: { type: "array", items: { type: "object", properties: { name: { type: "string" }, sets: { type: "number" }, reps: { type: "string" } } } },
                    scheduled_date: { type: "string" },
                    day: { type: "number" },
                    month: { type: "number" },
                    year: { type: "number" },
                    time: { type: "string" },
                    end_time: { type: "string" },
                    assignee: { type: "string" },
                    description: { type: "string" },
                    label: { type: "string" },
                    category: { type: "string" },
                    key: { type: "string" },
                    icon: { type: "string" },
                    shared: { type: "boolean" },
                    start_date: { type: "string" },
                    money_per_day: { type: "number" },
                    event_date: { type: "string" },
                    count_direction: { type: "string" },
                    repeats_yearly: { type: "boolean" },
                    group_id: { type: "string" },
                    content: { type: "string" },
                    workout_id: { type: "string" },
                    event_id: { type: "string" },
                    habit_id: { type: "string" },
                    section_id: { type: "string" },
                    sobriety_id: { type: "string" },
                    special_day_id: { type: "string" },
                    task_id: { type: "string" },
                    new_label: { type: "string" },
                    scheduled_day: { type: "number" },
                    scheduled_month: { type: "number" },
                    scheduled_year: { type: "number" },
                  },
                  required: ["action_type"],
                },
              },
              draftPlan: {
                type: "object",
                description: "Legacy draft plan for backward compat. Prefer using actions instead.",
                properties: {
                  type: { type: "string" },
                  items: { type: "array", items: { type: "object", properties: { title: { type: "string" } } } },
                },
              },
            },
            required: ["reply", "phase"],
            additionalProperties: false,
          },
        },
      },
    ];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        tools,
        tool_choice: { type: "function", function: { name: "assistant_response" } },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limited, try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await response.text();
      console.error("AI error:", status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      const content = data.choices?.[0]?.message?.content || "I'm here to help! What would you like to do?";
      return new Response(JSON.stringify({
        reply: content, phase: "idle",
        suggestions: ["Plan a workout", "Schedule an event", "Help me set up habits"],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    const actions = parsed.actions || [];

    // Execute actions server-side
    let actionResults: any[] = [];
    if (actions.length > 0) {
      actionResults = await executeAppActions(adminClient, userId, groupId, actions);
    }

    return new Response(JSON.stringify({
      reply: parsed.reply,
      phase: parsed.phase || "idle",
      suggestions: parsed.suggestions || [],
      actions: actions,
      actionResults: actionResults,
      draftPlan: parsed.draftPlan || null,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-coach error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function executeAppActions(client: any, userId: string, groupId: string, actions: any[]): Promise<any[]> {
  const results: any[] = [];
  const now = new Date();

  const parseIsoDate = (raw?: string) => {
    if (!raw || typeof raw !== "string") return null;
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const year = Number(m[1]);
    const month = Number(m[2]) - 1;
    const day = Number(m[3]);
    if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return null;
    if (month < 0 || month > 11 || day < 1 || day > 31) return null;
    return { year, month, day };
  };

  const normalizeMonth = (raw: unknown, fallbackMonth: number) => {
    const parsed = typeof raw === "string" ? Number(raw) : Number(raw);
    if (!Number.isFinite(parsed)) return fallbackMonth;
    const intVal = Math.trunc(parsed);
    if (intVal >= 1 && intVal <= 12) return intVal - 1;
    if (intVal >= 0 && intVal <= 11) return intVal;
    return fallbackMonth;
  };

  const normalizeDay = (raw: unknown, fallbackDay: number) => {
    const parsed = typeof raw === "string" ? Number(raw) : Number(raw);
    if (!Number.isFinite(parsed)) return fallbackDay;
    const intVal = Math.trunc(parsed);
    if (intVal >= 1 && intVal <= 31) return intVal;
    return fallbackDay;
  };

  const normalizeYear = (raw: unknown, fallbackYear: number) => {
    const parsed = typeof raw === "string" ? Number(raw) : Number(raw);
    if (!Number.isFinite(parsed)) return fallbackYear;
    const intVal = Math.trunc(parsed);
    if (intVal >= 1900 && intVal <= 3000) return intVal;
    return fallbackYear;
  };

  const normalizeEventDate = (action: any) => {
    const fromIso = parseIsoDate(action.date);
    if (fromIso) return fromIso;

    return {
      day: normalizeDay(action.day, now.getDate()),
      month: normalizeMonth(action.month, now.getMonth()),
      year: normalizeYear(action.year, now.getFullYear()),
    };
  };

  const normalizeEventEndDate = (action: any, start: { day: number; month: number; year: number }) => {
    const fromIso = parseIsoDate(action.end_date);
    if (fromIso) return fromIso;

    const hasEndParts = action.end_day !== undefined || action.end_month !== undefined || action.end_year !== undefined;
    if (!hasEndParts) return start;

    return {
      day: normalizeDay(action.end_day, start.day),
      month: normalizeMonth(action.end_month, start.month),
      year: normalizeYear(action.end_year, start.year),
    };
  };

  const normalizeTaskSchedule = (action: any) => {
    const fromIso = parseIsoDate(action.scheduled_date || action.date);
    if (fromIso) {
      return {
        scheduled_day: fromIso.day,
        scheduled_month: fromIso.month,
        scheduled_year: fromIso.year,
      };
    }

    const hasParts = action.scheduled_day !== undefined || action.scheduled_month !== undefined || action.scheduled_year !== undefined;
    if (!hasParts) {
      return {
        scheduled_day: null,
        scheduled_month: null,
        scheduled_year: null,
      };
    }

    return {
      scheduled_day: normalizeDay(action.scheduled_day, now.getDate()),
      scheduled_month: normalizeMonth(action.scheduled_month, now.getMonth()),
      scheduled_year: normalizeYear(action.scheduled_year, now.getFullYear()),
    };
  };

  const normalizeTime = (raw: unknown, fallback = "All day") => {
    if (typeof raw !== "string") return fallback;
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  };

  const normalizeAssignee = (raw: unknown): "me" | "partner" | "both" => {
    if (raw === "partner" || raw === "both") return raw;
    return "me";
  };

  const applyGroupFilter = (query: any) => {
    return groupId ? query.eq("group_id", groupId) : query.is("group_id", null);
  };

  for (const action of actions) {
    try {
      switch (action.action_type) {
        case "create_workout": {
          const scheduledDate = typeof action.scheduled_date === "string" && action.scheduled_date
            ? action.scheduled_date
            : new Date().toISOString().slice(0, 10);
          const workoutTitle = (action.title || "Workout").trim();
          const workoutTag = action.tag || "Full Body";

          const existingWorkoutQuery = applyGroupFilter(
            client
              .from("workouts")
              .select("id")
              .eq("user_id", userId)
              .eq("title", workoutTitle)
              .eq("scheduled_date", scheduledDate)
              .eq("tag", workoutTag)
              .limit(1)
          );
          const { data: existingWorkout, error: existingWorkoutError } = await existingWorkoutQuery.maybeSingle();
          if (existingWorkoutError) throw existingWorkoutError;
          if (existingWorkout?.id) {
            results.push({ action_type: "create_workout", success: true, id: existingWorkout.id, duplicate: true });
            break;
          }

          const { data, error } = await client.from("workouts").insert({
            user_id: userId,
            group_id: groupId,
            title: workoutTitle,
            emoji: action.emoji || "💪",
            duration: action.duration || "30 min",
            cal: action.cal || 0,
            tag: workoutTag,
            exercises: action.exercises || [],
            scheduled_date: scheduledDate,
          }).select().single();
          results.push({ action_type: "create_workout", success: !error, id: data?.id, error: error?.message });
          break;
        }
        case "delete_workout": {
          const { error } = await client.from("workouts").delete().eq("id", action.workout_id).eq("user_id", userId);
          results.push({ action_type: "delete_workout", success: !error, error: error?.message });
          break;
        }
        case "create_event": {
          const start = normalizeEventDate(action);
          const end = normalizeEventEndDate(action, start);
          const title = (action.title || "Event").trim();
          const time = normalizeTime(action.time, "All day");
          const allDay = time === "All day";
          const endTime = allDay ? "" : normalizeTime(action.end_time, "");
          const assignee = normalizeAssignee(action.assignee);

          const existingEventQuery = applyGroupFilter(
            client
              .from("events")
              .select("id")
              .eq("user_id", userId)
              .eq("title", title)
              .eq("day", start.day)
              .eq("month", start.month)
              .eq("year", start.year)
              .eq("time", time)
              .eq("assignee", assignee)
              .limit(1)
          );
          const { data: existingEvent, error: existingEventError } = await existingEventQuery.maybeSingle();
          if (existingEventError) throw existingEventError;
          if (existingEvent?.id) {
            results.push({ action_type: "create_event", success: true, id: existingEvent.id, duplicate: true });
            break;
          }

          const { data, error } = await client.from("events").insert({
            user_id: userId,
            group_id: groupId,
            title,
            day: start.day,
            month: start.month,
            year: start.year,
            end_day: end.day,
            end_month: end.month,
            end_year: end.year,
            all_day: allDay,
            time,
            end_time: endTime,
            assignee,
            description: action.description || null,
          }).select().single();
          results.push({ action_type: "create_event", success: !error, id: data?.id, error: error?.message });
          break;
        }
        case "delete_event": {
          const { error } = await client.from("events").delete().eq("id", action.event_id).eq("user_id", userId);
          results.push({ action_type: "delete_event", success: !error, error: error?.message });
          break;
        }
        case "create_habit": {
          const { data, error } = await client.from("habits").insert({
            user_id: userId,
            group_id: groupId,
            label: action.label || action.title || "Habit",
            category: action.category || "other",
          }).select().single();
          results.push({ action_type: "create_habit", success: !error, id: data?.id, error: error?.message });
          break;
        }
        case "delete_habit": {
          const { error } = await client.from("habits").delete().eq("id", action.habit_id).eq("user_id", userId);
          results.push({ action_type: "delete_habit", success: !error, error: error?.message });
          break;
        }
        case "create_section": {
          if (action.shared) {
            const { data, error } = await client.rpc("create_shared_section", {
              _key: action.key || action.label?.toLowerCase().replace(/\s+/g, "_") || "custom",
              _label: action.label || "Section",
              _icon: action.icon || "📋",
              _group_id: groupId,
            });
            results.push({ action_type: "create_section", success: !error, error: error?.message });
          } else {
            const maxOrderRes = await client.from("habit_sections").select("sort_order").eq("user_id", userId).eq("group_id", groupId).order("sort_order", { ascending: false }).limit(1);
            const maxOrder = maxOrderRes.data?.[0]?.sort_order ?? -1;
            const { data, error } = await client.from("habit_sections").insert({
              user_id: userId,
              group_id: groupId,
              key: action.key || action.label?.toLowerCase().replace(/\s+/g, "_") || "custom",
              label: action.label || "Section",
              icon: action.icon || "📋",
              sort_order: maxOrder + 1,
            }).select().single();
            results.push({ action_type: "create_section", success: !error, id: data?.id, error: error?.message });
          }
          break;
        }
        case "delete_section": {
          const { error } = await client.from("habit_sections").delete().eq("id", action.section_id).eq("user_id", userId);
          results.push({ action_type: "delete_section", success: !error, error: error?.message });
          break;
        }
        case "rename_section": {
          const { error } = await client.from("habit_sections").update({ label: action.new_label }).eq("id", action.section_id).eq("user_id", userId);
          results.push({ action_type: "rename_section", success: !error, error: error?.message });
          break;
        }
        case "create_sobriety": {
          const { data, error } = await client.from("sobriety_categories").insert({
            user_id: userId,
            group_id: groupId,
            label: action.label || action.title || "Tracker",
            icon: action.icon || "🚫",
            start_date: action.start_date || new Date().toISOString().slice(0, 10),
            money_per_day: action.money_per_day || 0,
          }).select().single();
          results.push({ action_type: "create_sobriety", success: !error, id: data?.id, error: error?.message });
          break;
        }
        case "delete_sobriety": {
          const { error } = await client.from("sobriety_categories").delete().eq("id", action.sobriety_id).eq("user_id", userId);
          results.push({ action_type: "delete_sobriety", success: !error, error: error?.message });
          break;
        }
        case "create_special_day": {
          const { data, error } = await client.from("special_days").insert({
            user_id: userId,
            group_id: groupId,
            title: action.title || "Special Day",
            icon: action.icon || "❤️",
            event_date: action.event_date || new Date().toISOString().slice(0, 10),
            count_direction: action.count_direction || "since",
            repeats_yearly: action.repeats_yearly || false,
          }).select().single();
          results.push({ action_type: "create_special_day", success: !error, id: data?.id, error: error?.message });
          break;
        }
        case "delete_special_day": {
          const { error } = await client.from("special_days").delete().eq("id", action.special_day_id).eq("user_id", userId);
          results.push({ action_type: "delete_special_day", success: !error, error: error?.message });
          break;
        }
        case "send_message": {
          const targetGroupId = action.group_id || groupId;
          const { data, error } = await client.from("messages").insert({
            group_id: targetGroupId,
            user_id: userId,
            content: action.content || "",
            is_ai_coach: false,
          }).select().single();
          results.push({ action_type: "send_message", success: !error, id: data?.id, error: error?.message });
          break;
        }
        case "create_task": {
          const schedule = normalizeTaskSchedule(action);
          const title = (action.title || "Task").trim();
          const time = normalizeTime(action.time, "");
          const assignee = normalizeAssignee(action.assignee);
          const tag = action.tag || "Personal";

          const existingTaskQuery = applyGroupFilter(
            client
              .from("tasks")
              .select("id")
              .eq("user_id", userId)
              .eq("title", title)
              .eq("time", time)
              .eq("assignee", assignee)
              .eq("tag", tag)
              .eq("scheduled_day", schedule.scheduled_day)
              .eq("scheduled_month", schedule.scheduled_month)
              .eq("scheduled_year", schedule.scheduled_year)
              .limit(1)
          );
          const { data: existingTask, error: existingTaskError } = await existingTaskQuery.maybeSingle();
          if (existingTaskError) throw existingTaskError;
          if (existingTask?.id) {
            results.push({ action_type: "create_task", success: true, id: existingTask.id, duplicate: true });
            break;
          }

          const { data, error } = await client.from("tasks").insert({
            user_id: userId,
            group_id: groupId,
            title,
            tag,
            time,
            assignee,
            scheduled_day: schedule.scheduled_day,
            scheduled_month: schedule.scheduled_month,
            scheduled_year: schedule.scheduled_year,
          }).select().single();
          results.push({ action_type: "create_task", success: !error, id: data?.id, error: error?.message });
          break;
        }
        case "delete_task": {
          const { error } = await client.from("tasks").delete().eq("id", action.task_id).eq("user_id", userId);
          results.push({ action_type: "delete_task", success: !error, error: error?.message });
          break;
        }
        default:
          results.push({ action_type: action.action_type, success: false, error: "Unknown action type" });
      }
    } catch (e) {
      results.push({ action_type: action.action_type, success: false, error: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  return results;
}
