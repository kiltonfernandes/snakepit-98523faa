// Fetches a YouTube channel's RSS feed and returns a list of recent videos.
// Also resolves channel URLs to feed URLs when possible.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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
  // Already a feed URL
  if (trimmed.includes("/feeds/videos.xml")) return trimmed;
  // youtube.com/channel/UC... — direct feed by channel_id
  const channelMatch = /youtube\.com\/channel\/([A-Za-z0-9_-]+)/.exec(trimmed);
  if (channelMatch) return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelMatch[1]}`;
  // Handle @handle, /c/name, /user/name — fetch the HTML and grab canonical channelId
  try {
    const resp = await fetch(trimmed, { headers: { "User-Agent": "Mozilla/5.0" } });
    const html = await resp.text();
    const cid = /"channelId":"([A-Za-z0-9_-]+)"/.exec(html)?.[1]
      || /<meta itemprop="channelId" content="([A-Za-z0-9_-]+)"/.exec(html)?.[1]
      || /<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/([A-Za-z0-9_-]+)"/.exec(html)?.[1];
    if (cid) return `https://www.youtube.com/feeds/videos.xml?channel_id=${cid}`;
  } catch (_) { /* fall through */ }
  return trimmed;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const { channel_url, feed_url, since_days } = body || {};
    let feed = (feed_url || "").trim();
    if (!feed && channel_url) feed = await resolveFeedUrl(channel_url);
    if (!feed) {
      return new Response(JSON.stringify({ error: "channel_url or feed_url required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const resp = await fetch(feed, { headers: { "User-Agent": "Mozilla/5.0 SnakepitBot" } });
    if (!resp.ok) {
      return new Response(JSON.stringify({ error: `Feed fetch failed: ${resp.status}`, feed_url: feed }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const xml = await resp.text();
    let items = parseFeed(xml);
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