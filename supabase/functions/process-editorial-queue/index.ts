import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  callOpenRouterText,
  OPENROUTER_FALLBACK_MODEL,
  OPENROUTER_PRIMARY_MODEL,
} from "../_shared/openrouter.ts";

function corsHeaders(origin: string | null) {
  const configuredOrigins = (Deno.env.get("EDITORIAL_QUEUE_CORS_ORIGIN") || "https://kiltonfernandes.github.io")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const isVercelPreview = Boolean(origin && /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin));
  const allowedOrigin = origin && (configuredOrigins.includes(origin) || isVercelPreview)
    ? origin
    : configuredOrigins[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

const AUTOMATION_VERSION = "editorial-v1";
const TARGET_WORDS = 500;
const PROCESSING_STALE_MS = 15 * 60 * 1000;
const MAX_BUFFER_ITEMS = 3;

type BufferRole = "active" | "reserve" | "planned" | "completed";

interface PautaRow {
  id: string;
  publication_date: string;
  status: string;
  data: Record<string, unknown> | null;
  created_at?: string;
}

interface AppSettings {
  temperature: number;
  bannedTerms: string[];
  promptOverrides: Record<string, string>;
}

function jsonResponse(body: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

function dataOf(row: Pick<PautaRow, "data">): Record<string, any> {
  return row.data && typeof row.data === "object" ? { ...row.data } : {};
}

function isAutomatic(row: PautaRow) {
  return dataOf(row).automation_version === AUTOMATION_VERSION;
}

function hasRaw(row: PautaRow) {
  const raw = dataOf(row).raw_asset;
  return Boolean(raw?.file_id || raw?.web_url);
}

function stageOf(row: PautaRow) {
  return String(dataOf(row).editorial_stage || row.status || "planned");
}

function isFinalized(row: PautaRow) {
  const stage = stageOf(row);
  return hasRaw(row) || ["raw_available", "final_available", "scheduled", "final"].includes(stage) || ["final", "scheduled"].includes(row.status);
}

function isFreshlyProcessing(row: PautaRow) {
  if (!["researching", "writing", "processing"].includes(stageOf(row))) return false;
  const started = Date.parse(String(dataOf(row).processing_started_at || ""));
  return Number.isFinite(started) && Date.now() - started < PROCESSING_STALE_MS;
}

function parseJson(raw: string): Record<string, any> | null {
  const text = String(raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function countWords(markdown: string) {
  return String(markdown || "").trim().split(/\s+/).filter(Boolean).length;
}

function validateEditorialOutput(output: Record<string, any>): string[] {
  const errors: string[] = [];
  if (output.status === "research_gap") return [];
  const markdown = String(output.review_markdown || "").trim();
  if (!markdown) errors.push("review_markdown ausente");
  const words = countWords(markdown);
  if (words && (words < 320 || words > 700)) errors.push(`pauta fora do alvo de tamanho (${words} palavras)`);
  const titles = Array.isArray(output.titles) ? output.titles : [];
  if (titles.length !== 3) errors.push("a resposta precisa conter exatamente três títulos");
  titles.forEach((title: any, index: number) => {
    const text = String(title?.text || "").trim();
    if (!text) errors.push(`título ${index + 1} vazio`);
    if (text.length > 76) errors.push(`título ${index + 1} ultrapassa 76 caracteres`);
    const emojis = (text.match(/\p{Extended_Pictographic}/gu) || []).length;
    if (emojis > 1) errors.push(`título ${index + 1} tem mais de um emoji`);
  });
  if (!String(output.description_html || "").trim()) errors.push("description_html ausente");
  return errors;
}

function researchPrompt(artist: string, album: string, genre: string, extraInstructions = "") {
  return `Você é o pesquisador documental do Heavynauta. Pesquise SOMENTE o álbum abaixo e responda APENAS com JSON válido.

ÁLBUM: ${artist} — ${album}
GÊNERO INFORMADO: ${genre || "não informado"}

Regras de evidência:
- Primeiro confirme que o lançamento correto foi identificado. Havendo mais de um disco com este nome, use ano, gravadora, faixa ou line-up para desambiguar.
- Fontes oficiais, encartes, gravadoras e entrevistas têm prioridade. Metal Archives, críticas reconhecidas e bases musicais servem de apoio.
- Diferencie fato documentado, interpretação editorial e opinião de fãs.
- Nunca invente crédito, faixa, declaração, data ou influência. Se faltar dado, registre em missing_information.
- Traga somente informação que ajuda a escrever uma resenha em português brasileiro.
${extraInstructions ? `\nDIRETRIZES EDITÁVEIS DA EQUIPE:\n${extraInstructions}` : ""}

Contrato JSON:
{
  "identity": {"artist":"", "album":"", "release_year":"", "label":"", "country":"", "genre":"", "confidence":"high|medium|low"},
  "tracklist": [""],
  "credits": [""],
  "facts": [{"id":"f1", "statement":"", "category":"fact|interpretation|fan_opinion", "source_numbers":[1]}],
  "context": [""],
  "reception": [""],
  "missing_information": [""],
  "source_notes": [{"number":1, "title":"", "url":"", "kind":"official|database|interview|review|fan"}]
}`;
}

function reviewPrompt(args: {
  artist: string;
  album: string;
  genre: string;
  dossier: Record<string, any>;
  bannedTerms: string[];
  settings: AppSettings;
  correctionErrors?: string[];
}) {
  const correction = args.correctionErrors?.length
    ? `\nA resposta anterior falhou nestas verificações. Corrija tudo antes de devolver a nova resposta: ${args.correctionErrors.join("; ")}.\n`
    : "";
  return `Você é o redator-chefe do podcast Heavynauta. Produza uma resenha pronta para gravação, em português brasileiro, usando exclusivamente o dossiê factual abaixo.

ALVO: ${args.artist} — ${args.album}
GÊNERO: ${args.genre || "usar o confirmado no dossiê"}
TAMANHO: aproximadamente ${TARGET_WORDS} palavras.

Faça internamente uma checagem de fatos, estrutura, linguagem, tamanho e repetição antes de responder. Um fato sem apoio no dossiê não pode entrar no texto. Quando uma informação for interpretação, deixe isso claro no texto. Opiniões de fãs devem aparecer como percepção coletiva, nunca como fato.

Estilo: editorial, humano, musical, crítico sem cinismo e com leitura fácil. Use Markdown com títulos, subtítulos e bullets. Analise o contexto do disco, som, faixas relevantes, produção, recepção e legado quando houver evidência. Feche com "PENSE NISSO:" e uma pergunta aberta.

Títulos: gere exatamente três opções honestas, com ângulos diferentes, cerca de 65 caracteres e no máximo um emoji cada. Não invente promessas. A descrição deve ser HTML válido usando somente <p>, <h3>, <ul>, <li>, <b>, <i>, <a> e <br>.

Termos proibidos: ${args.bannedTerms.length ? args.bannedTerms.join(", ") : "nenhum"}.
${args.settings.promptOverrides.review_complete_v1 ? `\nDIRETRIZES EDITÁVEIS DA EQUIPE:\n${args.settings.promptOverrides.review_complete_v1}` : ""}

DOSSIÊ:
${JSON.stringify(args.dossier).slice(0, 26000)}
${correction}
Responda APENAS com JSON válido:
{
  "status":"completed|research_gap",
  "missing_information":[""],
  "review_markdown":"",
  "titles":[
    {"kind":"curiosidade", "text":""},
    {"kind":"impacto", "text":""},
    {"kind":"clickbait", "text":""}
  ],
  "description_html":"",
  "mentioned":[],
  "warnings":[]
}`;
}

async function getAppSettings(client: ReturnType<typeof createClient>): Promise<AppSettings> {
  const fallback = { temperature: 0.55, bannedTerms: [], promptOverrides: {} };
  const { data } = await client
    .from("app_settings")
    .select("brand_tone_temperature,banned_terms_text,prompt_overrides_json")
    .eq("singleton_id", 1)
    .maybeSingle();
  const row = data as any;
  return {
    temperature: typeof row?.brand_tone_temperature === "number" ? row.brand_tone_temperature / 100 : fallback.temperature,
    bannedTerms: String(row?.banned_terms_text || "").split("\n").map((term) => term.trim()).filter(Boolean),
    promptOverrides: row?.prompt_overrides_json && typeof row.prompt_overrides_json === "object" ? row.prompt_overrides_json : fallback.promptOverrides,
  };
}

async function researchWithSonar(artist: string, album: string, genre: string, extraInstructions = "") {
  const apiKey = Deno.env.get("PERPLEXITY_API_KEY") || Deno.env.get("PPLX_API_KEY");
  if (!apiKey) throw new Error("PERPLEXITY_API_KEY não está configurada nas Edge Functions");
  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "sonar",
      temperature: 0.1,
      messages: [
        { role: "system", content: "Você pesquisa música pesada com rigor documental. Nunca invente fatos. Responda somente no formato solicitado." },
        { role: "user", content: researchPrompt(artist, album, genre, extraInstructions) },
      ],
      web_search_options: { search_context_size: "low" },
    }),
  });
  if (!response.ok) throw new Error(`Perplexity Sonar falhou [${response.status}]: ${(await response.text()).slice(0, 500)}`);
  const payload = await response.json();
  const text = payload?.choices?.[0]?.message?.content;
  const dossier = parseJson(text);
  if (!dossier) throw new Error("Sonar não retornou um dossiê JSON válido");
  const citations = Array.isArray(payload?.citations) ? payload.citations : [];
  if (!Array.isArray(dossier.source_notes) || dossier.source_notes.length === 0) {
    dossier.source_notes = citations.map((url: string, index: number) => ({ number: index + 1, url, title: url, kind: "source" }));
  }
  return dossier;
}

