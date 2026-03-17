import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { text, conversationHistory } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const dayOfWeek = today.toLocaleDateString("en-US", { weekday: "long" });

    const systemPrompt = `You are a smart, forgiving scheduling and habit assistant for a couple named Harrison and Evelyn. Today is ${todayStr} (${dayOfWeek}).

You must parse the user's natural language into structured actions OR ask clarifying questions when critical info is missing.

CRITICAL RULE — TIME DETECTION:
- If the user mentions ANY time (e.g. "2 PM", "at 3", "10:30", "noon", "morning meeting"), this is ALWAYS a scheduled calendar event (create_event), NEVER a generic task.
- "2 PM call" = create_event with time "2:00 PM" and title "Call", NOT a generic task.
- Even short inputs like "2pm call" or "meeting 3pm" should be treated as scheduled events.

ACTIONS YOU CAN PERFORM:
1. create_event — Schedule a task/event with a date and optionally a time
2. add_habit — Add a daily habit to the user's habit tracker
3. perform_actions — Batch multiple actions
4. ask_clarification — Ask the user follow-up questions when key information is missing

WHEN TO ASK CLARIFICATION (use ask_clarification):
- If a time is mentioned but NO date → ask what day (suggest "today" as default)
- If the request is very vague (e.g. just "call" with no time or context) → ask for details
- If you're unsure about category/assignee AND it matters → ask
- Do NOT ask if you can reasonably infer. "2pm call" → infer today, Personal, me. Just create it.
- Only ask when genuinely ambiguous or when multiple interpretations are equally likely.

WHEN TO JUST CREATE (don't ask):
- "2pm call" → create_event: title "Call", time "2:00 PM", date today, tag Personal, assignee me
- "meeting tomorrow 3pm" → create_event: title "Meeting", time "3:00 PM", date tomorrow
- "buy groceries" → create_event: title "Buy groceries", date today, no time (All day)
- "add stretch to morning habits" → add_habit: label "Stretch", category "morning"

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
- If no date mentioned for a scheduled item with a time → assume today
- "morning" in date/time context = scheduling, not habit

VOICE RESPONSE:
- Always include a "spokenResponse" field in your tool call with a natural, friendly confirmation of what you did or what you're asking.
- Keep it concise and conversational, like: "Got it — I've scheduled a call for 2 PM today. Anything else?"
- For clarification: "I'd love to help with that! What day should I schedule the call for?"`;

    const messages: any[] = [
      { role: "system", content: systemPrompt },
    ];

    // Add conversation history if provided (for follow-up answers)
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
              description: "Create a single calendar event or scheduled task. Use this when time/date info is present or can be reasonably inferred.",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string", description: "Event title" },
                  date: { type: "string", description: "Date in YYYY-MM-DD format" },
                  time: { type: "string", description: "Time like '2:00 PM'. MUST be set if user mentions any specific time." },
                  description: { type: "string", description: "Brief description if any" },
                  assignee: { type: "string", enum: ["me", "partner", "both"] },
                  tag: { type: "string", enum: ["Work", "Personal", "Household"] },
                  spokenResponse: { type: "string", description: "Natural spoken confirmation of the action taken, e.g. 'Done! I scheduled your call for 2 PM today.'" },
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
              description: "Ask the user follow-up questions when critical information is missing or ambiguous. Use this sparingly — only when you truly cannot infer the intent.",
              parameters: {
                type: "object",
                properties: {
                  question: { type: "string", description: "The follow-up question to ask the user" },
                  suggestions: {
                    type: "array",
                    items: { type: "string" },
                    description: "2-4 quick-reply suggestions the user can tap, e.g. ['Today', 'Tomorrow', 'This Friday']",
                  },
                  spokenResponse: { type: "string", description: "Natural spoken version of the question" },
                  context: { type: "string", description: "What the AI understood so far, to preserve context for the follow-up" },
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
                  spokenResponse: { type: "string", description: "Natural spoken confirmation of all actions" },
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
      if (status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in Settings." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await response.text();
      console.error("AI error:", status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const toolCalls = data.choices?.[0]?.message?.tool_calls;
    if (!toolCalls || toolCalls.length === 0) throw new Error("No tool call in response");

    const allActions: any[] = [];
    let spokenResponse = "";

    for (const tc of toolCalls) {
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
        spokenResponse = parsed.spokenResponse || "";
        for (const a of parsed.actions) {
          allActions.push(a);
        }
      } else if (fname === "create_event") {
        spokenResponse = parsed.spokenResponse || "";
        allActions.push({ action_type: "create_event", ...parsed });
      } else if (fname === "add_habit") {
        spokenResponse = parsed.spokenResponse || "";
        allActions.push({ action_type: "add_habit", ...parsed });
      }
    }

    if (allActions.length === 0) throw new Error("No actions parsed");

    if (allActions.length === 1) {
      const a = allActions[0];
      if (a.action_type === "add_habit") {
        return new Response(JSON.stringify({ type: "add_habit", label: a.label, category: a.category, spokenResponse }), {
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
          spokenResponse,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ type: "multi", actions: allActions, spokenResponse }), {
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
