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
const WORKER_VERSION = '2026-07-26.3';
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
    headers: {
      ...cors,
      'Content-Type': 'application/json',
      'X-Rivaldo-Planner-Version': WORKER_VERSION,
    },
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

function contentToText(content: unknown): string | null {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return null;
  const parts = content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (!part || typeof part !== 'object') return '';
      const record = part as Record<string, unknown>;
      if (typeof record.text === 'string') return record.text;
      if (typeof record.content === 'string') return record.content;
      return '';
    })
    .filter(Boolean);
  return parts.length ? parts.join('\n') : null;
}

function balancedJsonObjects(text: string): string[] {
  const objects: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') {
      if (depth === 0) start = index;
      depth++;
    } else if (char === '}' && depth > 0) {
      depth--;
      if (depth === 0 && start >= 0) {
        objects.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }
  return objects;
}

function parsePlanCandidates(message: Record<string, unknown>): unknown[] {
  const candidates: unknown[] = [];
  if (message.parsed && typeof message.parsed === 'object') {
    candidates.push(message.parsed);
  }
  if (
    message.content &&
    typeof message.content === 'object' &&
    !Array.isArray(message.content)
  ) {
    candidates.push(message.content);
  }

  const text = contentToText(message.content);
  if (!text) return candidates;

  const textCandidates = [
    text.trim(),
    ...Array.from(text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)).map(
      (match) => match[1].trim(),
    ),
    ...balancedJsonObjects(text),
  ];
  const seen = new Set<string>();
  for (const candidate of textCandidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    try {
      candidates.push(JSON.parse(candidate));
    } catch {
      // O próximo candidato pode ser o JSON válido dentro do texto.
    }
  }
  return candidates;
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
    if (request.method === 'OPTIONS') {
      return new Response('ok', {
        headers: { ...cors, 'X-Rivaldo-Planner-Version': WORKER_VERSION },
      });
    }
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
      | Array<{ message?: Record<string, unknown> }>
      | undefined;
    const message = choices?.[0]?.message;
    if (!requestId || !message) {
      return json({ error: 'planner_bad_response' }, 502, cors);
    }

    const rawCandidates = parsePlanCandidates(message);
    if (rawCandidates.length === 0) {
      return json({ error: 'plan_parse_failed' }, 502, cors);
    }

    let validation: ReturnType<typeof validateEpisodePlan> | null = null;
    for (const rawCandidate of rawCandidates) {
      if (!rawCandidate || typeof rawCandidate !== 'object') continue;
      const plan = rawCandidate as Record<string, unknown>;
      plan.modelUsed = model;
      plan.createdAtIso ??= new Date().toISOString();
      plan.version ??= 'v1';
      plan.planId ??= `plan-${requestId}`;
      plan.episodeId = episodeId;
      const candidateValidation = validateEpisodePlan(plan, reports);
      if (candidateValidation.ok && candidateValidation.plan) {
        validation = candidateValidation;
        break;
      }
      validation ??= candidateValidation;
    }

    if (!validation?.ok || !validation.plan) {
      return json(
        { error: 'validation_failed', issues: validation?.issues ?? [] },
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
