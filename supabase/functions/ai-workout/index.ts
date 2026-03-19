import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, planType, startDate } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const isMultiDay = planType === "week" || planType === "month";
    const daysCount = planType === "month" ? 30 : planType === "week" ? 7 : 1;

    // For monthly plans, compute all dates explicitly so the model doesn't guess
    let dateList = "";
    if (isMultiDay && startDate) {
      const dates: string[] = [];
      const start = new Date(startDate + "T00:00:00");
      for (let i = 0; i < daysCount; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        dates.push(d.toISOString().slice(0, 10));
      }
      dateList = dates.join(", ");
    }

    const systemPrompt = isMultiDay
      ? `You are a fitness coach. Generate a ${planType}ly workout plan starting from ${startDate || "today"}. The plan MUST cover exactly ${daysCount} days (one entry per day). ${dateList ? `The exact dates are: ${dateList}.` : ""} Include rest days where appropriate (typically 1-2 per week). For each day, provide: the date (YYYY-MM-DD format), dayLabel, isRest flag, and if not rest, a workout with title, emoji, duration estimate, calorie estimate, tag (e.g. Chest, Legs, Cardio, Full Body), and a list of exercises with sets and reps. For a monthly plan, vary the focus across the weeks with progressive overload. Return using the provided tool.`
      : "You are a fitness coach. Generate 2-3 workout plan options based on the user's request. Each plan should have a title, emoji, duration estimate, calorie estimate, tag (e.g. Chest, Legs, Cardio, Full Body), and a list of exercises with sets and reps. Return using the provided tool.";

    const tools = isMultiDay
      ? [
          {
            type: "function",
            function: {
              name: "suggest_weekly_plan",
              description: `Return a ${planType}ly workout plan organized by date`,
              parameters: {
                type: "object",
                properties: {
                  days: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        date: { type: "string", description: "YYYY-MM-DD" },
                        dayLabel: { type: "string", description: "e.g. Monday, Tuesday" },
                        isRest: { type: "boolean" },
                        workout: {
                          type: "object",
                          properties: {
                            title: { type: "string" },
                            emoji: { type: "string" },
                            duration: { type: "string" },
                            cal: { type: "number" },
                            tag: { type: "string" },
                            exercises: {
                              type: "array",
                              items: {
                                type: "object",
                                properties: {
                                  name: { type: "string" },
                                  sets: { type: "number" },
                                  reps: { type: "string" },
                                },
                                required: ["name", "sets", "reps"],
                                additionalProperties: false,
                              },
                            },
                          },
                          required: ["title", "emoji", "duration", "cal", "tag", "exercises"],
                          additionalProperties: false,
                        },
                      },
                      required: ["date", "dayLabel", "isRest"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["days"],
                additionalProperties: false,
              },
            },
          },
        ]
      : [
          {
            type: "function",
            function: {
              name: "suggest_workouts",
              description: "Return 2-3 workout plan options",
              parameters: {
                type: "object",
                properties: {
                  plans: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        emoji: { type: "string" },
                        duration: { type: "string", description: "e.g. 45 min" },
                        cal: { type: "number" },
                        tag: { type: "string" },
                        exercises: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              name: { type: "string" },
                              sets: { type: "number" },
                              reps: { type: "string" },
                            },
                            required: ["name", "sets", "reps"],
                            additionalProperties: false,
                          },
                        },
                      },
                      required: ["title", "emoji", "duration", "cal", "tag", "exercises"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["plans"],
                additionalProperties: false,
              },
            },
          },
        ];

    const toolChoice = isMultiDay
      ? { type: "function", function: { name: "suggest_weekly_plan" } }
      : { type: "function", function: { name: "suggest_workouts" } };

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        max_tokens: 16000,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        tools,
        tool_choice: toolChoice,
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
    let parsed;

    // Try tool_calls first
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        parsed = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        console.error("Tool call parse failed:", e);
      }
    }

    // Fallback: parse JSON from content
    if (!parsed) {
      const content = data.choices?.[0]?.message?.content || "";
      let cleaned = content.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      }
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch (e) {
          console.error("Content JSON parse failed:", e);
        }
      }
    }

    if (!parsed) throw new Error("Could not extract structured data from AI response");

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-workout error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
