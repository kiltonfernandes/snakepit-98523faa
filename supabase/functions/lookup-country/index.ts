import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { artists } = await req.json();
    if (!Array.isArray(artists) || artists.length === 0) {
      return new Response(JSON.stringify({ error: "artists array required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: "API key not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const prompt = `For each of the following metal/rock bands, respond with ONLY the country of origin. If you're not sure, respond with "Unknown".

Format: one line per band, exactly "BandName: Country"

Bands:
${artists.map(a => `- ${a}`).join('\n')}`;

    const response = await fetch("https://api.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("LLM error:", err);
      return new Response(JSON.stringify({ error: "LLM request failed" }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";

    const results: Record<string, string> = {};
    for (const line of text.split("\n")) {
      const match = line.match(/^(.+?):\s*(.+)$/);
      if (match) {
        const artist = match[1].trim().replace(/^-\s*/, "");
        const country = match[2].trim();
        if (country.toLowerCase() !== "unknown") {
          results[artist.toLowerCase()] = country;
        }
      }
    }

    return new Response(JSON.stringify({ results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
