import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callOpenRouterText, openRouterErrorResponse } from "../_shared/openrouter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { query, context } = body;
    if (!query || typeof query !== "string") {
      return new Response(JSON.stringify({ error: "query is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const system = `Você é um pesquisador editorial para um podcast brasileiro de heavy metal/rock chamado Snakepit. Use web search para encontrar informações factuais, recentes e relevantes. Responda SEMPRE em português brasileiro, em formato de notas estruturadas (bullets curtos, datas, nomes, fatos verificáveis). NÃO escreva o texto final do episódio — apenas notas e direção editorial para o redator. Inclua 3-6 links de fontes ao final em uma seção "Fontes:".`;

    const user = `Pesquise sobre: ${query}\n\n${context ? `Contexto adicional do editor:\n${context}\n\n` : ""}Retorne notas factuais (datas, álbuns, integrantes, eventos, citações), pontos de ângulo editorial sugeridos e links das fontes.`;

    try {
      const { text } = await callOpenRouterText({
        system,
        user,
        temperature: 0.3,
        maxTokens: 2500,
        webSearch: true,
      });
      return new Response(JSON.stringify({ notes: text }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (e: any) {
      console.error("OpenRouter error:", e?.message);
      return openRouterErrorResponse(e?.status ?? 502, "LLM request failed", corsHeaders);
    }
  } catch (err) {
    console.error("web-research error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});