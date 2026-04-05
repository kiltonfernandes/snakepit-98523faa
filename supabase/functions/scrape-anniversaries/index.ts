import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Anniversary {
  artist: string;
  album: string;
  originalDate: string;     // YYYY-MM-DD
  yearsAgo: number;
  year: number;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Parse the Wikipedia "YYYY in heavy metal music" page markdown to extract
 * album releases. The markdown tables look like:
 *
 * ### March
 * | Day | Artist | Album |
 * | --- | --- | --- |
 * | 6 | [Blackbraid](...) | _Nocturnal Womb_ (EP)[77] |
 * | [Erra](...) | _Silence Outlives the Earth_[79] |   ← day inherited from previous row
 */
function parseWikiPage(markdown: string, year: number): { month: number; day: number; artist: string; album: string }[] {
  const results: { month: number; day: number; artist: string; album: string }[] = [];

  // Split by month headers
  for (let mi = 0; mi < MONTHS.length; mi++) {
    const monthName = MONTHS[mi];
    // Find the section for this month
    const headerPattern = new RegExp(`###\\s*${monthName}\\b`, "i");
    const headerMatch = markdown.match(headerPattern);
    if (!headerMatch || headerMatch.index === undefined) continue;

    const startIdx = headerMatch.index;
    // Find next ### or ## header
    const rest = markdown.slice(startIdx + headerMatch[0].length);
    const nextHeader = rest.match(/\n##/);
    const section = nextHeader && nextHeader.index !== undefined
      ? rest.slice(0, nextHeader.index)
      : rest;

    // Parse table rows
    const lines = section.split("\n");
    let currentDay = 0;

    for (const line of lines) {
      // Skip non-table lines and header/separator rows
      if (!line.startsWith("|")) continue;
      const cells = line.split("|").map(c => c.trim()).filter(c => c.length > 0);
      if (cells.length < 2) continue;
      if (cells[0] === "Day" || cells[0] === "---") continue;

      let artist: string;
      let album: string;

      if (cells.length >= 3) {
        // Could be: Day | Artist | Album   OR   Artist | Album | extra
        const maybeDay = parseInt(cells[0], 10);
        if (!isNaN(maybeDay) && maybeDay >= 1 && maybeDay <= 31) {
          currentDay = maybeDay;
          artist = cells[1];
          album = cells[2];
        } else {
          // No day number — inherits previous day
          artist = cells[0];
          album = cells[1];
        }
      } else {
        // 2 cells: Artist | Album
        artist = cells[0];
        album = cells[1];
      }

      if (!artist! || !album!) continue;

      // Clean markdown links: [Text](url) → Text
      const cleanMd = (s: string) =>
        s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
         .replace(/_/g, "")
         .replace(/\[\d+\]/g, "")
         .replace(/\\\[.*?\\\]/g, "")
         .trim();

      const cleanArtist = cleanMd(artist);
      const cleanAlbum = cleanMd(album)
        .replace(/\(EP\)/gi, "")
        .replace(/\(live album\)/gi, "")
        .replace(/\(covers album\)/gi, "")
        .replace(/\(compilation\)/gi, "")
        .trim();

      if (cleanArtist && cleanAlbum && currentDay > 0) {
        results.push({
          month: mi + 1,
          day: currentDay,
          artist: cleanArtist,
          album: cleanAlbum,
        });
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
    // week_start: YYYY-MM-DD (Monday), we look for anniversaries Mon-Sat
    const { week_start, years_back = 40 } = body;

    if (!week_start || typeof week_start !== "string") {
      return new Response(
        JSON.stringify({ error: "week_start is required (YYYY-MM-DD)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const currentYear = parseInt(week_start.slice(0, 4), 10);
    const weekStart = new Date(week_start + "T12:00:00Z");

    // Build date range Mon-Sat (6 days)
    const weekDates: { date: Date; dateStr: string; month: number; day: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      weekDates.push({
        date: d,
        dateStr: d.toISOString().slice(0, 10),
        month: d.getMonth() + 1,
        day: d.getDate(),
      });
    }

    // Determine which months we need to check
    const neededMonths = new Set(weekDates.map(d => d.month));

    // Fetch Wikipedia pages for milestone years (5, 10, 15, 20, 25, 30, 35, 40 years ago)
    const milestoneYears: number[] = [];
    for (let y = 5; y <= years_back; y += 5) {
      milestoneYears.push(currentYear - y);
    }
    // Also check recent years for notable releases (1-4 years)
    for (let y = 1; y <= 4; y++) {
      milestoneYears.push(currentYear - y);
    }

    const allAnniversaries: Anniversary[] = [];

    // Fetch pages in parallel (batch of 5)
    const batches: number[][] = [];
    for (let i = 0; i < milestoneYears.length; i += 5) {
      batches.push(milestoneYears.slice(i, i + 5));
    }

    for (const batch of batches) {
      const fetches = batch.map(async (year) => {
        try {
          const url = `https://en.wikipedia.org/wiki/${year}_in_heavy_metal_music`;
          const resp = await fetch(url, {
            headers: { "User-Agent": "SnakepitBot/1.0 (editorial tool)" },
          });
          if (!resp.ok) return [];

          const html = await resp.text();

          // Convert HTML tables to a simpler format we can parse
          // Extract the "Albums" or "Albums expected" section tables
          const releases = parseHtmlAlbumTables(html, year);

          // Filter to only the months we need
          const relevant = releases.filter(r => neededMonths.has(r.month));

          // Match against our week dates
          const matched: Anniversary[] = [];
          for (const rel of relevant) {
            for (const wd of weekDates) {
              if (rel.month === wd.month && rel.day === wd.day) {
                matched.push({
                  artist: rel.artist,
                  album: rel.album,
                  originalDate: `${year}-${String(rel.month).padStart(2, "0")}-${String(rel.day).padStart(2, "0")}`,
                  yearsAgo: currentYear - year,
                  year,
                });
              }
            }
          }
          return matched;
        } catch {
          return [];
        }
      });

      const results = await Promise.all(fetches);
      for (const r of results) allAnniversaries.push(...r);
    }

    // Group by date
    const byDate: Record<string, Anniversary[]> = {};
    for (const wd of weekDates) {
      byDate[wd.dateStr] = [];
    }
    for (const ann of allAnniversaries) {
      // Find which week date this anniversary falls on
      for (const wd of weekDates) {
        const annMonth = parseInt(ann.originalDate.slice(5, 7), 10);
        const annDay = parseInt(ann.originalDate.slice(8, 10), 10);
        if (wd.month === annMonth && wd.day === annDay) {
          byDate[wd.dateStr].push(ann);
        }
      }
    }

    // Sort each day's anniversaries by yearsAgo descending (oldest first = most notable)
    for (const key in byDate) {
      byDate[key].sort((a, b) => b.yearsAgo - a.yearsAgo);
    }

    return new Response(
      JSON.stringify({ anniversaries: byDate }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * Parse HTML directly for album tables. Wikipedia HTML has tables with
 * class="wikitable" inside the Albums section.
 */
function parseHtmlAlbumTables(
  html: string,
  year: number
): { month: number; day: number; artist: string; album: string }[] {
  const results: { month: number; day: number; artist: string; album: string }[] = [];

  // Find each month section by looking for <h3> with month name
  for (let mi = 0; mi < MONTHS.length; mi++) {
    const monthName = MONTHS[mi];
    // Look for the month heading
    const headingRegex = new RegExp(
      `<h3[^>]*>.*?<span[^>]*id="${monthName}"[^>]*>.*?</h3>|<h3[^>]*>.*?${monthName}.*?</h3>`,
      "is"
    );
    const headingMatch = html.match(headingRegex);
    if (!headingMatch || headingMatch.index === undefined) continue;

    // Extract the table after this heading
    const afterHeading = html.slice(headingMatch.index);
    const tableMatch = afterHeading.match(/<table[^>]*class="[^"]*wikitable[^"]*"[^>]*>([\s\S]*?)<\/table>/i);
    if (!tableMatch) continue;

    const tableHtml = tableMatch[1];

    // Parse table rows
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    let currentDay = 0;
    let isHeader = true;

    while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
      if (isHeader) {
        isHeader = false;
        continue; // Skip header row
      }

      const rowContent = rowMatch[1];
      const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      const cells: string[] = [];
      let cellMatch;
      // Also capture rowspan
      const rowspanRegex = /<td[^>]*rowspan="(\d+)"[^>]*>([\s\S]*?)<\/td>/i;

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

      // Clean album title
      album = album
        .replace(/\(EP\)/gi, "")
        .replace(/\(live album\)/gi, "")
        .replace(/\(covers album\)/gi, "")
        .replace(/\(compilation\)/gi, "")
        .trim();

      if (artist && album && currentDay > 0) {
        results.push({ month: mi + 1, day: currentDay, artist, album });
      }
    }
  }

  return results;
}
