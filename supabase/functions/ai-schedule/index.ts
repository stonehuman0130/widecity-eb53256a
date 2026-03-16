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
            content: `You are a scheduling and habit assistant. Today is ${todayStr} (${dayOfWeek}). 

Determine if the user wants to:
1. ADD A HABIT - keywords like "add ... to my habits", "morning habit", "daily habit", "routine"
2. SCHEDULE AN EVENT/TASK - anything with a date, time, or deadline

For habits: extract the habit name and category (morning or other).
For events: extract title, date (YYYY-MM-DD), time (like "2:00 PM"), and description.

IMPORTANT date rules:
- "today" = ${todayStr}
- "tomorrow" = the next day after today
- Day names like "Tuesday" = the next upcoming occurrence of that day
- If a specific time is mentioned (e.g. "2 pm", "3:00"), ALWAYS include it in the time field
- If no date is mentioned, assume today

Use the appropriate tool based on what the user wants.`,
          },
          { role: "user", content: text },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "create_event",
              description: "Create a calendar event or scheduled task",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string", description: "Event title" },
                  date: { type: "string", description: "Date in YYYY-MM-DD format" },
                  time: { type: "string", description: "Time like '2:00 PM'. Must be set if user mentions a specific time." },
                  description: { type: "string", description: "Brief description if any" },
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
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in response");

    const parsed = JSON.parse(toolCall.function.arguments);
    const functionName = toolCall.function.name;

    return new Response(JSON.stringify({ type: functionName, ...parsed }), {
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