async function generateEditorial(args: {
  artist: string;
  album: string;
  genre: string;
  dossier: Record<string, any>;
  settings: AppSettings;
}) {
  let correctionErrors: string[] | undefined;
  let lastOutput: Record<string, any> | null = null;
  let model = OPENROUTER_PRIMARY_MODEL;
  for (let attempt = 0; attempt < 2; attempt++) {
    const generated = await callOpenRouterText({
      system: "Você escreve para o Heavynauta. Siga o contrato JSON sem comentários externos.",
      user: reviewPrompt({ ...args, bannedTerms: args.settings.bannedTerms, correctionErrors }),
      temperature: args.settings.temperature,
      maxTokens: 9000,
      models: [OPENROUTER_PRIMARY_MODEL, OPENROUTER_FALLBACK_MODEL],
    });
    model = generated.model || model;
    const output = parseJson(generated.text);
    if (!output) {
      correctionErrors = ["resposta precisa ser JSON válido"];
      continue;
    }
    if (output.status === "research_gap") return { output, model };
    const errors = validateEditorialOutput(output);
    if (errors.length === 0) return { output, model };
    lastOutput = output;
    correctionErrors = errors;
  }
  if (lastOutput) throw new Error(`Pauta não passou na validação: ${correctionErrors?.join("; ")}`);
  throw new Error("DeepSeek e GPT-OSS não retornaram uma resposta editorial válida");
}

