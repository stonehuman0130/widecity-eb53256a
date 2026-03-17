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

    // Run text detail + image generation in parallel
    const [textResponse, imageResponse] = await Promise.all([
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
      // Image generation
      fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: "google/gemini-3.1-flash-image-preview",
          messages: [
            {
              role: "user",
              content: `Generate a clean, simple fitness illustration showing proper form for the exercise: "${exerciseName}". Show a person demonstrating the correct starting and ending positions. Use a minimal, clean style with a white background. No text or labels.`,
            },
          ],
        }),
      }).catch(() => null), // Don't fail if image gen fails
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

    // Try tool_calls first
    const toolCall = textData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        parsed = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        console.error("Tool call parse failed:", e);
      }
    }

    // Fallback: parse from content
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

    // Parse image response
    let imageDataUrl: string | null = null;
    if (imageResponse && imageResponse.ok) {
      try {
        const imageData = await imageResponse.json();
        const msg = imageData.choices?.[0]?.message;
        console.log("Image response structure:", JSON.stringify(msg).substring(0, 500));

        // Check for inline_data in parts (Gemini native format)
        if (msg?.content && Array.isArray(msg.content)) {
          for (const part of msg.content) {
            if (part?.type === "image_url" && part?.image_url?.url) {
              imageDataUrl = part.image_url.url;
              break;
            }
            if (part?.inline_data?.data) {
              const mime = part.inline_data.mime_type || "image/png";
              imageDataUrl = `data:${mime};base64,${part.inline_data.data}`;
              break;
            }
          }
        }

        // Check content as string for base64
        if (!imageDataUrl && typeof msg?.content === "string") {
          const b64Match = msg.content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
          if (b64Match) {
            imageDataUrl = b64Match[0];
          }
        }
      } catch (e) {
        console.error("Image parse error:", e);
      }
    } else if (imageResponse) {
      // Consume body to prevent leak
      try { await imageResponse.text(); } catch (_) {}
    }

    return new Response(JSON.stringify({ ...parsed, imageDataUrl }), {
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
