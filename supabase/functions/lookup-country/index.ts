import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    
    // Support both legacy { artists } and new { releases } format
    let entries: { artist: string; album?: string; release_date?: string; genres?: string[] }[] = [];
    
    if (Array.isArray(body.releases) && body.releases.length > 0) {
      entries = body.releases;
    } else if (Array.isArray(body.artists) && body.artists.length > 0) {
      entries = body.artists.map((a: string) => ({ artist: a }));
    } else {
      return new Response(JSON.stringify({ error: "releases or artists array required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: "API key not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const lines = entries.map(e => {
      let line = `- ${e.artist}`;
      if (e.album) line += ` — "${e.album}"`;
      if (e.genres && e.genres.length > 0) line += ` (${e.genres.join(', ')})`;
      if (e.release_date) line += ` [${e.release_date}]`;
      return line;
    });

    const prompt = `For each of the following metal/rock bands, respond with ONLY the country of origin. Use the album, genre, and date as additional context to identify the correct band if there are multiple bands with the same name. If you're not sure, respond with "Unknown".

Format: one line per band, exactly "BandName: Country"
Use full country names in English (e.g. "United States", "Sweden", "Brazil").

Bands:
${lines.join('\n')}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
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
        const artist = match[1].trim().replace(/^-\s*/, "").replace(/\*+/g, "");
        const country = match[2].trim().replace(/\*+/g, "");
        if (country.toLowerCase() !== "unknown") {
          results[artist.toLowerCase()] = country;
        }
      }
    }

    return new Response(JSON.stringify({ results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