function titleRefreshPrompt(args: {
  artist: string;
  album: string;
  genre: string;
  currentTitles: Array<Record<string, unknown>>;
  reviewMarkdown: string;
  extraInstructions?: string;
  titleIndex?: number;
}) {
  const requested = typeof args.titleIndex === "number"
    ? `Gere somente a alternativa de índice ${args.titleIndex + 1}; mantenha as outras duas como estão.`
    : "Gere novamente as três alternativas.";
  return `Você é o redator-chefe do podcast Heavynauta. Esta é uma variação pontual do contrato review_complete_v1, não uma nova pauta.

ALVO: ${args.artist} — ${args.album}
GÊNERO: ${args.genre || "não informado"}
${requested}

Cada título deve ser honesto, em português brasileiro, ter no máximo 76 caracteres e no máximo um emoji. Preserve os três ângulos: curiosidade, impacto e clickbait responsável. Não invente fatos nem use promessas que o texto não sustenta.
${args.extraInstructions ? `\nDIRETRIZES EDITÁVEIS DA EQUIPE:\n${args.extraInstructions}` : ""}

TÍTULOS ATUAIS:
${JSON.stringify(args.currentTitles)}

PAUTA APROVADA:
${args.reviewMarkdown.slice(0, 18000)}

Responda APENAS com JSON válido:
{"titles":[{"kind":"curiosidade","text":""},{"kind":"impacto","text":""},{"kind":"clickbait","text":""}]}`;
}

