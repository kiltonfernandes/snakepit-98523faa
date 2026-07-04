// Batch-enrich YouTube singles-videos with band/single/one-liner via OpenRouter.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callOpenRouterText, openRouterErrorResponse } from "../_shared/openrouter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface InputVideo {
  video_id: string;
  title: string;
  description?: string;
  channel_name?: string;
}

function parseJsonLoose(raw: string): any | null {
  if (!raw) return null;
  let s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try { return JSON.parse(s.slice(start, end + 1)); } catch { return null; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const videos: InputVideo[] = Array.isArray(body?.videos) ? body.videos : [];
    if (videos.length === 0) {
      return new Response(JSON.stringify({ error: "videos array required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Array<{ video_id: string; band?: string; single?: string; one_liner?: string; error?: string }> = [];

    for (const v of videos) {
      const system = `Você é um analista de lançamentos de heavy metal. Recebe título e descrição de um vídeo do YouTube (geralmente um anúncio de single/álbum). Devolve JSON estrito com { "band": "...", "single": "...", "one_liner": "..." }. one_liner é uma frase curta em PT-BR (máx 20 palavras) resumindo o lançamento. Se algo não estiver claro, use "" (string vazia). NUNCA invente. Responda APENAS o JSON, sem code fences.`;
      const user = [
        v.channel_name ? `Canal: ${v.channel_name}` : "",
        `Título: ${v.title}`,
        v.description ? `Descrição: ${v.description.slice(0, 1200)}` : "",
      ].filter(Boolean).join("\n");
      try {
        const { text } = await callOpenRouterText({
          system,
          user,
          temperature: 0.2,
          maxTokens: 400,
          webSearch: false,
          deadlineMs: 20_000,
        });
        const obj = parseJsonLoose(text || "");
        if (obj) {
          results.push({
            video_id: v.video_id,
            band: typeof obj.band === "string" ? obj.band.trim() : "",
            single: typeof obj.single === "string" ? obj.single.trim() : "",
            one_liner: typeof obj.one_liner === "string" ? obj.one_liner.trim() : "",
          });
        } else {
          results.push({ video_id: v.video_id, error: "parse_failed" });
        }
      } catch (e: any) {
        results.push({ video_id: v.video_id, error: e?.message || "call_failed" });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});