import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.5-flash";

async function getActiveModel(): Promise<string> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !key) return DEFAULT_MODEL;
    const sb = createClient(url, key);
    const { data } = await sb.from("app_settings").select("ai_model").eq("singleton_id", 1).single();
    return (data as any)?.ai_model || DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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
7. Não inclua nada além da seção <h3>...<ul>...</ul>. Sem <html>, sem <body>, sem texto solto.
8. EXEMPLO CORRETO de <li> com URL:
   <li>🎵 Versão bossa nova do clássico Holy Land do Angra. <a href="https://youtu.be/abc123" target="_blank" rel="noopener">Ouça no YouTube</a></li>
   EXEMPLO ERRADO (NUNCA FAÇA): <li>🎵 ... ⁠Holy Bossa⁠</li>  ← sem href, com U+2060.`;

function extractContent(payload: any): string {
  // Standard OpenAI-compatible response
  const choice = payload?.choices?.[0]?.message?.content;
  if (typeof choice === "string") return choice;
  if (Array.isArray(choice)) {
    return choice
      .map((c: any) => (typeof c === "string" ? c : c?.text || ""))
      .join("");
  }
  return "";
}

function sanitizeHtml(raw: string): string {
  if (!raw) return "";
  let txt = raw.trim();
  // Strip word-joiner / zero-width chars that some models emit instead of <a>
  txt = txt.replace(/[\u2060\u200B\u200C\u200D\uFEFF]/g, "");
  // Strip code fences if model wrapped output
  txt = txt.replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/i, "");
  // Strip surrounding text outside the <h3> block, if any
  const match = txt.match(/<h3[\s\S]*<\/ul>/i);
  if (match) return match[0].trim();
  return txt.trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return jsonResponse({ error: "LOVABLE_API_KEY is not configured" }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const mentioned = typeof body?.mentioned === "string" ? body.mentioned.trim() : "";
    if (!mentioned) {
      return jsonResponse({ error: "mentioned is required" }, 400);
    }

    const userPrompt = `Itens mencionados no episódio (cada linha ou parágrafo é um item separado, podem conter links):\n\n${mentioned}`;

    const model = await getActiveModel();

    const aiRes = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return jsonResponse(
          { error: "Limite de requisições atingido. Tente novamente em alguns instantes." },
          429,
        );
      }
      if (aiRes.status === 402) {
        return jsonResponse(
          { error: "Créditos esgotados. Adicione créditos na sua workspace Lovable AI." },
          402,
        );
      }
      const text = await aiRes.text().catch(() => "");
      console.error("[enrich-episode-description] AI gateway error", aiRes.status, text);
      return jsonResponse({ error: `AI gateway error [${aiRes.status}]` }, 500);
    }

    const data = await aiRes.json();
    const rawHtml = extractContent(data);
    const html = sanitizeHtml(rawHtml);
    if (!html) {
      return jsonResponse({ error: "Resposta vazia da IA" }, 502);
    }

    return jsonResponse({ html });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[enrich-episode-description]", msg);
    return jsonResponse({ error: msg }, 500);
  }
});