function validTitles(titles: unknown) {
  const errors = validateEditorialOutput({
    status: "completed",
    review_markdown: "palavra ".repeat(320),
    titles,
    description_html: "<p>ok</p>",
  }).filter((error) => error.includes("título"));
  return errors;
}

async function updatePauta(client: ReturnType<typeof createClient>, row: PautaRow, status: string, patch: Record<string, any>) {
  const data = { ...dataOf(row), ...patch };
  const { error } = await client.from("preprod_pautas").update({ status, data }).eq("id", row.id);
  if (error) throw new Error(`Falha ao atualizar pauta: ${error.message}`);
  return { ...row, status, data } as PautaRow;
}

async function processPauta(client: ReturnType<typeof createClient>, row: PautaRow, role: BufferRole, settings: AppSettings) {
  const existing = dataOf(row);
  const artist = String(existing.artist || "").trim();
  const album = String(existing.album || "").trim();
  const genre = String(existing.genre || "").trim();
  if (!artist || !album) throw new Error("Banda ou álbum ausente na fila");

  let working = await updatePauta(client, row, "processing", {
    editorial_stage: "researching",
    buffer_role: role,
    processing_started_at: new Date().toISOString(),
    last_error: null,
    attempts: Number(existing.attempts || 0) + 1,
  });
  try {
    const dossier = await researchWithSonar(artist, album, genre, settings.promptOverrides.album_research_v1 || "");
    working = await updatePauta(client, working, "processing", { editorial_stage: "writing", research_dossier: dossier, research_sources: dossier.source_notes || [] });
    const generated = await generateEditorial({ artist, album, genre, dossier, settings });
    if (generated.output.status === "research_gap") {
      throw new Error(`Pesquisa incompleta: ${(generated.output.missing_information || []).join(", ") || "informação essencial ausente"}`);
    }
    return await updatePauta(client, working, "ready", {
      editorial_stage: "ready",
      buffer_role: role,
      result_markdown: String(generated.output.review_markdown || "").trim(),
      titles: generated.output.titles,
      selected_title: String(generated.output.titles?.[0]?.text || "").trim(),
      description_html: String(generated.output.description_html || "").trim(),
      mentioned: Array.isArray(generated.output.mentioned) ? generated.output.mentioned.join("\n") : String(generated.output.mentioned || ""),
      warnings: generated.output.warnings || [],
      title_locked: false,
      model_used: generated.model,
      research_model: "sonar",
      prompt_version: "review_complete_v1",
      completed_at: new Date().toISOString(),
      processing_started_at: null,
      last_error: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida no processamento editorial";
    await updatePauta(client, working, "blocked", {
      editorial_stage: "blocked",
      buffer_role: "planned",
      processing_started_at: null,
      last_error: message,
    });
    throw error;
  }
}

async function reconcileBuffer(client: ReturnType<typeof createClient>) {
  const { data, error } = await client
    .from("preprod_pautas")
    .select("id,publication_date,status,data,created_at")
    .order("publication_date", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Falha ao ler fila editorial: ${error.message}`);
  const allRows = ((data || []) as PautaRow[]).filter(isAutomatic);
  const candidates = allRows.filter((row) => !isFinalized(row) && stageOf(row) !== "blocked");
  const selected = candidates.slice(0, MAX_BUFFER_ITEMS);
  const settings = await getAppSettings(client);
  const jobs: Promise<unknown>[] = [];

  for (let index = 0; index < selected.length; index++) {
    const row = selected[index];
    const role: BufferRole = index < 2 ? "active" : "reserve";
    const data = dataOf(row);
    if (stageOf(row) === "ready") {
      if (data.buffer_role !== role) jobs.push(updatePauta(client, row, "ready", { buffer_role: role }));
      continue;
    }
    if (isFreshlyProcessing(row)) continue;
    jobs.push(processPauta(client, row, role, settings));
  }

  // Anything outside the current buffer becomes planned again. Completed
  // episodes keep their own role so historical cards remain meaningful.
  for (const row of allRows) {
    if (selected.some((item) => item.id === row.id) || isFinalized(row) || stageOf(row) === "blocked") continue;
    if (dataOf(row).buffer_role !== "planned") jobs.push(updatePauta(client, row, row.status, { buffer_role: "planned" }));
  }

  const settled = await Promise.allSettled(jobs);
  return {
    selected: selected.map((row) => row.id),
    completed: settled.filter((result) => result.status === "fulfilled").length,
    failed: settled.filter((result) => result.status === "rejected").length,
  };
}

async function regenerateTitles(
  client: ReturnType<typeof createClient>,
  pautaId: string,
  titleIndex?: number,
) {
  const { data, error } = await client
    .from("preprod_pautas")
    .select("id,publication_date,status,data,created_at")
    .eq("id", pautaId)
    .maybeSingle();
  if (error) throw new Error(`Falha ao carregar a pauta: ${error.message}`);
  if (!data) throw new Error("Pauta não encontrada");
  const row = data as PautaRow;
  const existing = dataOf(row);
  if (!isAutomatic(row)) throw new Error("Esta pauta não pertence à fila editorial automática");
  if (existing.title_locked || isFinalized(row)) throw new Error("Os títulos foram travados pelo MP3 final");
  if (!String(existing.result_markdown || "").trim()) throw new Error("A pauta ainda não está pronta para regenerar títulos");
  const settings = await getAppSettings(client);

  const generated = await callOpenRouterText({
    system: "Você escreve para o Heavynauta. Siga o contrato JSON sem comentários externos.",
    user: titleRefreshPrompt({
      artist: String(existing.artist || ""),
      album: String(existing.album || ""),
      genre: String(existing.genre || ""),
      currentTitles: Array.isArray(existing.titles) ? existing.titles : [],
      reviewMarkdown: String(existing.result_markdown || ""),
      extraInstructions: settings.promptOverrides.review_complete_v1 || "",
      titleIndex,
    }),
    temperature: 0.65,
    maxTokens: 1200,
    models: [OPENROUTER_PRIMARY_MODEL, OPENROUTER_FALLBACK_MODEL],
  });
  const output = parseJson(generated.text);
  const freshTitles = Array.isArray(output?.titles) ? output.titles : [];
  const titleErrors = validTitles(freshTitles);
  if (titleErrors.length) throw new Error(`Os títulos regenerados não passaram na validação: ${titleErrors.join("; ")}`);

  const currentTitles = Array.isArray(existing.titles) ? existing.titles : [];
  const titles = typeof titleIndex === "number"
    ? currentTitles.map((item: any, index: number) => index === titleIndex ? freshTitles[titleIndex] : item)
    : freshTitles;
  const selectedTitle = titles.some((item: any) => item?.text === existing.selected_title)
    ? existing.selected_title
    : String(titles[0]?.text || "");
  await updatePauta(client, row, row.status, {
    titles,
    selected_title: selectedTitle,
    title_model_used: generated.model,
    title_regenerated_at: new Date().toISOString(),
  });
  return { titles, model: generated.model };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return jsonResponse({ error: "Método não suportado" }, 405, origin);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return jsonResponse({ error: "Configuração Supabase ausente" }, 500, origin);
  const authorization = req.headers.get("authorization") || "";
  if (!authorization.toLowerCase().startsWith("bearer ")) return jsonResponse({ error: "Autenticação obrigatória" }, 401, origin);
  const authClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const token = authorization.slice("bearer ".length).trim();
  const { data: claims, error: claimsError } = await authClient.auth.getClaims(token);
  if (claimsError || !claims?.claims?.sub) return jsonResponse({ error: "Sessão inválida" }, 401, origin);
  const client = createClient(url, serviceKey);

  const body = await req.json().catch(() => ({})) as { action?: string; pautaId?: string; titleIndex?: number };
  if (body.action === "regenerate_titles") {
    if (!body.pautaId) return jsonResponse({ error: "pautaId é obrigatório" }, 400, origin);
    try {
      const result = await regenerateTitles(client, body.pautaId, body.titleIndex);
      return jsonResponse({ accepted: true, result }, 200, origin);
    } catch (error) {
      return jsonResponse({ error: error instanceof Error ? error.message : "Falha ao regenerar títulos" }, 400, origin);
    }
  }

  const work = reconcileBuffer(client).catch((error) => {
    console.error("[process-editorial-queue]", error);
    throw error;
  });
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(work);
    return jsonResponse({ accepted: true, message: "Fila editorial recebida e em processamento" }, 202, origin);
  }

  try {
    const result = await work;
    return jsonResponse({ accepted: true, result }, 200, origin);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Falha ao processar fila" }, 500, origin);
  }
});
