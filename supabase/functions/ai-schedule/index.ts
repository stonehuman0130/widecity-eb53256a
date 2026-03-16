import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { text } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const dayOfWeek = today.toLocaleDateString("en-US", { weekday: "long" });

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a smart, forgiving scheduling and habit assistant for a couple named Harrison and Evelyn. Today is ${todayStr} (${dayOfWeek}).

You must parse the user's natural language into one or more structured actions. Users may be casual, use shorthand, have typos, or mix multiple requests in one message. Always infer the most likely intent.

ACTIONS YOU CAN PERFORM (call multiple tools if the user wants multiple things):

1. create_event — Schedule a task/event with a date and optionally a time
2. add_habit — Add a daily habit to the user's habit tracker
3. perform_actions — When the user wants MULTIPLE things done at once, use this to batch them

PERSON/ASSIGNMENT RULES:
- "Harrison", "mine", "my", "me", "I" → assignee "me"
- "Evelyn", "Evelyn's", "her", "partner" → assignee "partner"
- "both", "us", "shared", "household", "together" → assignee "both"
- If no person mentioned, default to "me"

HABIT RULES:
- Keywords: "habit", "habits", "routine", "daily", "every day", "make this a habit", "add to routine", "part of my mornings"
- "morning habit", "morning routine", "mornings", "AM routine", "part of my mornings", "for mornings", "morning" → category "morning"
- "habit", "routine", "other habit", "evening", "daily" (without morning context) → category "other"
- Be very forgiving: "put this in my routine" = other habit, "add X to my morning" = morning habit

SCHEDULING RULES:
- "today" = ${todayStr}
- "tomorrow" = the next day after today
- Day names like "Tuesday" = the NEXT upcoming occurrence
- If a specific time is mentioned (e.g. "2 pm", "3:00", "at 7"), ALWAYS include it
- If no date is mentioned for a scheduled item, assume today
- "morning" when combined with a date/time context means scheduling, not habit

TAG RULES:
- "work", "office", "meeting", "project" → tag "Work"
- "household", "chores", "cleaning", "trash", "laundry", "dishes" → tag "Household"  
- Everything else → tag "Personal"

MULTI-ACTION:
- If the user says "Add X to habits AND schedule Y for tomorrow", you MUST call BOTH add_habit and create_event (or use perform_actions).
- Parse each action independently.
- Example: "Add stretch at 2 PM tomorrow and add stretch to my morning habits" → TWO actions: one create_event for tomorrow 2PM, one add_habit morning.

IMPORTANT: Be smart and forgiving. If the user says something slightly wrong or imprecise, do the most sensible thing. You are a smart assistant, not a strict parser.`,
          },
          { role: "user", content: text },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "create_event",
              description: "Create a single calendar event or scheduled task",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string", description: "Event title" },
                  date: { type: "string", description: "Date in YYYY-MM-DD format" },
                  time: { type: "string", description: "Time like '2:00 PM'. Must be set if user mentions a specific time." },
                  description: { type: "string", description: "Brief description if any" },
                  assignee: { type: "string", enum: ["me", "partner", "both"], description: "Who this is assigned to" },
                  tag: { type: "string", enum: ["Work", "Personal", "Household"], description: "Task category tag" },
                },
                required: ["title", "date"],
                additionalProperties: false,
              },
            },
          },
          {
            type: "function",
            function: {
              name: "add_habit",
              description: "Add a new daily habit to the user's habit list",
              parameters: {
                type: "object",
                properties: {
                  label: { type: "string", description: "The habit name/label" },
                  category: { type: "string", enum: ["morning", "other"], description: "Whether this is a morning habit or other habit" },
                },
                required: ["label", "category"],
                additionalProperties: false,
              },
            },
          },
          {
            type: "function",
            function: {
              name: "perform_actions",
              description: "Perform multiple actions at once when the user wants several things done in one request",
              parameters: {
                type: "object",
                properties: {
                  actions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        action_type: { type: "string", enum: ["create_event", "add_habit"] },
                        title: { type: "string", description: "Event title (for create_event)" },
                        date: { type: "string", description: "Date YYYY-MM-DD (for create_event)" },
                        time: { type: "string", description: "Time like '2:00 PM' (for create_event)" },
                        description: { type: "string" },
                        assignee: { type: "string", enum: ["me", "partner", "both"] },
                        tag: { type: "string", enum: ["Work", "Personal", "Household"] },
                        label: { type: "string", description: "Habit name (for add_habit)" },
                        category: { type: "string", enum: ["morning", "other"], description: "Habit category (for add_habit)" },
                      },
                      required: ["action_type"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["actions"],
                additionalProperties: false,
              },
            },
          },
        ],
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limited, try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in Settings." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await response.text();
      console.error("AI error:", status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const toolCalls = data.choices?.[0]?.message?.tool_calls;
    if (!toolCalls || toolCalls.length === 0) throw new Error("No tool call in response");

    // Collect all actions from potentially multiple tool calls
    const allActions: any[] = [];

    for (const tc of toolCalls) {
      const parsed = JSON.parse(tc.function.arguments);
      const fname = tc.function.name;

      if (fname === "perform_actions" && parsed.actions) {
        for (const a of parsed.actions) {
          allActions.push(a);
        }
      } else if (fname === "create_event") {
        allActions.push({ action_type: "create_event", ...parsed });
      } else if (fname === "add_habit") {
        allActions.push({ action_type: "add_habit", ...parsed });
      }
    }

    if (allActions.length === 0) throw new Error("No actions parsed");

    // If single action, return flat for backward compat
    if (allActions.length === 1) {
      const a = allActions[0];
      if (a.action_type === "add_habit") {
        return new Response(JSON.stringify({ type: "add_habit", label: a.label, category: a.category }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } else {
        return new Response(JSON.stringify({
          type: "create_event",
          title: a.title,
          date: a.date,
          time: a.time,
          description: a.description,
          assignee: a.assignee || "me",
          tag: a.tag || "Personal",
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Multiple actions
    return new Response(JSON.stringify({ type: "multi", actions: allActions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-schedule error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
