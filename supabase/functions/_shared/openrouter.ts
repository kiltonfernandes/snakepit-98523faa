// Shared OpenRouter client for all AI edge functions.
// Tries a chain of free models first (5s deadline to first byte each), then
// falls back to the paid default. Supports optional openrouter:web_search tool.
//
// Progress is broadcast back to clients as SSE meta events of the form:
//   data: {"_meta":{"type":"trying"|"fallback"|"selected","model":"...","reason":"..."}}
// The client should ignore data lines whose JSON has a top-level "_meta" key.

export const OPENROUTER_FALLBACK_MODEL = "deepseek/deepseek-v4-flash";
export const OPENROUTER_FREE_CHAIN = [
  "moonshotai/kimi-k2.6:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "sourceful/riverflow-v2.5-pro:free",
  "sourceful/riverflow-v2.5-fast:free",
];
/** Default per-model "time to first byte" deadline. */
const DEFAULT_DEADLINE_MS = 5000;
/** Deadline for the paid fallback model — must not be aborted aggressively,
 *  especially when web_search tools are in use. */
const FALLBACK_DEADLINE_MS = 90_000;
/** Back-compat export (old code imports OPENROUTER_MODEL). */
export const OPENROUTER_MODEL = OPENROUTER_FALLBACK_MODEL;
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export interface CallOpenRouterOptions {
  system?: string;
  user: string;
  temperature?: number;
  bannedTerms?: string[];
  webSearch?: boolean;
  stream?: boolean;
  maxTokens?: number;
  /** Override model chain. Defaults to free chain + fallback. */
  models?: string[];
  /** Per-model deadline in ms. Defaults to 5000. */
  deadlineMs?: number;
  /** Optional map of model-id -> deadline ms. Overrides deadlineMs when present. */
  deadlinesByModel?: Record<string, number>;
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

function buildModelChain(opts: CallOpenRouterOptions): string[] {
  if (Array.isArray(opts.models) && opts.models.length > 0) return opts.models;
  // web_search is an OpenRouter-side tool that not all free models accept.
  // To avoid silent failures, skip free chain when web search is on.
  if (opts.webSearch) return [OPENROUTER_FALLBACK_MODEL];
  return [...OPENROUTER_FREE_CHAIN, OPENROUTER_FALLBACK_MODEL];
}

function buildRequestBody(model: string, opts: CallOpenRouterOptions) {
  const systemContent = buildSystem(opts.system, opts.bannedTerms);
  const messages: { role: string; content: string }[] = [];
  if (systemContent) messages.push({ role: "system", content: systemContent });
  messages.push({ role: "user", content: opts.user });
  const body: Record<string, unknown> = { model, messages, stream: !!opts.stream };
  if (typeof opts.temperature === "number") body.temperature = opts.temperature;
  if (typeof opts.maxTokens === "number") body.max_tokens = opts.maxTokens;
  if (opts.webSearch) body.tools = [{ type: "openrouter:web_search" }];
  return body;
}

function postOpenRouter(model: string, opts: CallOpenRouterOptions, signal: AbortSignal): Promise<Response> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");
  return fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://snakepit.lovable.app",
      "X-Title": "Snakepit",
    },
    body: JSON.stringify(buildRequestBody(model, opts)),
    signal,
  });
}

/** Back-compat: single-shot call against the fallback model (no chain). */
export async function callOpenRouter(opts: CallOpenRouterOptions): Promise<Response> {
  const ctl = new AbortController();
  return await postOpenRouter(OPENROUTER_FALLBACK_MODEL, opts, ctl.signal);
}

const encoder = new TextEncoder();
const metaEvent = (payload: Record<string, unknown>) =>
  encoder.encode(`data: ${JSON.stringify({ _meta: payload })}\n\n`);

/**
 * Streaming call with per-model fallback. Returns a ReadableStream of SSE
 * bytes (OpenAI-compatible delta events). Emits meta events between attempts
 * so the client can show progress in a modal.
 */
