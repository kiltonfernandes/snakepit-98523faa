// Rivaldo Agentic V1 — Planner endpoint (Onda 3).
//
// Recebe AudioAnalysisReportV2 → chama OpenRouter (deepseek/deepseek-v4-pro)
// com Structured Outputs → valida em 7 camadas → devolve TreatmentPlanV1
// limpo. Nenhum áudio trafega — só métricas/eventos.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { AudioAnalysisReportV2Schema } from '../../../src/lib/rivaldo-agent/contracts/report-v2.ts';
import { TreatmentPlanV1Schema } from '../../../src/lib/rivaldo-agent/contracts/treatment-plan-v1.ts';
import { validatePlan } from '../../../src/lib/rivaldo-agent/planner/validate.ts';
import { buildPlannerMessages } from '../../../src/lib/rivaldo-agent/planner/prompt.ts';
import { zodToJsonSchema } from 'npm:zod-to-json-schema@3';

const PLANNER_MODEL = Deno.env.get('RIVALDO_AUDIO_PLANNER_MODEL') ?? 'deepseek/deepseek-v4-pro';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!apiKey) return json({ error: 'OPENROUTER_API_KEY missing' }, 500);

  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  const reportParsed = AudioAnalysisReportV2Schema.safeParse(body);
  if (!reportParsed.success) {
    return json({ error: 'invalid_report', issues: reportParsed.error.flatten() }, 400);
  }
  const report = reportParsed.data;

  const messages = buildPlannerMessages(report);
  const jsonSchema = zodToJsonSchema(TreatmentPlanV1Schema, { name: 'TreatmentPlanV1', $refStrategy: 'none' });

  const openrouterBody = {
    model: PLANNER_MODEL,
    temperature: 0.15,
    messages,
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'TreatmentPlanV1', strict: true, schema: jsonSchema },
    },
  };

  const orRes = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://snakepit.lovable.app',
      'X-Title': 'Rivaldo Agentic V1',
    },
    body: JSON.stringify(openrouterBody),
  });
  if (!orRes.ok) {
    const text = await orRes.text();
    return json({ error: 'openrouter_failed', status: orRes.status, details: text }, 502);
  }
  const orJson = await orRes.json();
  const content = orJson?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    return json({ error: 'no_content', raw: orJson }, 502);
  }

  let rawPlan: unknown;
  try { rawPlan = JSON.parse(content); } catch {
    return json({ error: 'plan_parse_failed', content }, 502);
  }
  // Force server-side fields before validation.
  if (rawPlan && typeof rawPlan === 'object') {
    (rawPlan as Record<string, unknown>).modelUsed = PLANNER_MODEL;
    (rawPlan as Record<string, unknown>).createdAtIso ??= new Date().toISOString();
    (rawPlan as Record<string, unknown>).version ??= 'v1';
    (rawPlan as Record<string, unknown>).planId ??= `plan-${Date.now()}`;
    (rawPlan as Record<string, unknown>).reportId = report.reportId;
  }

  const validation = validatePlan(rawPlan, report);
  if (!validation.ok || !validation.plan) {
    return json({ error: 'validation_failed', issues: validation.issues }, 422);
  }

  return json({
    plan: validation.plan,
    issues: validation.issues,
    usage: orJson?.usage ?? null,
  }, 200);
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
// Rivaldo Agentic V1 — Planner endpoint (Onda 1 stub).
//
// Recebe um AudioAnalysisReportV2 (JSON), chama o OpenRouter com Structured
// Outputs e devolve um TreatmentPlanV1 validado. Nesta rodada só declaramos
// o contrato HTTP e devolvemos 501 até a Onda 3 plugar o prompt + validação.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const PLANNER_MODEL = Deno.env.get('RIVALDO_AUDIO_PLANNER_MODEL') ?? 'deepseek/deepseek-v4-pro';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'OPENROUTER_API_KEY missing' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Onda 1: contrato reservado. Validação Zod + chamada real do OpenRouter
  // entram na Onda 3.
  return new Response(JSON.stringify({
    status: 'not_implemented',
    stage: 'wave-1-scaffold',
    plannerModel: PLANNER_MODEL,
    receivedKeys: payload && typeof payload === 'object' ? Object.keys(payload as Record<string, unknown>) : [],
    message: 'Planner stub. Voltará com plano validado quando a Onda 3 concluir.',
  }), {
    status: 501,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});