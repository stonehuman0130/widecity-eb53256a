import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { exerciseName } = await req.json();
    if (!exerciseName) throw new Error("exerciseName is required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const headers = {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    };

    // Run text detail + SVG illustration in parallel
    const [textResponse, svgResponse] = await Promise.all([
      // Text details
      fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content: "You are a certified personal trainer. Given an exercise name, provide detailed guidance for performing it safely and effectively. Return data using the provided tool.",
            },
            { role: "user", content: `Tell me how to do: ${exerciseName}` },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "exercise_detail",
                description: "Return detailed exercise guidance",
                parameters: {
                  type: "object",
                  properties: {
                    steps: {
                      type: "array",
                      items: { type: "string" },
                      description: "Step-by-step instructions (4-6 steps)",
                    },
                    formCues: {
                      type: "array",
                      items: { type: "string" },
                      description: "3-4 key form cues to remember",
                    },
                    commonMistakes: {
                      type: "array",
                      items: { type: "string" },
                      description: "3-4 common mistakes to avoid",
                    },
                    musclesWorked: {
                      type: "array",
                      items: { type: "string" },
                      description: "Primary and secondary muscles worked",
                    },
                  },
                  required: ["steps", "formCues", "commonMistakes", "musclesWorked"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "exercise_detail" } },
        }),
      }),
      // SVG illustration
      fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content: `You are an SVG illustrator specializing in fitness diagrams. Generate a clean, minimal SVG illustration showing proper form for exercises. Rules:
- Output ONLY the raw SVG markup, nothing else - no markdown, no code blocks, no explanation
- Use a 400x300 viewBox
- Use simple stick figures or geometric shapes to show the exercise position
- Use a clean color palette: #6366f1 for the figure, #e5e7eb for guidelines/ground, #f97316 for muscle highlight areas
- Show 1-2 key positions of the exercise (start/end)
- Include simple arrows showing movement direction
- Keep it minimal and clear - no text labels
- The SVG must be valid and self-contained`,
            },
            { role: "user", content: `Generate an SVG illustration for: ${exerciseName}` },
          ],
        }),
      }).catch(() => null),
    ]);

    // Parse text response
    if (!textResponse.ok) {
      const status = textResponse.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limited, try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await textResponse.text();
      console.error("AI text error:", status, t);
      throw new Error("AI gateway error");
    }

    const textData = await textResponse.json();
    let parsed;

    const toolCall = textData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        parsed = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        console.error("Tool call parse failed:", e);
      }
    }

    if (!parsed) {
      const content = textData.choices?.[0]?.message?.content || "";
      let cleaned = content.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      }
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try { parsed = JSON.parse(jsonMatch[0]); } catch (e) { console.error("Content parse failed:", e); }
      }
    }

    if (!parsed) throw new Error("Could not extract exercise details from AI response");

    // Parse SVG response
    let svgDataUrl: string | null = null;
    if (svgResponse && svgResponse.ok) {
      try {
        const svgData = await svgResponse.json();
        let svgContent = svgData.choices?.[0]?.message?.content || "";
        
        // Strip markdown code blocks if present
        svgContent = svgContent.trim();
        if (svgContent.startsWith("```")) {
          svgContent = svgContent.replace(/^```(?:svg|xml)?\n?/, "").replace(/\n?```$/, "");
        }
        
        // Extract just the SVG tag
        const svgMatch = svgContent.match(/<svg[\s\S]*<\/svg>/i);
        if (svgMatch) {
          const cleanSvg = svgMatch[0];
          // Convert to data URI
          svgDataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(cleanSvg)))}`;
        }
      } catch (e) {
        console.error("SVG parse error:", e);
      }
    } else if (svgResponse) {
      try { await svgResponse.text(); } catch (_) {}
    }

    return new Response(JSON.stringify({ ...parsed, imageDataUrl: svgDataUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("exercise-detail error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
