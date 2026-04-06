import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Anniversary {
  artist: string;
  album: string;
  originalDate: string;
  yearsAgo: number;
  year: number;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function parseHtmlAlbumTables(
  html: string,
  year: number
): { month: number; day: number; artist: string; album: string }[] {
  const results: { month: number; day: number; artist: string; album: string }[] = [];

  for (let mi = 0; mi < MONTHS.length; mi++) {
    const monthName = MONTHS[mi];
    const headingRegex = new RegExp(
      `<span[^>]*id=["']${monthName}["'][^>]*>|<h[23][^>]*>[^<]*${monthName}[^<]*</h[23]>`,
      "is"
    );
    const headingMatch = html.match(headingRegex);
    if (!headingMatch || headingMatch.index === undefined) continue;

    const afterHeading = html.slice(headingMatch.index);
    const tableMatch = afterHeading.match(/<table[^>]*class="[^"]*wikitable[^"]*"[^>]*>([\s\S]*?)<\/table>/i);
    if (!tableMatch) continue;

    const tableHtml = tableMatch[1];
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    let currentDay = 0;
    let isHeader = true;

    while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
      if (isHeader) { isHeader = false; continue; }
      const rowContent = rowMatch[1];
      const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      const cells: string[] = [];
      let cellMatch;
      while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
        cells.push(cellMatch[1]);
      }
      if (cells.length < 2) continue;

      const stripHtml = (s: string) =>
        s.replace(/<[^>]+>/g, "")
         .replace(/\[\d+\]/g, "")
         .replace(/&amp;/g, "&")
         .replace(/&nbsp;/g, " ")
         .replace(/&#\d+;/g, "")
         .trim();

      let artist: string;
      let album: string;

      if (cells.length >= 3) {
        const maybeDay = parseInt(stripHtml(cells[0]), 10);
        if (!isNaN(maybeDay) && maybeDay >= 1 && maybeDay <= 31) {
          currentDay = maybeDay;
          artist = stripHtml(cells[1]);
          album = stripHtml(cells[2]);
        } else {
          artist = stripHtml(cells[0]);
          album = stripHtml(cells[1]);
        }
      } else {
        artist = stripHtml(cells[0]);
        album = stripHtml(cells[1]);
      }

      album = album
        .replace(/\(EP\)/gi, "").replace(/\(live album\)/gi, "")
        .replace(/\(covers album\)/gi, "").replace(/\(compilation\)/gi, "")
        .trim();

      if (artist && album && currentDay > 0) {
        results.push({ month: mi + 1, day: currentDay, artist, album });
      }
    }
  }
  return results;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { week_start, years_back = 40 } = body;

    if (!week_start || typeof week_start !== "string") {
      return new Response(
        JSON.stringify({ error: "week_start is required (YYYY-MM-DD)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const currentYear = parseInt(week_start.slice(0, 4), 10);
    const weekStart = new Date(week_start + "T12:00:00Z");

    const weekDates: { date: Date; dateStr: string; month: number; day: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      weekDates.push({ date: d, dateStr: d.toISOString().slice(0, 10), month: d.getMonth() + 1, day: d.getDate() });
    }

    const neededMonths = new Set(weekDates.map(d => d.month));

    const milestoneYears: number[] = [];
    for (let y = 5; y <= years_back; y += 5) milestoneYears.push(currentYear - y);
    for (let y = 1; y <= 4; y++) milestoneYears.push(currentYear - y);

    const allAnniversaries: Anniversary[] = [];

    // Use Wikipedia REST API for HTML (more reliable than scraping)
    const fetchPage = async (year: number): Promise<Anniversary[]> => {
      try {
        // Try REST API first
        const title = `${year}_in_heavy_metal_music`;
        const url = `https://en.wikipedia.org/api/rest_v1/page/html/${title}`;
        const resp = await fetch(url, {
          headers: {
            "User-Agent": "SnakepitBot/1.0 (https://snakepit.lovable.app; editorial tool)",
            "Accept": "text/html",
          },
          signal: AbortSignal.timeout(10000),
        });

        if (!resp.ok) {
          // Fallback to regular page
          const fallbackUrl = `https://en.wikipedia.org/wiki/${title}`;
          const fallbackResp = await fetch(fallbackUrl, {
            headers: { "User-Agent": "SnakepitBot/1.0 (https://snakepit.lovable.app; editorial tool)" },
            signal: AbortSignal.timeout(10000),
          });
          if (!fallbackResp.ok) return [];
          const html = await fallbackResp.text();
          return matchToWeek(parseHtmlAlbumTables(html, year), year);
        }

        const html = await resp.text();
        return matchToWeek(parseHtmlAlbumTables(html, year), year);
      } catch (e) {
        console.error(`Error fetching year ${year}:`, e);
        return [];
      }
    };

    const matchToWeek = (releases: { month: number; day: number; artist: string; album: string }[], year: number): Anniversary[] => {
      const relevant = releases.filter(r => neededMonths.has(r.month));
      const matched: Anniversary[] = [];
      for (const rel of relevant) {
        for (const wd of weekDates) {
          if (rel.month === wd.month && rel.day === wd.day) {
            matched.push({
              artist: rel.artist, album: rel.album,
              originalDate: `${year}-${String(rel.month).padStart(2, "0")}-${String(rel.day).padStart(2, "0")}`,
              yearsAgo: currentYear - year, year,
            });
          }
        }
      }
      return matched;
    };

    // Fetch in batches of 4 to avoid overwhelming
    for (let i = 0; i < milestoneYears.length; i += 4) {
      const batch = milestoneYears.slice(i, i + 4);
      const results = await Promise.all(batch.map(fetchPage));
      for (const r of results) allAnniversaries.push(...r);
    }

    const byDate: Record<string, Anniversary[]> = {};
    for (const wd of weekDates) byDate[wd.dateStr] = [];
    for (const ann of allAnniversaries) {
      for (const wd of weekDates) {
        const annMonth = parseInt(ann.originalDate.slice(5, 7), 10);
        const annDay = parseInt(ann.originalDate.slice(8, 10), 10);
        if (wd.month === annMonth && wd.day === annDay) {
          byDate[wd.dateStr].push(ann);
        }
      }
    }

    for (const key in byDate) {
      byDate[key].sort((a, b) => b.yearsAgo - a.yearsAgo);
    }

    return new Response(
      JSON.stringify({ anniversaries: byDate }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("scrape-anniversaries error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
