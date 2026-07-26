import { zodToJsonSchema } from 'zod-to-json-schema';
import { EpisodePlanRequestSchema, EpisodePlanV1Schema } from './lib/schemas';
import { buildEpisodePlannerMessages } from './lib/prompt';
import { validateEpisodePlan } from './lib/validate';

interface Env {
  OPENROUTER_API_KEY?: string;
  RIVALDO_AUDIO_PLANNER_MODEL?: string;
  RIVALDO_PLANNER_MODEL_ALLOWLIST?: string;
  RIVALDO_PLANNER_CORS_ORIGINS?: string;
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'deepseek/deepseek-v4-pro';
const MAX_REPORT_BYTES = 512 * 1024;
const MAX_OUTPUT_TOKENS = 8192;
const REQUEST_TIMEOUT_MS = 30_000;
const TEMPERATURE = 0.15;
const PLAN_JSON_SCHEMA = zodToJsonSchema(EpisodePlanV1Schema, {
  name: 'EpisodePlanV1',
  $refStrategy: 'none',
});

function allowedOrigins(env: Env): string[] {
  return (
    env.RIVALDO_PLANNER_CORS_ORIGINS ??
    'https://kiltonfernandes.github.io,https://snakepit.lovable.app,http://localhost:8080'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function corsFor(origin: string | null, env: Env): Record<string, string> | null {
  const origins = allowedOrigins(env);
  if (!origin || !origins.includes(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function json(
  payload: unknown,
  status: number,
  cors: Record<string, string>,
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function plannerModel(env: Env): string {
  const allowlist = (env.RIVALDO_PLANNER_MODEL_ALLOWLIST ?? DEFAULT_MODEL)
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);
  const requested = env.RIVALDO_AUDIO_PLANNER_MODEL ?? DEFAULT_MODEL;
  return allowlist.includes(requested) ? requested : DEFAULT_MODEL;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsFor(request.headers.get('Origin'), env);
    if (!cors) {
      return new Response(JSON.stringify({ error: 'origin_not_allowed' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (request.method !== 'POST') {
      return json({ error: 'method_not_allowed' }, 405, cors);
    }

    if (!env.OPENROUTER_API_KEY) {
      return json({ error: 'server_misconfigured' }, 500, cors);
    }

    const contentLength = Number(request.headers.get('Content-Length') ?? '0');
    if (contentLength && contentLength > MAX_REPORT_BYTES) {
      return json({ error: 'report_too_large', maxBytes: MAX_REPORT_BYTES }, 413, cors);
    }
    const rawText = await request.text();
    if (new TextEncoder().encode(rawText).byteLength > MAX_REPORT_BYTES) {
      return json({ error: 'report_too_large', maxBytes: MAX_REPORT_BYTES }, 413, cors);
    }

    let body: unknown;
    try {
      body = JSON.parse(rawText);
    } catch {
      return json({ error: 'invalid_json' }, 400, cors);
    }
    const parsedRequest = EpisodePlanRequestSchema.safeParse(body);
    if (!parsedRequest.success) {
      return json({ error: 'invalid_report' }, 400, cors);
    }

    const { episodeId, reports } = parsedRequest.data;
    const model = plannerModel(env);
    const openrouterBody = {
      model,
      temperature: TEMPERATURE,
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: buildEpisodePlannerMessages(episodeId, reports),
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'EpisodePlanV1',
          strict: true,
          schema: PLAN_JSON_SCHEMA,
        },
      },
    };

    const startedAt = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let openrouterResponse: Response;
    try {
      openrouterResponse = await fetch(OPENROUTER_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://kiltonfernandes.github.io/snakepit-98523faa/',
          'X-Title': 'Rivaldo Agentic V1',
        },
        body: JSON.stringify(openrouterBody),
      });
    } catch (error) {
      const reason =
        error instanceof Error && error.name === 'AbortError'
          ? 'planner_timeout'
          : 'planner_unreachable';
      console.error('[rivaldo-planner]', reason);
      return json({ error: reason }, 504, cors);
    } finally {
      clearTimeout(timeout);
    }

    if (!openrouterResponse.ok) {
      const details = await openrouterResponse.text().catch(() => '');
      console.error(
        '[rivaldo-planner] openrouter_failed',
        openrouterResponse.status,
        details.slice(0, 500),
      );
      return json(
        { error: 'planner_failed', status: openrouterResponse.status },
        502,
        cors,
      );
    }

    const openrouterJson = (await openrouterResponse.json().catch(() => null)) as
      | Record<string, unknown>
      | null;
    const requestId =
      openrouterJson && typeof openrouterJson.id === 'string'
        ? openrouterJson.id
        : null;
    const choices = openrouterJson?.choices as
      | Array<{ message?: { content?: string } }>
      | undefined;
    const content = choices?.[0]?.message?.content;
    if (!requestId || typeof content !== 'string') {
      return json({ error: 'planner_bad_response' }, 502, cors);
    }

    let rawPlan: unknown;
    try {
      rawPlan = JSON.parse(content);
    } catch {
      return json({ error: 'plan_parse_failed' }, 502, cors);
    }
    if (rawPlan && typeof rawPlan === 'object') {
      const plan = rawPlan as Record<string, unknown>;
      plan.modelUsed = model;
      plan.createdAtIso ??= new Date().toISOString();
      plan.version ??= 'v1';
      plan.planId ??= `plan-${requestId}`;
      plan.episodeId = episodeId;
    }

    const validation = validateEpisodePlan(rawPlan, reports);
    if (!validation.ok || !validation.plan) {
      return json(
        { error: 'validation_failed', issues: validation.issues },
        422,
        cors,
      );
    }

    const usage = (openrouterJson?.usage ?? {}) as Record<string, unknown>;
    return json(
      {
        requestId,
        provider: 'openrouter',
        model,
        createdAt: new Date().toISOString(),
        durationMs: Math.round(performance.now() - startedAt),
        usage: {
          inputTokens: Number(usage.prompt_tokens ?? 0) || 0,
          outputTokens: Number(usage.completion_tokens ?? 0) || 0,
          costUsd: typeof usage.cost === 'number' ? usage.cost : undefined,
        },
        plan: validation.plan,
        issues: validation.issues,
      },
      200,
      cors,
    );
  },
};
