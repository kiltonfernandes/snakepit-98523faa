// Rivaldo Agentic V1 — Planner endpoint (Wave A).
//
// Fluxo:
//   POST { report: AudioAnalysisReportV2 } → JWT check → validate Zod →
//   1 chamada OpenRouter (structured output, timeout 30s, sem retry) →
//   validação 7-layer → envelope { requestId, provider, model, usage, plan }.
//
// Regras: sem retry, sem segunda chamada, sem exposição de segredos ou
// stack traces. `requestId` é o id retornado pelo OpenRouter — nunca um id
// local. Se a chamada não acontecer, `requestId` não existe.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { zodToJsonSchema } from 'npm:zod-to-json-schema@3';
import { EpisodePlanRequestSchema, EpisodePlanV1Schema } from './_lib/schemas.ts';
import { buildEpisodePlannerMessages } from './_lib/prompt.ts';
import { validateEpisodePlan } from './_lib/validate.ts';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_REPORT_BYTES = 512 * 1024;      // 512 KB — batch de até 16 tracks compactos
const MAX_OUTPUT_TOKENS = 8192;
const REQUEST_TIMEOUT_MS = 30_000;
const TEMPERATURE = 0.15;                 // dentro de [0.1, 0.15]

// Allowlist de modelos aceitos (env `RIVALDO_PLANNER_MODEL_ALLOWLIST`
// vírgula-separada sobrescreve; default = deepseek-v4-pro apenas).
const DEFAULT_ALLOWLIST = ['deepseek/deepseek-v4-pro'];
const ALLOWLIST = (Deno.env.get('RIVALDO_PLANNER_MODEL_ALLOWLIST') ?? DEFAULT_ALLOWLIST.join(','))
  .split(',').map((s) => s.trim()).filter(Boolean);
const REQUESTED_MODEL = Deno.env.get('RIVALDO_AUDIO_PLANNER_MODEL') ?? DEFAULT_ALLOWLIST[0];
const PLANNER_MODEL = ALLOWLIST.includes(REQUESTED_MODEL) ? REQUESTED_MODEL : DEFAULT_ALLOWLIST[0];

// CORS restrito aos domínios do Snakepit (env `RIVALDO_PLANNER_CORS_ORIGINS`
// vírgula-separada sobrescreve).
const ALLOWED_ORIGINS = (Deno.env.get('RIVALDO_PLANNER_CORS_ORIGINS') ??
  'https://snakepit.lovable.app,https://id-preview--d13cfcc7-4643-478b-858b-a6450182c64c.lovable.app,http://localhost:8080'
).split(',').map((s) => s.trim()).filter(Boolean);

