import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NEWS_SOURCES = [
  { name: "Blabbermouth", url: "https://www.blabbermouth.net/feed/", type: "rss" },
  { name: "MetalSucks", url: "https://www.metalsucks.net/feed/", type: "rss" },
  { name: "Metal Injection", url: "https://metalinjection.net/feed", type: "rss" },
  { name: "Whiplash", url: "https://whiplash.net/rss/rss.xml", type: "rss" },
  { name: "Louder Sound", url: "https://www.loudersound.com/feeds/all", type: "rss" },
];

interface NewsItem {
  title: string;
  link: string;
  source: string;
  pubDate?: string;
  snippet?: string;
}

async function fetchRSS(source: { name: string; url: string }): Promise<NewsItem[]> {
  try {
    const resp = await fetch(source.url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SnakepitBot/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return [];
    const xml = await resp.text();

    const items: NewsItem[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && items.length < 30) {
      const block = match[1];
      const title = block.match(/<title><!\[CDATA\[(.*?)\]\]>|<title>(.*?)<\/title>/)?.[1] || block.match(/<title>(.*?)<\/title>/)?.[1] || "";
      const link = block.match(/<link>(.*?)<\/link>/)?.[1] || "";
      const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || "";
      const desc = block.match(/<description><!\[CDATA\[(.*?)\]\]>|<description>(.*?)<\/description>/)?.[1] || "";
      const snippet = desc.replace(/<[^>]+>/g, "").slice(0, 200);

      if (title) {
        items.push({
          title: title.replace(/<!\[CDATA\[|\]\]>/g, "").trim(),
          link: link.trim(),
          source: source.name,
          pubDate,
          snippet,
        });
      }
    }
    return items;
  } catch (e) {
    console.error(`Error fetching ${source.name}:`, e);
    return [];
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { week_start, max_per_day = 3 } = body;

    if (!week_start) {
      return new Response(JSON.stringify({ error: "week_start is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: "API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Calculate week dates (Mon-Sat)
    const startDate = new Date(week_start + "T12:00:00Z");
    const weekDates: string[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      weekDates.push(d.toISOString().slice(0, 10));
    }

    // Fetch news from all sources in parallel
    const allResults = await Promise.all(NEWS_SOURCES.map((s) => fetchRSS(s)));
    const allNews = allResults.flat();

    if (allNews.length === 0) {
      return new Response(JSON.stringify({ news: {}, raw_count: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build compact news list for the LLM
    const newsLines = allNews
      .slice(0, 80)
      .map((n, i) => `${i + 1}. [${n.source}] ${n.title} | ${n.link}${n.snippet ? " | " + n.snippet : ""}`)
      .join("\n");

    const prompt = `You are a metal/rock news editor for a Brazilian podcast called "Snakepit". 
Given the following list of recent metal/rock news headlines from various sources, select the most interesting and relevant news for a heavy metal podcast.

For each day of this week (${weekDates.join(", ")}), pick up to ${max_per_day} news items that would make good talking points. Prefer:
- Tour/concert announcements
- New album/single releases and announcements
- Band member changes, reunions, breakups
- Controversies and drama
- Deaths or tributes
- Award shows and charting milestones

AVOID:
- Repetitive or duplicate stories
- Minor/irrelevant news
- Clickbait without substance

Respond in this EXACT JSON format (no markdown, no code blocks):
{
  "days": {
    "YYYY-MM-DD": [
      { "title": "headline summary in Portuguese", "link": "url", "source": "source name", "why": "1 sentence why this is relevant" }
    ]
  }
}

NEWS LIST:
${newsLines}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("LLM error:", response.status, err);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit excedido, tente novamente." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "LLM request failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";

    // Parse JSON from response (strip markdown code fences if present)
    let parsed: any = {};
    try {
      const jsonStr = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse LLM response:", text);
      return new Response(JSON.stringify({ error: "Failed to parse AI response", raw: text }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        news: parsed.days || {},
        raw_count: allNews.length,
        sources: NEWS_SOURCES.map((s) => s.name),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
