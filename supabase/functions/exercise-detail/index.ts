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

    // Run text details and image generation in parallel
    const [textResponse, imageResponse] = await Promise.all([
      // Text details call
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
                    videoSearchQuery: {
                      type: "string",
                      description: "A YouTube search query to find a good demo video for this exercise",
                    },
                  },
                  required: ["steps", "formCues", "commonMistakes", "musclesWorked", "videoSearchQuery"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "exercise_detail" } },
        }),
      }),
      // Image generation call
      fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          messages: [
            {
              role: "user",
              content: `Create a clean, step-by-step fitness illustration for the exercise "${exerciseName}". Show 3-4 sequential frames side by side (left to right) depicting the movement from starting position to ending position, like a comic strip. Each frame should show the same person progressing through the key phases of the movement. Use clean lines, minimal background, subtle muscle group highlights. Style: modern fitness app instructional diagram, not photorealistic. Label each frame (1, 2, 3...).`,
            },
          ],
          modalities: ["image", "text"],
        }),
      }),
    ]);

    // Process text response
    if (!textResponse.ok) {
      const status = textResponse.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limited, try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await textResponse.text();
      console.error("AI text error:", status, t);
      throw new Error("AI gateway error");
    }

    const textData = await textResponse.json();
    const toolCall = textData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in response");
    const parsed = JSON.parse(toolCall.function.arguments);

    // Process image response (non-blocking — if it fails we still return text)
    let imageUrl: string | null = null;
    try {
      if (imageResponse.ok) {
        const imageData = await imageResponse.json();
        imageUrl = imageData.choices?.[0]?.message?.images?.[0]?.image_url?.url || null;
      } else {
        console.error("Image generation failed:", imageResponse.status);
      }
    } catch (imgErr) {
      console.error("Image processing error:", imgErr);
    }

    return new Response(JSON.stringify({ ...parsed, imageUrl }), {
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
