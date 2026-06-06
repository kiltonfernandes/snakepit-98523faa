import { callOpenRouterText, openRouterErrorResponse } from "../_shared/openrouter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `Você é um analisador de conteúdo e formatador HTML para o podcast Heavynauta.

Sua tarefa: dado um conjunto de itens "mencionados no episódio" (texto livre, links ou misto), gerar uma seção HTML pronta para colar na descrição final do episódio.

REGRAS OBRIGATÓRIAS:
1. Sempre responda em Português (BR).
2. Saída APENAS em HTML válido, sem markdown, sem code blocks, sem comentários.
3. Use exatamente esta estrutura:
   <h3>🎙️ Mencionado neste episódio</h3>
   <ul>
     <li>... item 1 ...</li>
     <li>... item 2 ...</li>
   </ul>
4. Para cada item:
   - Inicie com 1 emoji relevante ao tema (🎵 música, 🎬 vídeo, 📰 notícia, 📺 canal, 🎸 banda, 🔗 link genérico, 📖 leitura, 🎙️ podcast, 🛒 produto, 📅 evento etc.).
   - Em seguida, 1 a 2 frases curtas em PT-BR descrevendo de forma envolvente o conteúdo.
   - Se houver URL no item, OBRIGATORIAMENTE embuta a URL completa em um <a href="URL_COMPLETA_AQUI" target="_blank" rel="noopener">Texto descritivo</a> no final do <li>. NUNCA escreva o texto do link sem o atributo href. NUNCA use caracteres invisíveis (U+2060, U+200B etc.) no lugar do <a>.
   - Se NÃO houver URL, apenas descreva o assunto (sem link).
5. Se você não conseguir analisar uma URL, ainda assim crie um <li> usando o domínio/título visível como rótulo do link (não pule itens).
6. Não invente URLs nem fatos. Não copie textos longos das fontes — sempre parafraseie em 1-2 frases.
7. Não inclua nada além da seção <h3>...<ul>...</ul>. Sem <html>, sem <body>, sem texto solto.`;

function sanitizeHtml(raw: string): string {
  if (!raw) return "";
  let txt = raw.trim();
  txt = txt.replace(/[\u2060\u200B\u200C\u200D\uFEFF]/g, "");
  txt = txt.replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/i, "");
  const match = txt.match(/<h3[\s\S]*<\/ul>/i);
  if (match) return match[0].trim();
  return txt.trim();
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const mentioned = typeof body?.mentioned === "string" ? body.mentioned.trim() : "";
    if (!mentioned) return jsonResponse({ error: "mentioned is required" }, 400);

    const userPrompt = `Itens mencionados no episódio (cada linha ou parágrafo é um item separado, podem conter links):\n\n${mentioned}`;

    try {
      const { text } = await callOpenRouterText({
        system: SYSTEM_PROMPT,
        user: userPrompt,
        temperature: 0.4,
      });
      const html = sanitizeHtml(text);
      if (!html) return jsonResponse({ error: "Resposta vazia da IA" }, 502);
      return jsonResponse({ html });
    } catch (e: any) {
      console.error("[enrich-episode-description]", e?.message);
      return openRouterErrorResponse(e?.status ?? 500, "AI error", corsHeaders);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[enrich-episode-description]", msg);
    return jsonResponse({ error: msg }, 500);
  }
});