export function callOpenRouterStreamWithFallback(opts: CallOpenRouterOptions): ReadableStream<Uint8Array> {
  const chain = buildModelChain(opts);
  const deadlineMs = opts.deadlineMs ?? DEFAULT_DEADLINE_MS;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(metaEvent({ type: "chain", models: chain }));
      for (let i = 0; i < chain.length; i++) {
        const model = chain[i];
        const isLast = i === chain.length - 1;
        controller.enqueue(metaEvent({ type: "trying", model, attempt: i + 1 }));
        const ctl = new AbortController();
        // Per-model deadline (from client config) wins. Otherwise: last model gets the
        // generous fallback deadline so we don't kill legitimately slow responses.
        const perModel = opts.deadlinesByModel?.[model];
        const effectiveDeadline = typeof perModel === "number" && perModel > 0
          ? perModel
          : isLast ? Math.max(deadlineMs, FALLBACK_DEADLINE_MS) : deadlineMs;
        const timer = setTimeout(() => ctl.abort("deadline"), effectiveDeadline);
        try {
          const res = await postOpenRouter(model, { ...opts, stream: true }, ctl.signal);
          if (!res.ok || !res.body) {
            clearTimeout(timer);
            const txt = await res.text().catch(() => "");
            console.warn(`[openrouter] ${model} failed ${res.status} ${txt.slice(0, 200)}`);
            controller.enqueue(metaEvent({ type: "fallback", model, reason: `status_${res.status}` }));
            if (isLast) {
              controller.enqueue(metaEvent({ type: "error", model, status: res.status, message: txt.slice(0, 400) }));
              controller.close();
              return;
            }
            continue;
          }
          const reader = res.body.getReader();
          // Wait for first chunk before declaring "selected".
          const firstRead = await reader.read();
          clearTimeout(timer);
          if (firstRead.done) {
            controller.enqueue(metaEvent({ type: "fallback", model, reason: "empty_stream" }));
            if (isLast) { controller.close(); return; }
            continue;
          }
          controller.enqueue(metaEvent({ type: "selected", model }));
          controller.enqueue(firstRead.value);
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
          controller.close();
          return;
        } catch (e: any) {
          clearTimeout(timer);
          const reason = e?.name === "AbortError" || String(e?.message || "").includes("deadline") ? "timeout" : "network";
          console.warn(`[openrouter] ${model} ${reason}: ${e?.message || e}`);
          controller.enqueue(metaEvent({ type: "fallback", model, reason }));
          if (isLast) {
            controller.enqueue(metaEvent({ type: "error", model, reason, message: String(e?.message || e) }));
            controller.close();
            return;
          }
          continue;
        }
      }
      controller.close();
    },
  });
}

export async function callOpenRouterText(opts: CallOpenRouterOptions): Promise<{
  text: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  model?: string;
}> {
  const chain = buildModelChain(opts);
  const deadlineMs = opts.deadlineMs ?? DEFAULT_DEADLINE_MS;
  let lastErr: any = null;
  for (let i = 0; i < chain.length; i++) {
    const model = chain[i];
    const isLast = i === chain.length - 1;
    const ctl = new AbortController();
    const effectiveDeadline = isLast ? Math.max(deadlineMs, FALLBACK_DEADLINE_MS) : deadlineMs;
    const timer = setTimeout(() => ctl.abort("deadline"), effectiveDeadline);
    try {
      const res = await postOpenRouter(model, { ...opts, stream: false }, ctl.signal);
      clearTimeout(timer);
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        lastErr = Object.assign(new Error(`OpenRouter error [${res.status}]: ${errText}`), { status: res.status });
        console.warn(`[openrouter] ${model} failed ${res.status}`);
        continue;
      }
      const data = await res.json();
      const choice = data?.choices?.[0]?.message?.content;
      let text = "";
      if (typeof choice === "string") text = choice;
      else if (Array.isArray(choice)) text = choice.map((c: any) => (typeof c === "string" ? c : c?.text || "")).join("");
      return { text, usage: data?.usage, model };
    } catch (e: any) {
      clearTimeout(timer);
      lastErr = e;
      console.warn(`[openrouter] ${model} threw: ${e?.message || e}`);
      continue;
    }
  }
  throw lastErr ?? new Error("OpenRouter: all models failed");
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