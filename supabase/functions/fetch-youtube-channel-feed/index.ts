// Fetches a YouTube channel's RSS feed and returns a list of recent videos.
// Also resolves channel URLs to feed URLs when possible.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  Cookie: "CONSENT=YES+cb.20210328-17-p0.en+FX+000",
};

async function fetchWithTimeout(url: string, ms = 10_000, extraHeaders: Record<string,string> = {}): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { headers: { ...BROWSER_HEADERS, ...extraHeaders }, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function extractChannelIdFromHtml(html: string): string | null {
  const patterns = [
    /"channelId":"(UC[A-Za-z0-9_-]{22})"/,
    /<meta itemprop="(?:identifier|channelId)" content="(UC[A-Za-z0-9_-]{22})"/,
    /<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})"/,
    /"externalId":"(UC[A-Za-z0-9_-]{22})"/,
    /"browseId":"(UC[A-Za-z0-9_-]{22})"/,
  ];
  for (const p of patterns) {
    const m = p.exec(html);
    if (m) return m[1];
  }
  return null;
}

async function resolveChannelIdFromUrl(rawUrl: string): Promise<string | null> {
  const url = rawUrl.trim();
  if (!url) return null;
  const direct = /youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})/.exec(url);
  if (direct) return direct[1];
  try {
    const r = await fetchWithTimeout(url);
    if (r.ok) {
      const html = await r.text();
      const cid = extractChannelIdFromHtml(html);
      if (cid) { console.log("[yt] resolved via page HTML", url, "->", cid); return cid; }
    }
  } catch (e) { console.log("[yt] page fetch failed", url, String(e)); }
  const handleMatch = /youtube\.com\/(@[^/?#]+)/.exec(url);
  if (handleMatch) {
    const aboutUrl = `https://www.youtube.com/${handleMatch[1]}/about`;
    try {
      const r = await fetchWithTimeout(aboutUrl);
      if (r.ok) {
        const html = await r.text();
        const cid = extractChannelIdFromHtml(html);
        if (cid) { console.log("[yt] resolved via /about ->", cid); return cid; }
      }
    } catch (e) { console.log("[yt] /about fetch failed", String(e)); }
  }
  try {
    const apiKey = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
    const r = await fetch(
      `https://www.youtube.com/youtubei/v1/navigation/resolve_url?key=${apiKey}`,
      {
        method: "POST",
        headers: { ...BROWSER_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({
          context: { client: { clientName: "WEB", clientVersion: "2.20240101.00.00", hl: "en", gl: "US" } },
          url,
        }),
      },
    );
    if (r.ok) {
      const j: any = await r.json();
      const cid = j?.endpoint?.browseEndpoint?.browseId
        || (j?.endpoint?.commandMetadata?.webCommandMetadata?.url || "").match?.(/\/channel\/(UC[A-Za-z0-9_-]{22})/)?.[1];
      if (cid && /^UC/.test(cid)) { console.log("[yt] resolved via resolve_url ->", cid); return cid; }
    }
  } catch (e) { console.log("[yt] resolve_url failed", String(e)); }
  return null;
}

function approxDateFromRelative(txt: string): string {
  if (!txt) return "";
  const m = /(\d+)\s+(second|minute|hour|day|week|month|year)s?/i.exec(txt);
  if (!m) return "";
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const msPer: Record<string, number> = {
    second: 1000, minute: 60_000, hour: 3_600_000, day: 86_400_000,
    week: 7 * 86_400_000, month: 30 * 86_400_000, year: 365 * 86_400_000,
  };
  const ms = (msPer[unit] || 0) * n;
  return new Date(Date.now() - ms).toISOString();
}

async function scrapeVideosPageFromChannelUrl(channelUrl: string) {
  const base = channelUrl.replace(/\/+$/, "");
  const videosUrl = base.includes("/channel/") || base.includes("/@") ? `${base}/videos` : base;
  try {
    const r = await fetchWithTimeout(videosUrl, 12_000);
    if (!r.ok) return [];
    const html = await r.text();
    const m = /var ytInitialData = (\{[\s\S]+?\});<\/script>/.exec(html)
      || /ytInitialData"?\s*[:=]\s*(\{[\s\S]+?\})\s*;\s*<\/script>/.exec(html);
    if (!m) return [];
    let data: any;
    try { data = JSON.parse(m[1]); } catch { return []; }
    const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
    let items: any[] = [];
    for (const t of tabs) {
      const contents = t?.tabRenderer?.content?.richGridRenderer?.contents;
      if (Array.isArray(contents) && contents.length) { items = contents; break; }
    }
    const out: Array<{ video_id: string; title: string; description: string; published_at: string; video_url: string }> = [];
    for (const it of items) {
      const v = it?.richItemRenderer?.content?.videoRenderer;
      if (!v?.videoId) continue;
      const title = v.title?.runs?.[0]?.text || v.title?.simpleText || "";
      const publishedTxt: string = v.publishedTimeText?.simpleText || "";
      const desc = (v.descriptionSnippet?.runs || []).map((rr: any) => rr.text).join("") || "";
      out.push({
        video_id: v.videoId,
        title,
        description: desc,
        published_at: approxDateFromRelative(publishedTxt),
        video_url: `https://www.youtube.com/watch?v=${v.videoId}`,
      });
    }
    return out;
  } catch (e) {
    console.log("[yt] scrape /videos failed", String(e));
    return [];
  }
}

function extractTag(xml: string, tag: string, start = 0): { value: string; end: number } | null {
  const open = xml.indexOf(`<${tag}`, start);
  if (open === -1) return null;
  const gt = xml.indexOf(">", open);
  const close = xml.indexOf(`</${tag}>`, gt);
  if (close === -1) return null;
  return { value: xml.slice(gt + 1, close), end: close + tag.length + 3 };
}

function extractAttr(fragment: string, attr: string): string | null {
  const re = new RegExp(`${attr}="([^"]+)"`);
  const m = re.exec(fragment);
  return m ? m[1] : null;
}

function parseFeed(xml: string) {
  const items: Array<{
    video_id: string;
    title: string;
    description: string;
    published_at: string;
    video_url: string;
  }> = [];
  let cursor = 0;
  while (cursor < xml.length) {
    const entryStart = xml.indexOf("<entry", cursor);
    if (entryStart === -1) break;
    const entryEnd = xml.indexOf("</entry>", entryStart);
    if (entryEnd === -1) break;
    const entry = xml.slice(entryStart, entryEnd);
    cursor = entryEnd + 8;
    const videoId = extractTag(entry, "yt:videoId")?.value?.trim() || "";
    const title = extractTag(entry, "title")?.value?.trim() || "";
    const published = extractTag(entry, "published")?.value?.trim() || "";
    // media:description
    const desc = /<media:description[^>]*>([\s\S]*?)<\/media:description>/.exec(entry)?.[1]?.trim() || "";
    // link href="..."
    const linkMatch = /<link[^>]+href="([^"]+)"/.exec(entry);
    const url = linkMatch ? linkMatch[1] : (videoId ? `https://www.youtube.com/watch?v=${videoId}` : "");
    if (videoId) {
      items.push({
        video_id: videoId,
        title,
        description: desc,
        published_at: published,
        video_url: url,
      });
    }
  }
  return items;
}

