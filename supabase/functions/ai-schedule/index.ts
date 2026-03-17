import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { text, conversationHistory, timezone } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const userTz = timezone || "America/New_York";

    // Get current date/time in user's timezone
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: userTz,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const get = (type: string) => parts.find(p => p.type === type)?.value || "";
    const todayStr = `${get("year")}-${get("month")}-${get("day")}`;
    const currentTime = `${get("hour")}:${get("minute")}`;

    const dayFormatter = new Intl.DateTimeFormat("en-US", { timeZone: userTz, weekday: "long" });
    const dayOfWeek = dayFormatter.format(now);

    const systemPrompt = `You are a smart, proactive scheduling and habit assistant for a couple named Harrison and Evelyn. Today is ${todayStr} (${dayOfWeek}). Current time is ${currentTime}. User timezone: ${userTz}.

You must parse the user's natural language into structured actions. Be PROACTIVE about asking clarifying questions when important details are missing.

CRITICAL RULE — ALWAYS ASK CLARIFICATION WHEN:
- A time is mentioned but NO specific date (ask what day — suggest "Today", "Tomorrow", next few days)
- A category/tag is unclear (ask: "Is this work, personal, or household?")
- The assignee is unclear and the task could be for either partner (ask who it's for)
- The request is vague with multiple interpretations

CRITICAL RULE — TIME DETECTION:
- If the user mentions ANY time (e.g. "2 PM", "at 3", "10:30", "noon"), this is ALWAYS a scheduled calendar event (create_event), NEVER a generic task.
- Even short inputs like "2pm call" or "meeting 3pm" MUST trigger ask_clarification to confirm the date and category.

WHEN TO CREATE WITHOUT ASKING:
- ALL details are present: title, date, time, and clear category. Example: "Work meeting tomorrow at 3pm" → create directly.
- Habit requests: "add stretch to mornings" → add directly.
- Simple undated tasks with no time: "buy groceries" → create_event with today's date, no time, Personal.

ACTIONS YOU CAN PERFORM:
1. create_event — Schedule an event with date and optionally time
2. add_habit — Add a daily habit
3. perform_actions — Batch multiple actions
4. ask_clarification — Ask the user follow-up questions

PERSON/ASSIGNMENT RULES:
- "Harrison", "mine", "my", "me", "I" → assignee "me"
- "Evelyn", "her", "partner" → assignee "partner"
- "both", "us", "shared", "household", "together" → assignee "both"
- Default: "me"

HABIT RULES:
- Keywords: "habit", "routine", "daily", "every day", "add to routine", "mornings"
- "morning habit/routine/mornings" → category "morning"
- Other habits → category "other"

TAG RULES:
- "work", "office", "meeting", "project", "work call" → tag "Work"
- "household", "chores", "cleaning", "trash", "laundry" → tag "Household"
- Everything else → tag "Personal"

SCHEDULING RULES:
- "today" = ${todayStr}
- "tomorrow" = the next day
- Day names like "Tuesday" = the NEXT upcoming occurrence
- If no date and no time → simple task for today
- If time mentioned but no date → ASK for the date

VOICE RESPONSE:
- Always include a "spokenResponse" field with a natural, friendly confirmation or question.
- Keep it concise and conversational.`;

    const messages: any[] = [{ role: "system", content: systemPrompt }];

    if (conversationHistory && Array.isArray(conversationHistory)) {
      for (const msg of conversationHistory) {
        messages.push(msg);
      }
    }

    messages.push({ role: "user", content: text });

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages,
        tools: [
          {
            type: "function",
            function: {
              name: "create_event",
              description: "Create a single calendar event. Only use when ALL required info is available (title + date). If date or category is missing, use ask_clarification instead.",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string", description: "Event title" },
                  date: { type: "string", description: "Date in YYYY-MM-DD format" },
                  time: { type: "string", description: "Time like '2:00 PM'. MUST be set if user mentions any specific time." },
                  description: { type: "string", description: "Brief description if any" },
                  assignee: { type: "string", enum: ["me", "partner", "both"] },
                  tag: { type: "string", enum: ["Work", "Personal", "Household"] },
                  spokenResponse: { type: "string", description: "Natural spoken confirmation" },
                },
                required: ["title", "date", "spokenResponse"],
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
                  label: { type: "string" },
                  category: { type: "string", enum: ["morning", "other"] },
                  spokenResponse: { type: "string", description: "Natural spoken confirmation" },
                },
                required: ["label", "category", "spokenResponse"],
                additionalProperties: false,
              },
            },
          },
          {
            type: "function",
            function: {
              name: "ask_clarification",
              description: "Ask the user follow-up questions when critical information is missing. Use this proactively when date, category, or assignee cannot be confidently inferred.",
              parameters: {
                type: "object",
                properties: {
                  question: { type: "string", description: "The follow-up question" },
                  suggestions: {
                    type: "array",
                    items: { type: "string" },
                    description: "2-4 quick-reply suggestions",
                  },
                  spokenResponse: { type: "string", description: "Natural spoken version of the question" },
                  context: { type: "string", description: "What the AI understood so far" },
                },
                required: ["question", "suggestions", "spokenResponse", "context"],
                additionalProperties: false,
              },
            },
          },
          {
            type: "function",
            function: {
              name: "perform_actions",
              description: "Perform multiple actions at once",
              parameters: {
                type: "object",
                properties: {
                  actions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        action_type: { type: "string", enum: ["create_event", "add_habit"] },
                        title: { type: "string" },
                        date: { type: "string" },
                        time: { type: "string" },
                        description: { type: "string" },
                        assignee: { type: "string", enum: ["me", "partner", "both"] },
                        tag: { type: "string", enum: ["Work", "Personal", "Household"] },
                        label: { type: "string" },
                        category: { type: "string", enum: ["morning", "other"] },
                      },
                      required: ["action_type"],
                      additionalProperties: false,
                    },
                  },
                  spokenResponse: { type: "string", description: "Natural spoken confirmation" },
                },
                required: ["actions", "spokenResponse"],
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
      if (status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await response.text();
      console.error("AI error:", status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const toolCalls = data.choices?.[0]?.message?.tool_calls;
    if (!toolCalls || toolCalls.length === 0) throw new Error("No tool call in response");

    // Only process the FIRST tool call to prevent duplicates
    const tc = toolCalls[0];
    const parsed = JSON.parse(tc.function.arguments);
    const fname = tc.function.name;

    if (fname === "ask_clarification") {
      return new Response(JSON.stringify({
        type: "clarification",
        question: parsed.question,
        suggestions: parsed.suggestions || [],
        spokenResponse: parsed.spokenResponse || parsed.question,
        context: parsed.context || "",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (fname === "perform_actions" && parsed.actions) {
      return new Response(JSON.stringify({
        type: "multi",
        actions: parsed.actions,
        spokenResponse: parsed.spokenResponse || "",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (fname === "add_habit") {
      return new Response(JSON.stringify({
        type: "add_habit",
        label: parsed.label,
        category: parsed.category,
        spokenResponse: parsed.spokenResponse || "",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // create_event
    return new Response(JSON.stringify({
      type: "create_event",
      title: parsed.title,
      date: parsed.date,
      time: parsed.time,
      description: parsed.description,
      assignee: parsed.assignee || "me",
      tag: parsed.tag || "Personal",
      spokenResponse: parsed.spokenResponse || "",
    }), {
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