function corsFor(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function json(payload: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  const cors = corsFor(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);

  // 1) JWT obrigatório — usa signing keys via getClaims.
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return json({ error: 'unauthorized' }, 401, cors);
  }
  const supaUrl = Deno.env.get('SUPABASE_URL');
  const supaAnon = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supaUrl || !supaAnon) return json({ error: 'server_misconfigured' }, 500, cors);
  const supabase = createClient(supaUrl, supaAnon, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.slice('bearer '.length).trim();
  const claimsRes = await supabase.auth.getClaims(token);
  if (claimsRes.error || !claimsRes.data?.claims?.sub) {
    return json({ error: 'unauthorized' }, 401, cors);
  }

  // 2) Segredos + limite de payload.
  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!apiKey) return json({ error: 'server_misconfigured' }, 500, cors);
  const contentLength = Number(req.headers.get('content-length') ?? '0');
  if (contentLength && contentLength > MAX_REPORT_BYTES) {
    return json({ error: 'report_too_large', maxBytes: MAX_REPORT_BYTES }, 413, cors);
  }
  const rawText = await req.text();
  if (rawText.length > MAX_REPORT_BYTES) {
    return json({ error: 'report_too_large', maxBytes: MAX_REPORT_BYTES }, 413, cors);
  }
  let body: unknown;
  try { body = JSON.parse(rawText); } catch { return json({ error: 'invalid_json' }, 400, cors); }

  const reqParsed = EpisodePlanRequestSchema.safeParse(body);
  if (!reqParsed.success) {
    return json({ error: 'invalid_report' }, 400, cors);
  }
  const { episodeId, reports } = reqParsed.data;

  // 3) Chamada única ao OpenRouter (structured output, sem retry, com timeout).
  const messages = buildEpisodePlannerMessages(episodeId, reports);
  const jsonSchema = zodToJsonSchema(EpisodePlanV1Schema, { name: 'EpisodePlanV1', $refStrategy: 'none' });
  const openrouterBody = {
    model: PLANNER_MODEL,
    temperature: TEMPERATURE,
    max_tokens: MAX_OUTPUT_TOKENS,
    messages,
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'EpisodePlanV1', strict: true, schema: jsonSchema },
    },
  };

  const t0 = performance.now();
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
  let orRes: Response;
  try {
    orRes = await fetch(OPENROUTER_URL, {
      method: 'POST',
      signal: abort.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://snakepit.lovable.app',
        'X-Title': 'Rivaldo Agentic V1',
      },
      body: JSON.stringify(openrouterBody),
    });
  } catch (err) {
    clearTimeout(timer);
    const reason = (err as Error)?.name === 'AbortError' ? 'planner_timeout' : 'planner_unreachable';
    console.error('[plan-rivaldo-treatment]', reason, err);
    return json({ error: reason }, 504, cors);
  }
  clearTimeout(timer);

  if (!orRes.ok) {
    const details = await orRes.text().catch(() => '');
    console.error('[plan-rivaldo-treatment] openrouter_failed', orRes.status, details.slice(0, 500));
    return json({ error: 'planner_failed', status: orRes.status }, 502, cors);
  }

  const orJson = await orRes.json().catch(() => null) as Record<string, unknown> | null;
  if (!orJson) return json({ error: 'planner_bad_response' }, 502, cors);
  const requestId = typeof orJson.id === 'string' ? orJson.id : null;
  if (!requestId) {
    console.error('[plan-rivaldo-treatment] missing_request_id', orJson);
    return json({ error: 'planner_bad_response' }, 502, cors);
  }
  const choices = orJson.choices as Array<{ message?: { content?: string } }> | undefined;
  const content = choices?.[0]?.message?.content;
  if (typeof content !== 'string') return json({ error: 'planner_bad_response' }, 502, cors);

  let rawPlan: unknown;
  try { rawPlan = JSON.parse(content); } catch {
    return json({ error: 'plan_parse_failed' }, 502, cors);
  }
  if (rawPlan && typeof rawPlan === 'object') {
    const rp = rawPlan as Record<string, unknown>;
    rp.modelUsed = PLANNER_MODEL;
    rp.createdAtIso ??= new Date().toISOString();
    rp.version ??= 'v1';
    rp.planId ??= `plan-${requestId}`;
    rp.episodeId = episodeId;
  }

  const validation = validateEpisodePlan(rawPlan, reports);
  if (!validation.ok || !validation.plan) {
    return json({ error: 'validation_failed', issues: validation.issues }, 422, cors);
  }

  const durationMs = Math.round(performance.now() - t0);
  const usage = (orJson.usage ?? {}) as Record<string, unknown>;
  return json({
    requestId,
    provider: 'openrouter',
    model: PLANNER_MODEL,
    createdAt: new Date().toISOString(),
    durationMs,
    usage: {
      inputTokens: Number(usage.prompt_tokens ?? 0) || 0,
      outputTokens: Number(usage.completion_tokens ?? 0) || 0,
      costUsd: typeof usage.cost === 'number' ? usage.cost : undefined,
    },
    plan: validation.plan,
    issues: validation.issues,
  }, 200, cors);
});