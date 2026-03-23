import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { message, groupId, conversationHistory, phase, context, timezone, appContext } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const userTz = timezone || "America/New_York";
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    const userName = appContext?.userName || "there";
    const groups = appContext?.groups || [];
    const activeGroupName = appContext?.activeGroupName || "your group";

    const systemPrompt = `You are a friendly, knowledgeable universal AI assistant inside a shared planning & wellness app. Today is ${todayStr}. User timezone: ${userTz}. User's name: ${userName}. Active group: ${activeGroupName}.

Available groups: ${groups.map((g: any) => `${g.emoji} ${g.name} (${g.memberCount} members, id: ${g.id})`).join(", ") || "none"}

YOU ARE THE APP'S CENTRAL AI. You can help with EVERYTHING in the app:

APP CAPABILITIES YOU UNDERSTAND:
1. **Scheduling** - Create events, tasks with dates/times/assignees
2. **Workouts** - Plan workout routines with exercises, sets, reps, duration
3. **Habits** - Create habit sections and individual habits (morning, evening, custom)
4. **Sobriety Tracking** - Set up sobriety trackers with icons, start dates, daily savings
5. **Special Days** - Track anniversaries, birthdays, milestones
6. **Group Chat** - Send messages to group chats
7. **Home Customization** - Guide users on customizing their home page
8. **Navigation** - Guide users on app navigation and features
9. **Summaries** - Summarize daily/weekly activity, completions, streaks
10. **Recommendations** - Suggest workouts, habits, routines based on goals

CRITICAL RULES:
1. NEVER immediately create items when details are missing. Ask follow-up questions first.
2. Be conversational, warm, and encouraging. Use emojis sparingly.
3. Keep responses concise and mobile-friendly.
4. When you have enough details, set phase to "draft_ready" and include a draftPlan.
5. Always provide 2-4 quick-reply suggestions.
6. If the user asks about app features, explain clearly how to use them.
7. If the user wants to send a message to a group, include it in the draft plan.

CONVERSATION PHASES:
- "idle": No active planning. Ready to help.
- "gathering": Collecting information for a specific task.
- "draft_ready": Present a draft plan for confirmation.

DRAFT PLAN TYPES: workout, event, habit, meal, multi, message, sobriety, special_day, section

For workouts: include title, emoji, duration, cal, tag, exercises with sets/reps, date.
For events: include title, date, time, assignee (me/partner/both), description.
For habits: include title/label, category.
For messages: include groupId, content.
For sobriety: include title/label, icon, startDate.
For sections: include sectionKey, sectionLabel, shared boolean.

Always ask for confirmation before saving: "Here's what I've put together. Want me to save this?"`;

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
          name: "coach_response",
          description: "Respond to the user as the universal AI assistant.",
          parameters: {
            type: "object",
            properties: {
              reply: { type: "string", description: "The conversational reply" },
              phase: {
                type: "string",
                enum: ["gathering", "draft_ready", "confirmed", "idle"],
              },
              context: {
                type: "object",
                properties: {
                  intent: { type: "string" },
                  gathered: { type: "object" },
                  conversationSummary: { type: "string" },
                },
              },
              suggestions: {
                type: "array",
                items: { type: "string" },
              },
              draftPlan: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["workout", "event", "habit", "meal", "multi", "message", "sobriety", "special_day", "section"] },
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        date: { type: "string" },
                        time: { type: "string" },
                        description: { type: "string" },
                        tag: { type: "string" },
                        assignee: { type: "string" },
                        category: { type: "string" },
                        emoji: { type: "string" },
                        duration: { type: "string" },
                        cal: { type: "number" },
                        exercises: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              name: { type: "string" },
                              sets: { type: "number" },
                              reps: { type: "string" },
                            },
                          },
                        },
                        groupId: { type: "string" },
                        content: { type: "string" },
                        icon: { type: "string" },
                        startDate: { type: "string" },
                        moneyPerDay: { type: "number" },
                        sectionKey: { type: "string" },
                        sectionLabel: { type: "string" },
                        shared: { type: "boolean" },
                      },
                      required: ["title"],
                    },
                  },
                },
                required: ["type", "items"],
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
        model: "google/gemini-3-flash-preview",
        messages,
        tools,
        tool_choice: { type: "function", function: { name: "coach_response" } },
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
        reply: content,
        phase: "idle",
        suggestions: ["Plan a workout", "Schedule an event", "Help me set up habits"],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const parsed = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({
      reply: parsed.reply,
      phase: parsed.phase || "idle",
      context: parsed.context || context || {},
      suggestions: parsed.suggestions || [],
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
