// Shared OpenRouter client for all AI edge functions.
// Fixed model: deepseek/deepseek-v4-flash. Optional openrouter:web_search tool.

export const OPENROUTER_MODEL = "deepseek/deepseek-v4-flash";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export interface CallOpenRouterOptions {
  system?: string;
  user: string;
  temperature?: number;
  bannedTerms?: string[];
  webSearch?: boolean;
  stream?: boolean;
  maxTokens?: number;
}

function buildSystem(system: string | undefined, bannedTerms?: string[]) {
  const parts: string[] = [];
  if (system && system.trim()) parts.push(system.trim());
  if (bannedTerms && bannedTerms.length > 0) {
    parts.push(
      `REGRA ABSOLUTA: NUNCA use nenhum destes termos no seu texto, nem variações deles: ${bannedTerms.join(", ")}. Se encontrar um desses termos no contexto fornecido, substitua por um sinônimo adequado.`,
    );
  }
  return parts.join("\n\n");
}

export async function callOpenRouter(opts: CallOpenRouterOptions): Promise<Response> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");

  const systemContent = buildSystem(opts.system, opts.bannedTerms);
  const messages: { role: string; content: string }[] = [];
  if (systemContent) messages.push({ role: "system", content: systemContent });
  messages.push({ role: "user", content: opts.user });

  const body: Record<string, unknown> = {
    model: OPENROUTER_MODEL,
    messages,
    stream: !!opts.stream,
  };
  if (typeof opts.temperature === "number") body.temperature = opts.temperature;
  if (typeof opts.maxTokens === "number") body.max_tokens = opts.maxTokens;
  if (opts.webSearch) body.tools = [{ type: "openrouter:web_search" }];

  return await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://snakepit.lovable.app",
      "X-Title": "Snakepit",
    },
    body: JSON.stringify(body),
  });
}

export async function callOpenRouterText(opts: CallOpenRouterOptions): Promise<{
  text: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}> {
  const res = await callOpenRouter({ ...opts, stream: false });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    const err: any = new Error(`OpenRouter error [${res.status}]: ${errText}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const choice = data?.choices?.[0]?.message?.content;
  let text = "";
  if (typeof choice === "string") text = choice;
  else if (Array.isArray(choice)) text = choice.map((c: any) => (typeof c === "string" ? c : c?.text || "")).join("");
  return { text, usage: data?.usage };
}

export function openRouterErrorResponse(status: number, fallback: string, corsHeaders: Record<string, string>) {
  let msg = fallback;
  if (status === 429) msg = "Limite de requisições do OpenRouter atingido. Tente novamente em alguns instantes.";
  else if (status === 402) msg = "Créditos do OpenRouter esgotados. Adicione créditos na conta OpenRouter.";
  else if (status === 401) msg = "Chave OPENROUTER_API_KEY inválida ou ausente.";
  return new Response(JSON.stringify({ error: msg }), {
    status: status === 429 || status === 402 ? status : 500,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}