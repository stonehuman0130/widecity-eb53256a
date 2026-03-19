import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function tryRepairJson(text: string): any {
  try {
    // Remove trailing commas before } or ]
    let cleaned = text
      .replace(/,\s*}/g, "}")
      .replace(/,\s*]/g, "]")
      .replace(/[\x00-\x1F\x7F]/g, "");

    // Count braces/brackets to detect truncation
    const openBraces = (cleaned.match(/{/g) || []).length;
    const closeBraces = (cleaned.match(/}/g) || []).length;
    const openBrackets = (cleaned.match(/\[/g) || []).length;
    const closeBrackets = (cleaned.match(/\]/g) || []).length;

    // If truncated, try to close the JSON
    if (openBraces !== closeBraces || openBrackets !== closeBrackets) {
      // Find the last complete object in an array context
      const lastCompleteObj = cleaned.lastIndexOf("}");
      if (lastCompleteObj > 0) {
        cleaned = cleaned.substring(0, lastCompleteObj + 1);
        // Remove any trailing comma
        cleaned = cleaned.replace(/,\s*$/, "");
        // Close remaining open brackets/braces
        const remainingBrackets = (cleaned.match(/\[/g) || []).length - (cleaned.match(/\]/g) || []).length;
        const remainingBraces = (cleaned.match(/{/g) || []).length - (cleaned.match(/}/g) || []).length;
        for (let i = 0; i < remainingBraces; i++) cleaned += "}";
        for (let i = 0; i < remainingBrackets; i++) cleaned += "]";
      }
    }

    return JSON.parse(cleaned);
  } catch (e) {
    console.error("JSON repair failed:", e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, planType: explicitPlanType, startDate } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Auto-detect plan type from natural language if not explicitly provided
    const lowerPrompt = prompt.toLowerCase();
    let planType = explicitPlanType || "today";
    if (!explicitPlanType) {
      if (/\b(month|monthly|4[\s-]?week|30[\s-]?day)\b/.test(lowerPrompt)) {
        planType = "month";
      } else if (/\b(week|weekly|7[\s-]?day|5[\s-]?day|6[\s-]?day)\b/.test(lowerPrompt)) {
        planType = "week";
      }
    }

    const isMultiDay = planType === "week" || planType === "month";
    const isMonthly = planType === "month";
    const daysCount = isMonthly ? 28 : planType === "week" ? 7 : 1;
    const effectiveStartDate = startDate || new Date().toISOString().slice(0, 10);

    // For multi-day plans, compute all dates explicitly so the model doesn't guess
    let dateList = "";
    if (isMultiDay) {
      const dates: string[] = [];
      const start = new Date(effectiveStartDate + "T00:00:00");
      for (let i = 0; i < daysCount; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        dates.push(d.toISOString().slice(0, 10));
      }
      dateList = dates.join(", ");
    }

    const systemPrompt = isMultiDay
      ? `You are a fitness coach. Generate a ${planType === "month" ? "4-week" : "weekly"} workout plan starting from ${effectiveStartDate}. The plan MUST cover exactly ${daysCount} days (one entry per day). ${dateList ? `The exact dates are: ${dateList}.` : ""} Include rest days where appropriate (1-2 per week). For each day provide: date (YYYY-MM-DD), dayLabel (weekday name), isRest (boolean). For workout days provide: title, emoji, duration, cal, tag (e.g. Chest, Legs, Cardio, Full Body), and ${isMonthly ? "3-4" : "4-6"} exercises with sets and reps. ${isMonthly ? "Keep exercise lists concise (max 4 per day). Vary focus across weeks." : ""} Return using the provided tool.`
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

    // Use flash-lite for monthly plans (faster), flash for others
    const model = isMonthly ? "google/gemini-2.5-flash-lite" : "google/gemini-2.5-flash";
    
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: isMonthly ? 12000 : 8000,
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
        console.error("Tool call parse failed, attempting repair:", e);
        parsed = tryRepairJson(toolCall.function.arguments);
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
          console.error("Content JSON parse failed, attempting repair:", e);
          parsed = tryRepairJson(jsonMatch[0]);
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
