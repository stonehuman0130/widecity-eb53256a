import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    if (body.action === "estimate_macros") {
      const systemPrompt = `You are a nutrition expert. Given a food description, estimate the macros. Return ONLY valid JSON with keys: title (cleaned meal name), protein (grams, integer), calories (integer). Be accurate based on typical serving sizes.`;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Estimate macros for: ${body.food_description}` },
          ],
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) throw new Error(`AI error: ${response.status}`);
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "{}";
      const parsed = JSON.parse(content);

      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.action === "suggest_meals") {
      const { protein_goal, protein_consumed, meals_logged, recent_history, date } = body;
      const remaining = protein_goal - protein_consumed;

      const loggedTypes = new Set((meals_logged || []).map((m: any) => m.type));
      const unloggedTypes = ["breakfast", "lunch", "dinner", "snack"].filter(t => !loggedTypes.has(t));

      const recentTitles = (recent_history || []).map((m: any) => m.title).slice(0, 15);

      const systemPrompt = `You are a personalized nutrition AI. Generate meal suggestions that are:
- High protein, practical, and easy to prepare
- Personalized based on user history
- Different from recently eaten meals when possible

User's recently eaten meals: ${JSON.stringify(recentTitles)}
Today's date: ${date}
Protein remaining: ${remaining}g
Meals not yet logged: ${unloggedTypes.join(", ")}

Generate 2-3 meal suggestions. Return ONLY valid JSON:
{
  "suggestions": [
    {
      "meal_type": "lunch",
      "title": "Grilled Chicken Bowl",
      "ingredients": ["300g chicken breast", "1 cup rice", "mixed greens", "avocado"],
      "prep_steps": ["Season and grill chicken", "Cook rice", "Assemble bowl with greens and avocado"],
      "protein": 45,
      "calories": 550,
      "tags": ["high-protein", "quick"]
    }
  ]
}

Prioritize meals for the unlogged meal types. Make suggestions varied and practical.`;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Suggest meals. I need ${remaining}g more protein today. ${unloggedTypes.length > 0 ? `I haven't logged: ${unloggedTypes.join(", ")}` : "I've logged all meal types."}` },
          ],
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) throw new Error(`AI error: ${response.status}`);
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "{}";
      const parsed = JSON.parse(content);

      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-nutrition error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
