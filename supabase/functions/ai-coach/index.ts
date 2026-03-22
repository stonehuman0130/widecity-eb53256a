import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Phase = "gathering" | "draft_ready" | "confirmed" | "idle";

interface CoachContext {
  intent?: string; // "workout", "schedule", "habit", "meal", "general"
  gathered?: Record<string, string>;
  draftPlan?: any;
  conversationSummary?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { message, groupId, conversationHistory, phase, context, timezone } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const userTz = timezone || "America/New_York";
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    const currentPhase: Phase = phase || "idle";
    const currentContext: CoachContext = context || {};

    // Build the system prompt based on the current phase
    const systemPrompt = buildSystemPrompt(currentPhase, currentContext, todayStr, userTz);

    const messages: any[] = [{ role: "system", content: systemPrompt }];

    // Add conversation history
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
          description: "Respond to the user as an AI coach. Use this for all responses.",
          parameters: {
            type: "object",
            properties: {
              reply: { type: "string", description: "The conversational reply to show the user" },
              phase: {
                type: "string",
                enum: ["gathering", "draft_ready", "confirmed", "idle"],
                description: "The current conversation phase after this response",
              },
              context: {
                type: "object",
                description: "Updated context with gathered info, intent, draft plan etc",
                properties: {
                  intent: { type: "string", enum: ["workout", "schedule", "habit", "meal", "general"] },
                  gathered: {
                    type: "object",
                    description: "Key-value pairs of info gathered so far (goal, days_per_week, experience_level, focus_area, duration, date, time, title, etc)",
                  },
                  conversationSummary: { type: "string", description: "Brief summary of what's been discussed" },
                },
              },
              suggestions: {
                type: "array",
                items: { type: "string" },
                description: "2-4 quick-reply suggestions for the user",
              },
              draftPlan: {
                type: "object",
                description: "Only set when phase is draft_ready. The proposed plan to show the user.",
                properties: {
                  type: { type: "string", enum: ["workout", "event", "habit", "meal", "multi"] },
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
                        assignee: { type: "string", enum: ["me", "partner", "both"] },
                        category: { type: "string" },
                        // Workout-specific
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
      console.error("AI coach error:", status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      // Fallback to content
      const content = data.choices?.[0]?.message?.content || "I'm here to help! What would you like to plan?";
      return new Response(JSON.stringify({
        reply: content,
        phase: "idle",
        suggestions: ["Plan a workout", "Schedule an event", "Add a habit"],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const parsed = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({
      reply: parsed.reply,
      phase: parsed.phase || "idle",
      context: parsed.context || currentContext,
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

function buildSystemPrompt(phase: Phase, context: CoachContext, todayStr: string, timezone: string): string {
  const base = `You are a friendly, knowledgeable AI life coach inside a shared planning app. Today is ${todayStr}. User timezone: ${timezone}.

You help users plan workouts, schedule events, create habits, and organize their life. You are warm, encouraging, and ask smart follow-up questions to create the best plan.

CRITICAL RULES:
1. NEVER immediately create/save items when a request is vague or missing key details.
2. Always gather enough information through natural conversation FIRST.
3. Only move to "draft_ready" phase when you have enough details to create a concrete plan.
4. Keep responses concise and mobile-friendly (short paragraphs, use emojis sparingly).

CONVERSATION PHASES:
- "idle": No active planning. Greet or ask what they want to do.
- "gathering": Actively collecting information. Ask follow-up questions.
- "draft_ready": You have enough info. Present a draft plan for confirmation.
- "confirmed": User confirmed the plan. Items will be saved.

WHEN THE USER WANTS TO PLAN A WORKOUT:
Ask about (if not already provided):
1. Goal/focus area (strength, muscle gain, weight loss, endurance, flexibility)
2. Target body area (upper body, lower body, full body, core, specific muscle groups)
3. Experience level (beginner, intermediate, advanced)
4. How many days per week
5. Session duration preference
6. Any equipment available or limitations
You don't need ALL of these — use judgment. If someone says "give me a chest workout", you know the focus area already.

WHEN THE USER WANTS TO SCHEDULE SOMETHING:
Ask about (if not already provided):
1. What exactly they want to schedule
2. Date and time
3. Who it's for (me, partner, both)

WHEN THE USER WANTS TO ADD HABITS:
Ask about (if not already provided):
1. What habit
2. Which time of day / category
3. Whether to share with group

FOR MEAL PLANS:
Ask about dietary preferences, restrictions, goals, and how many meals/days.

DRAFT PLAN FORMAT:
When you have enough info, set phase to "draft_ready" and include a draftPlan object with concrete items.
For workouts: include title, emoji, duration, estimated calories, tag, and exercises with sets/reps.
For events: include title, date, time, assignee.
For habits: include title/label, category.

Ask the user to confirm before saving: "Here's what I've put together. Want me to save this?"

SUGGESTIONS:
Always provide 2-4 quick-reply suggestions that make sense in context.`;

  if (phase === "gathering" && context.conversationSummary) {
    return base + `\n\nCONVERSATION SO FAR:\n${context.conversationSummary}\n\nGathered info: ${JSON.stringify(context.gathered || {})}`;
  }

  return base;
}
