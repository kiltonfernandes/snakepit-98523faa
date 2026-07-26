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