async function resolveFeedUrl(input: string): Promise<string> {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (trimmed.includes("/feeds/videos.xml")) return trimmed;
  const cid = await resolveChannelIdFromUrl(trimmed);
  if (cid) return `https://www.youtube.com/feeds/videos.xml?channel_id=${cid}`;
  return "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const { channel_url, feed_url, channel_id, since_days } = body || {};
    let feed = (feed_url || "").trim();
    if (!feed && channel_id && /^UC[A-Za-z0-9_-]{22}$/.test(String(channel_id).trim())) {
      feed = `https://www.youtube.com/feeds/videos.xml?channel_id=${String(channel_id).trim()}`;
    }
    if (!feed && channel_url) feed = await resolveFeedUrl(channel_url);
    if (!feed) {
      return new Response(JSON.stringify({
        error: "channel_id_not_resolved",
        message: "Não consegui resolver o channel_id a partir da URL. Cole o feed RSS manualmente ou informe o channel_id (UC…).",
      }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const resp = await fetchWithTimeout(feed, 10_000);
    if (!resp.ok) {
      return new Response(JSON.stringify({ error: `Feed fetch failed: ${resp.status}`, feed_url: feed }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const xml = await resp.text();
    let items = parseFeed(xml);
    if (items.length === 0 && channel_url) {
      const scraped = await scrapeVideosPageFromChannelUrl(channel_url);
      if (scraped.length) { console.log(`[yt] RSS empty, /videos scrape returned ${scraped.length}`); items = scraped; }
    }
    // Filter by since_days
    const days = typeof since_days === "number" && since_days > 0 ? since_days : 0;
    if (days > 0) {
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      items = items.filter((it) => {
        const t = it.published_at ? Date.parse(it.published_at) : 0;
        return !t || t >= cutoff;
      });
    }
    return new Response(JSON.stringify({ feed_url: feed, items }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});