import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { callOpenRouter, openRouterErrorResponse } from "../_shared/openrouter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function getAppSettings(): Promise<{ temperature: number; bannedTerms: string[] }> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !key) return { temperature: 0.7, bannedTerms: [] };
    const sb = createClient(url, key);
    const { data } = await sb.from("app_settings").select("brand_tone_temperature, banned_terms_text").eq("singleton_id", 1).single();
    const temp = typeof (data as any)?.brand_tone_temperature === "number" ? (data as any).brand_tone_temperature / 100 : 0.7;
    const banned = ((data as any)?.banned_terms_text || "").split("\n").map((s: string) => s.trim()).filter(Boolean);
    return { temperature: temp, bannedTerms: banned };
  } catch {
    return { temperature: 0.7, bannedTerms: [] };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { prompt, bannedTerms: bannedOverride, webSearch, temperature: tempOverride, system } = body;
    if (!prompt || typeof prompt !== "string") {
      return new Response(JSON.stringify({ error: "prompt is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const settings = await getAppSettings();
    const bannedTerms = Array.isArray(bannedOverride) && bannedOverride.length > 0 ? bannedOverride : settings.bannedTerms;
    const temperature = typeof tempOverride === "number" ? tempOverride : settings.temperature;

    const systemPrompt = (system && typeof system === "string" && system.trim())
      ? system.trim()
      : "Você é um redator especialista em música pesada (heavy metal, rock, punk, etc). Siga rigorosamente o contrato de resposta descrito no prompt do usuário. Responda sempre em português brasileiro.";

    const response = await callOpenRouter({
      system: systemPrompt,
      user: prompt,
      temperature,
      bannedTerms,
      webSearch: !!webSearch,
      stream: true,
    });

    if (!response.ok) {
      const txt = await response.text().catch(() => "");
      console.error("OpenRouter error:", response.status, txt);
      return openRouterErrorResponse(response.status, "AI error", corsHeaders);
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("generate-pauta error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});