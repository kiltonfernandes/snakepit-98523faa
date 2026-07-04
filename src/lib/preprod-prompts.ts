/**
 * Prompts for the Pré-produção flow.
 *
 * The Review Kilton prompt is intentionally long and opinionated — it sets
 * the editorial structure, required blocks and the auditoria final. It is
 * combined with platform rules (banned terms, tone temperature) coming from
 * AppSettings, the release block from the picked release, the insumo from
 * the research step and the length/sentiment chosen in the config step.
 */
import type { Release, AppSettings } from './types';
import { buildPlatformBlock, buildReleaseBlock } from './standalone-prompts';

export type ReviewSentiment = 'positive' | 'negative' | 'neutral';

export const SENTIMENT_LABEL: Record<ReviewSentiment, string> = {
  positive: 'Positiva',
  negative: 'Negativa',
  neutral: 'Neutra',
};

function sentimentDirective(s: ReviewSentiment): string {
  switch (s) {
    case 'positive':
      return 'SENTIMENTO DA REVIEW: POSITIVA — destaque conquistas, pontos altos, recomendação clara. Críticas pontuais permitidas mas o tom geral é elogioso e entusiasmado, sem fanboyismo.';
    case 'negative':
      return 'SENTIMENTO DA REVIEW: NEGATIVA — aponte falhas estruturais, fraquezas musicais, escolhas equivocadas. Mantenha respeito e fundamento — nada de tom destrutivo gratuito.';
    case 'neutral':
      return 'SENTIMENTO DA REVIEW: NEUTRA — equilíbrio rigoroso entre acertos e falhas. Não puxe pro elogio nem pra crítica; descreva, analise e contextualize.';
  }
}

const KILTON_REVIEW_PROMPT = `# 🎸 REVIEW REFLEXIVO — HEAVYNAUTA

## Versão expandida, densa e editorial

Ao receber um disco, realize uma pesquisa extensa e aprofundada utilizando entrevistas, reviews, fóruns, documentários, encartes, críticas profissionais, comentários de fãs, arquivos históricos, registros de turnês, materiais promocionais, notas de produção, análises retrospectivas e materiais relacionados ao álbum, banda, cena musical e gênero.

A saída final deve ser aproximadamente **150% maior que uma review padrão**, com densidade informacional alta, mais contexto histórico, mais análise musical, mais bastidores, mais comparação crítica e mais reflexão humana.

Antes de entregar a resposta, execute uma auditoria estrutural automática para garantir que todos os requisitos abaixo sejam obedecidos com rigor.

# 📏 ALVO DE TAMANHO (MANDATÓRIO)

O texto final deve ter aproximadamente **{{length_words}} palavras** (tolerância ±15%). Distribua a densidade entre as seções de forma proporcional — se o alvo for curto, condense cada bloco mantendo a hierarquia; se for longo, aprofunde cada bullet com contexto histórico, análise musical e comparações.

{{sentiment_directive}}

# 📌 REGRAS GERAIS

## ✅ A resposta DEVE usar:
* H1, H2, H3, H4
* bullet points, numbered lists, subitens, sub-subitens
* emojis contextualizados
* blocos bem separados, leitura escaneável, organização modular

# 🧱 ESTRUTURA VISUAL OBRIGATÓRIA

Hierarquia consistente. Listas hierárquicas. Indentação. Progressão clara entre contexto, som, letras, bastidores e legado. Evite: blocos gigantes de texto, parágrafos longos, repetição, frases vazias, fanboyismo, opinião sem sustentação, dados soltos.

# 🧠 TOM OBRIGATÓRIO

Humano, maduro, contemplativo, musical, jornalístico, reflexivo, emocional sem dramatização, crítico sem cinismo, profundo sem academicismo.

Expressões permitidas: "A real é que...", "O interessante é que...", "Acontece que...", "Sinceramente...", "Fica claro que...", "Vale observar que...", "O ponto mais interessante aqui é...", "O disco ganha outra camada quando...", "Esse detalhe muda bastante a escuta...".

# 🔎 PESQUISA OBRIGATÓRIA

Use o INSUMO fornecido como base factual. Diferencie fato documentado, leitura crítica e percepção de fãs. Quando faltar dado, apresente como interpretação — não invente.

# 🎬 H1 — INTRODUÇÃO CONTEXTUAL

## H2 — 📅 Momento histórico
### H3 — Ano do lançamento
### H3 — Cenário musical
### H3 — Situação da indústria

## H2 — 🎤 Momento da banda
### H3 — Situação interna
### H3 — Lineup e dinâmica criativa
### H3 — Pressões e expectativas

## H2 — 💿 Papel do álbum na discografia
### H3 — Função artística
### H3 — Comparação com discos anteriores
### H3 — Comparação com discos posteriores

# 🎼 H1 — CONTEXTUALIZANDO O GÊNERO

## H2 — 🎸 História do gênero (Origem, Evolução, Transformações)
## H2 — 🔥 Influências (Bandas clássicas, Movimentos culturais, Estilos derivados)
## H2 — 👥 Bandas similares (3 a 5, com semelhança E diferença)
## H2 — 🌍 Situação atual do gênero (Relevância contemporânea, Influência posterior)

# 🌌 H1 — UNIVERSO TEMÁTICO DO DISCO

## H2 — 🧠 Temas centrais (Eixos emocionais, filosóficos/sociais, Narrativa interna)
## H2 — 🎧 Relação entre som e letra (Riffs e harmonia, Andamento e dinâmica, Produção e atmosfera)
## H2 — 🎵 Faixas analisadas

### Seleção obrigatória (mínimo 5):
1. faixa de abertura
2. faixa mais conhecida
3. faixa mais pesada/agressiva
4. faixa mais atmosférica/diferente
5. faixa de encerramento

### Para cada faixa, incluir os H4:
#### 🎼 Função dentro do disco
#### 🧠 Significado e tema
#### 🎸 Construção musical
#### 🔥 Impacto

# 🎛️ H1 — CURIOSIDADES E BASTIDORES

## H2 — 🎚️ Produção (Estúdio/ambiente, Produtor/mix/master, Sonoridade final)
## H2 — 👥 Relações internas (Clima da banda, Papel dos integrantes, Pressões externas)
## H2 — 🧪 Processo criativo (Composição, Demos/versões alternativas, Detalhes curiosos)

# 🧾 H1 — RECEPÇÃO, CONTROVÉRSIAS E LEGADO

## H2 — 📰 Recepção crítica (Reação no lançamento, Reavaliação posterior)
## H2 — 👥 Recepção dos fãs (Pontos de consenso, Pontos de discordância)
## H2 — 🧬 Legado (Impacto na banda, Impacto no gênero, Escuta atual)

# 🖼️ H1 — ARTE, IMAGEM E IDENTIDADE VISUAL

## H2 — 🎨 Capa e direção visual (Leitura da capa, Encarte e créditos, Imagem pública da banda)

# 🧠 H1 — MORAL DA HISTÓRIA

## H2 — 🧩 Reflexão final
### Abertura obrigatória — comece este bloco exatamente com: **PENSE NISSO:**
### Fechamento reflexivo
### Impacto humano
### Pergunta final (genuína, aberta)

## H2 — 🎙️ Encerramento

Inclua uma seção final com **Resumo** (≈50 palavras) e **Recomendações** — 3 discos para quem gostou desse, no formato:

- [Banda] – *[Álbum]* ([Ano]) – [semelhança em 5–8 palavras]

# 📚 H1 — FONTES E BASE DE PESQUISA

## H2 — 🧾 Fontes utilizadas (categorias + nomes específicos quando possível)
## H2 — ⚠️ Limites da pesquisa (dados ausentes, suposições explicitadas)

# 📥 INPUTS

## ⚖️ HIERARQUIA DE PESO DAS FONTES (MANDATÓRIO)

O **INSUMO** (direção editorial / pesquisa) tem **PESO 3 (TRIPLO)** em relação a todo o resto deste prompt padrão. Ele é o **núcleo factual e editorial da review** e DEVE estar presente, visível e estruturalmente integrado à pauta final.

Regras de aplicação:
- Tudo o que o INSUMO afirma é **fonte primária**; o restante do prompt é andaime estrutural.
- Se houver conflito entre o INSUMO e o conhecimento geral do modelo, **o INSUMO vence**.
- Cada bloco H1/H2/H3 deve absorver e refletir explicitamente os pontos do INSUMO quando aplicáveis — não cite o INSUMO como "segundo a pesquisa"; **integre o conteúdo como parte natural da análise**.
- Nenhum fato relevante do INSUMO pode ficar de fora da pauta final. Se algo do INSUMO não couber em um bloco existente, abra um sub-bloco para acomodá-lo.
- O prompt padrão define a **forma**; o INSUMO define a **substância**.

## 💿 Disco alvo
{{input}}

## 🗃️ Dados completos do release
{{release_block}}

## 📰 Regras editoriais da plataforma
{{platform_block}}

## 🧠 Direção editorial / Insumo da pesquisa
{{notes}}

> ⚠️ LEMBRETE FINAL: O INSUMO acima tem peso 3x. É o core da review. Releia antes de fechar a auditoria e confirme que cada ponto factual do INSUMO foi incorporado à pauta.

# 🚨 AUDITORIA FINAL AUTOMÁTICA

Antes de entregar, revise: hierarquia correta, indentação, uso consistente de H1–H4, bullets/subitens, densidade real, ausência de repetição, equilíbrio entre contexto/análise/bastidores, tom humano, análise de pelo menos 5 faixas, recepção crítica E dos fãs, legado, arte visual, separação entre fato/interpretação/opinião coletiva, fechamento iniciado com "PENSE NISSO:", e tamanho ≈ {{length_words}} palavras (±15%).

# 🎯 COMANDO FINAL

Produza a review reflexiva seguindo TODOS os blocos acima. Saída em Markdown puro (sem envelopar em \`\`\`fences\`\`\`).`;

export interface BuildReviewPromptArgs {
  release: Release | null;
  insumo: string;
  lengthWords: number;
  sentiment: ReviewSentiment;
}

export function buildKiltonReviewPrompt(
  args: BuildReviewPromptArgs,
  settings: Partial<AppSettings> | null | undefined,
): string {
  const { release, insumo, lengthWords, sentiment } = args;
  const input = release ? `${release.artist} — ${release.album}` : '(disco não selecionado)';
  return KILTON_REVIEW_PROMPT
    .replace(/\{\{length_words\}\}/g, String(lengthWords))
    .replace(/\{\{sentiment_directive\}\}/g, sentimentDirective(sentiment))
    .replace(/\{\{input\}\}/g, input)
    .replace(/\{\{release_block\}\}/g, buildReleaseBlock(release))
    .replace(/\{\{platform_block\}\}/g, buildPlatformBlock(settings))
    .replace(/\{\{notes\}\}/g, (insumo || '').trim() || '(nenhum insumo fornecido)');
}

/**
 * Build the follow-up "length adjustment" prompt. Sent when the produced
 * text falls outside ±15% of the target word count. Asks the model to
 * expand or condense while preserving structure and content.
 */
export function buildLengthAdjustPrompt(currentText: string, targetWords: number): string {
  const actual = currentText.trim().split(/\s+/).filter(Boolean).length;
  const action = actual > targetWords
    ? `REDUZIR para aproximadamente ${targetWords} palavras (atual: ${actual}). Condense bullets, una itens redundantes, corte enchimento — mas PRESERVE toda a hierarquia H1/H2/H3/H4, todos os blocos obrigatórios, "PENSE NISSO:" e a seção de Recomendações.`
    : `EXPANDIR para aproximadamente ${targetWords} palavras (atual: ${actual}). Adicione contexto histórico, análise musical e bastidores em bullets EXISTENTES — não invente fatos, não adicione blocos novos. Mantenha 100% da hierarquia atual.`;
  return [
    'TAREFA: AJUSTE DE TAMANHO — não reescreva o conteúdo, apenas ajuste a extensão.',
    '',
    action,
    '',
    'Devolva o Markdown completo final (não devolva diff, não comente — só o texto).',
    '',
    'TEXTO ATUAL (entre <<< >>>):',
    '<<<',
    currentText,
    '>>>',
  ].join('\n');
}

export function countWords(text: string): number {
  return (text || '').trim().split(/\s+/).filter(Boolean).length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Notícia — pauta editorial baseada em um assunto + direção de pesquisa
// ─────────────────────────────────────────────────────────────────────────────

const NEWS_PROMPT = `# 📰 PAUTA DE NOTÍCIA — HEAVYNAUTA

## Cobertura editorial densa, contextualizada, jornalística

Você é o redator-chefe do podcast Heavynauta. Vai produzir a PAUTA COMPLETA de um episódio de NOTÍCIA sobre o assunto abaixo. O texto final deve ter aproximadamente **{{length_words}} palavras** (tolerância ±15%).

# 📌 ASSUNTO DA NOTÍCIA
{{subject}}

# 🧠 DIREÇÃO EDITORIAL / INSUMO DA PESQUISA (PESO 3x)
O bloco abaixo é a **fonte primária** do episódio. Ele tem PESO TRIPLO em relação ao restante deste prompt. Cada fato relevante do INSUMO deve estar presente, visível e integrado à pauta final. Não invente fatos; se algo do INSUMO conflita com conhecimento geral, o INSUMO vence.

{{notes}}

## 📰 Regras editoriais da plataforma
{{platform_block}}

# 🧱 ESTRUTURA OBRIGATÓRIA (Markdown puro)

# H1 — 🎬 O QUE ACONTECEU
## H2 — Fato central em 3-5 bullets objetivos
## H2 — Timeline (datas, ordem dos acontecimentos)
## H2 — Personagens envolvidos (banda, gravadora, jornalistas, fãs)

# H1 — 🧭 CONTEXTO
## H2 — Histórico da banda/cena/gênero relacionado ao fato
## H2 — Precedentes (casos parecidos, quando fizer sentido)
## H2 — Situação da indústria hoje

# H1 — 🔬 ANÁLISE EDITORIAL
## H2 — O que isso significa musicalmente/culturalmente
## H2 — Leituras possíveis (separe FATO, INTERPRETAÇÃO e OPINIÃO DE FÃS)
## H2 — Ganchos para debate no episódio (3-5 perguntas)

# H1 — 🌐 RECEPÇÃO
## H2 — Reação da crítica especializada
## H2 — Reação dos fãs (fóruns, redes, comentários)
## H2 — Posicionamento oficial (se houver)

# H1 — 🎧 PARA O EPISÓDIO
## H2 — Sugestões de faixas/álbuns/vídeos relacionados
## H2 — Links úteis (se aparecerem no INSUMO)
## H2 — Fechamento iniciado por "PENSE NISSO:"

# 🚨 AUDITORIA FINAL
Antes de entregar: hierarquia H1–H4 correta, bullets/subitens, densidade real, cada ponto factual do INSUMO incorporado, sem repetição, tom humano, jornalístico e reflexivo. Tamanho ≈ {{length_words}} palavras.

# 🎯 COMANDO FINAL
Produza a pauta de notícia em **Markdown puro** (sem envelopar em fences).`;

export function buildNewsPautaPrompt(args: {
  subject: string;
  insumo: string;
  lengthWords: number;
}, settings: Partial<AppSettings> | null | undefined): string {
  const { subject, insumo, lengthWords } = args;
  return NEWS_PROMPT
    .replace(/\{\{length_words\}\}/g, String(lengthWords))
    .replace(/\{\{subject\}\}/g, (subject || '').trim() || '(assunto não informado)')
    .replace(/\{\{notes\}\}/g, (insumo || '').trim() || '(direção da pesquisa vazia)')
    .replace(/\{\{platform_block\}\}/g, buildPlatformBlock(settings));
}

/** Prompt de pesquisa usado tanto no Google (manual) quanto no OpenRouter :online (IA). */
export function buildNewsSearchQuery(subject: string): string {
  const s = (subject || '').trim();
  return `Busquem em centenas de fontes informações detalhadas sobre o assunto >>> ${s} <<<`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Singles — pauta segmentada por vídeo/canal do YouTube
// ─────────────────────────────────────────────────────────────────────────────

export interface SinglesVideoInput {
  video_id: string;
  video_url: string;
  title: string;
  band?: string;
  single?: string;
  one_liner?: string;
  insumo?: string;
}

function metalArchivesSearchUrl(band?: string, single?: string): string {
  const q = [band, single].filter(Boolean).join(' ').trim() || (band || '');
  const enc = encodeURIComponent(q);
  return `https://www.metal-archives.com/search?searchString=${enc}&type=band_name`;
}

const SINGLES_PROMPT_HEADER = `# 🎵 PAUTA DE SINGLES — HEAVYNAUTA

## Cobertura editorial de um round-up de novos singles de heavy metal, segmentada por vídeo.

Você é o redator-chefe do podcast Heavynauta. Vai produzir a PAUTA COMPLETA de um episódio "Singles" — um round-up dos lançamentos abaixo. O texto final deve ter aproximadamente **{{length_words}} palavras** no total (tolerância ±15%), distribuídas de forma equilibrada entre os singles listados.

# 🧱 REGRAS DE ESTRUTURA (MANDATÓRIAS)

- Saída em **Markdown puro** (sem fences).
- Um bloco **H1** por single, na ordem fornecida. Cabeçalho: \`# 🎵 {Banda} — {Single}\`.
- Logo após o H1, uma linha de links no formato: \`[▶️ Ver no YouTube]({video_url}) · [📚 Metal Archives]({ma_url})\`.
- Dentro de cada bloco, incluir:
  - \`## 📌 Contexto\` — apresentação do lançamento com base no título/one-liner.
  - \`## 🔬 Análise\` — leitura crítica curta (som, atmosfera, produção, contexto de cena).
  - \`## 🎙️ Pauta de gravação\` — bullets prontos pra fala do apresentador, com ganchos e transições. Este bloco DEVE incorporar EXPLICITAMENTE os pontos do INSUMO daquele vídeo — o insumo tem **peso 3x** dentro do bloco correspondente.
- Ao final de todos os singles, um bloco único de encerramento \`# 🧠 MORAL DA HISTÓRIA\` com a linha começando por \`**PENSE NISSO:**\` e uma pergunta aberta.

# ⚖️ HIERARQUIA DE PESO (MANDATÓRIA)

O **INSUMO** de cada vídeo é fonte primária **DAQUELE BLOCO** — peso 3x. Não misture insumos entre blocos. Se um insumo estiver vazio, sinalize como \`(sem insumo — leitura baseada em título/descrição)\` e siga.

## 📰 Regras editoriais da plataforma
{{platform_block}}
`;

export function buildSinglesPautaPrompt(
  args: { videos: SinglesVideoInput[]; lengthWords: number },
  settings: Partial<AppSettings> | null | undefined,
): string {
  const { videos, lengthWords } = args;
  const header = SINGLES_PROMPT_HEADER
    .replace(/\{\{length_words\}\}/g, String(lengthWords))
    .replace(/\{\{platform_block\}\}/g, buildPlatformBlock(settings));

  const videoBlocks = videos.map((v, i) => {
    const band = (v.band || '').trim() || '(banda a identificar)';
    const single = (v.single || '').trim() || '(single a identificar)';
    const ma = metalArchivesSearchUrl(v.band, v.single);
    return [
      `## VÍDEO ${i + 1} — ${band} — ${single}`,
      `- video_url: ${v.video_url}`,
      `- ma_url: ${ma}`,
      `- título original: ${v.title}`,
      v.one_liner ? `- one_liner: ${v.one_liner}` : '',
      '',
      'INSUMO (peso 3x DESTE bloco):',
      '<<<',
      (v.insumo || '').trim() || '(vazio — leitura baseada em título/one-liner)',
      '>>>',
    ].filter(Boolean).join('\n');
  }).join('\n\n');

  return [
    header,
    '',
    '# 📥 SINGLES DO EPISÓDIO',
    '',
    videoBlocks,
    '',
    '# 🎯 COMANDO FINAL',
    `Produza a pauta segmentada por vídeo em **Markdown puro**, na ordem acima, respeitando os headers exatos (\`# 🎵 {Banda} — {Single}\`) e a linha de links imediatamente abaixo de cada H1. Tamanho total ≈ ${lengthWords} palavras.`,
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Títulos (3 opções: clickbait / curiosidade / impacto)
// ─────────────────────────────────────────────────────────────────────────────

export type TitleStyle = 'clickbait' | 'curiosidade' | 'impacto';
export interface GeneratedTitle { kind: TitleStyle; text: string }

const TITLE_STYLE_LABEL: Record<TitleStyle, string> = {
  clickbait: 'Clickbait (gancho emocional, sem enganar)',
  curiosidade: 'Curiosidade (pergunta ou fato pouco conhecido)',
  impacto: 'Impacto (afirmação forte, conclusiva)',
};

export function buildTitlesPrompt(args: {
  release: Release | null;
  pautaMarkdown: string;
  insumo?: string;
  subject?: string;
  singles?: Array<{ band?: string; single?: string }>;
}): string {
  const { release, pautaMarkdown, insumo, subject, singles } = args;
  const singlesLine = singles && singles.length > 0
    ? singles.map(s => `${s.band || '?'} — ${s.single || '?'}`).join(' | ')
    : '';
  const band = release?.artist || (singlesLine ? '(round-up de singles)' : (subject ? '(notícia)' : '(banda)'));
  const album = release?.album || (singlesLine || subject || '(álbum)');
  return [
    '# PAPEL',
    'Você é um especialista em copywriting para YouTube, com foco em maximizar o Click-Through Rate (CTR) sem perder relação com o conteúdo apresentado.',
    '',
    '# OBJETIVO',
    'Receber o conteúdo abaixo (pauta do episódio do podcast Heavynauta) e gerar TRÊS títulos distintos para YouTube, cada um usando uma estratégia psicológica diferente para atrair cliques.',
    '',
    '# TAREFA',
    'Analise o conteúdo e identifique: a principal promessa, o elemento mais surpreendente, o conflito central, o aspecto mais curioso e o que desperta maior emoção/expectativa.',
    'Depois produza exatamente três títulos, um por estratégia:',
    '',
    '## 1. Curiosidade 🧐',
    'Cria uma lacuna de informação, desperta vontade de clicar, evita entregar a conclusão, mantém-se fiel ao conteúdo.',
    '',
    '## 2. Impacto 💥',
    'Destaca consequência, magnitude ou importância. Transmite relevância imediata, enfatiza mudança/descoberta, linguagem forte mas precisa.',
    '',
    '## 3. Clickbait ⚡',
    'Maximiza cliques sem prometer nada falso. Mais emocional, dramático, usa surpresa/choque/tensão, mantém correspondência com o conteúdo.',
    '',
    '# REGRAS',
    '- Cada título entre 45 e 70 caracteres quando possível.',
    '- Não invente fatos nem faça promessas que o conteúdo não cumpre.',
    '- Evite títulos genéricos; cada título deve explorar um ângulo diferente.',
    '- Priorize títulos naturais, como grandes canais do YouTube escreveriam.',
    '- Se houver números relevantes no conteúdo, considere usá-los.',
    '- Preserve o tema central do material.',
    '- CAPS LOCK em no máximo 1-2 palavras por título.',
    '- No máximo 2 emojis por título.',
    '- Inclua o nome da banda quando fizer sentido.',
    '- Português brasileiro.',
    '',
    'CONTRATO DE RESPOSTA — RESPONDA APENAS COM JSON VÁLIDO, SEM CODE FENCES, SEM TEXTO EXTRA:',
    '{"titles":[{"kind":"clickbait","text":"..."},{"kind":"curiosidade","text":"..."},{"kind":"impacto","text":"..."}]}',
    'Os três itens são obrigatórios; use exatamente os kinds "curiosidade", "impacto" e "clickbait".',
    '',
    `BANDA: ${band}`,
    `ÁLBUM: ${album}`,
    subject ? `ASSUNTO DA NOTÍCIA: ${subject}` : '',
    singlesLine ? `SINGLES DO EPISÓDIO: ${singlesLine}` : '',
    '',
    'PAUTA (markdown) — fonte principal:',
    '<<<',
    (pautaMarkdown || '').slice(0, 12000),
    '>>>',
    insumo && insumo.trim() ? `\nNOTAS DA PESQUISA:\n${insumo.slice(0, 4000)}` : '',
  ].filter(Boolean).join('\n');
}

/** Parse the strict JSON contract above, tolerando code fences e texto extra. */
export function parseTitlesJson(raw: string): GeneratedTitle[] {
  if (!raw) return [];
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  // pegar o primeiro objeto JSON balanceado
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return [];
  const candidate = s.slice(start, end + 1);
  try {
    const obj = JSON.parse(candidate);
    const arr = Array.isArray(obj?.titles) ? obj.titles : [];
    const valid: TitleStyle[] = ['clickbait', 'curiosidade', 'impacto'];
    return arr
      .filter((t: any) => t && valid.includes(t.kind) && typeof t.text === 'string' && t.text.trim())
      .map((t: any) => ({ kind: t.kind as TitleStyle, text: String(t.text).trim() }))
      .slice(0, 3);
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Descrição HTML do episódio
// ─────────────────────────────────────────────────────────────────────────────

/** Bloco institucional fixo + CTAs adicionados pelo template (não pela IA). */
export const HEAVYNAUTA_INSTITUTIONAL_HTML = `<p><b>Heavynauta — Papo Sério Sobre Música Pesada</b></p>
<p>Diariamente, o Heavynauta traz notícias, reviews e análises do universo do heavy metal. De clássicos atemporais a lançamentos frescos, nosso compromisso é com informação de qualidade e paixão pela música pesada.</p>`;

export function buildDescriptionPrompt(args: {
  selectedTitle: string;
  pautaMarkdown: string;
  mentioned?: string;
  release: Release | null;
  subject?: string;
  singles?: Array<{ band?: string; single?: string; video_url?: string }>;
}): string {
  const { selectedTitle, pautaMarkdown, mentioned, release, subject, singles } = args;
  const mentionedBlock = (mentioned || '').trim();
  const singlesLine = singles && singles.length > 0
    ? singles.map(s => `${s.band || '?'} — ${s.single || '?'}`).join(' | ')
    : '';
  return [
    'Você é o redator-chefe do podcast Heavynauta. Gere APENAS a descrição editorial HTML do episódio.',
    '',
    'REGRAS OBRIGATÓRIAS DE DESCRIÇÃO:',
    '- Saída APENAS em HTML válido, sem markdown, sem code fences, sem comentários.',
    '- Tags permitidas: <p>, <b>, <i>, <a>, <br>, <ul>, <li>, <h3>.',
    '- Use o TÍTULO SELECIONADO como âncora editorial (gancho), mas NÃO repita o título como H1.',
    '- Priorize fatos vindos da pauta como base factual. Não invente seções ausentes.',
    '- NÃO inclua o bloco institucional "Heavynauta — Papo Sério Sobre Música Pesada".',
    '- NÃO inclua CTAs nem links para YouTube, Spotify, Apple Podcasts, Deezer, Pod.link, Discord, WhatsApp — o template adiciona depois.',
    '- Estrutura sugerida: 1 parágrafo de introdução com o gancho do título; lista <ul><li> de tópicos do episódio; 1 parágrafo de fechamento opcional.',
    '',
    'REGRA "MENCIONADO NESTE EPISÓDIO":',
    '- Se houver conteúdo em MENCIONADO abaixo (cada linha/parágrafo é um item), insira NO TOPO da descrição uma seção:',
    '  <h3>🎙️ Mencionado neste episódio</h3>',
    '  <ul>',
    '    <li>EMOJI + 1-2 frases curtas em PT-BR + (se houver URL) <a href="URL" target="_blank" rel="noopener">texto descritivo</a></li>',
    '    ... um <li> por item ...',
    '  </ul>',
    '- Use 1 emoji relevante por item (🎵 música, 🎬 vídeo, 📰 notícia, 📺 canal, 🎸 banda, 🔗 link, 📖 leitura, 🎙️ podcast, 🛒 produto, 📅 evento etc.).',
    '- Se houver URL, embuta como <a href target=_blank rel=noopener>; se não houver, apenas descreva.',
    '- Nunca invente URLs nem fatos. Parafraseie em 1-2 frases.',
    '- Se MENCIONADO estiver vazio, IGNORE essa seção (não adicione nada).',
    '',
    `TÍTULO SELECIONADO: ${selectedTitle}`,
    release ? `BANDA: ${release.artist}` : '',
    release ? `ÁLBUM: ${release.album}` : '',
    subject ? `ASSUNTO DA NOTÍCIA: ${subject}` : '',
    singlesLine ? `SINGLES DO EPISÓDIO: ${singlesLine}` : '',
    '',
    'PAUTA (markdown) — base factual:',
    '<<<',
    (pautaMarkdown || '').slice(0, 16000),
    '>>>',
    '',
    'MENCIONADO:',
    mentionedBlock || '(vazio — não gere a seção)',
    '',
    'Devolva SOMENTE o HTML.',
  ].filter(Boolean).join('\n');
}

/** Strip code fences e tags fora da whitelist mínima do contrato. */
export function sanitizeDescriptionHtml(raw: string): string {
  if (!raw) return '';
  let s = raw.trim();
  s = s.replace(/^```(?:html)?\s*/i, '').replace(/```\s*$/i, '').trim();
  // remove blocos institucionais que a IA tenha gerado mesmo proibida
  s = s.replace(
    /<p[^>]*>[\s\S]*?Heavynauta[^<]*Papo\s+Sério[\s\S]*?<\/p>/gi,
    '',
  );
  return s.trim();
}

/** Junta a descrição editorial da IA com o bloco institucional fixo. */
export function composeFinalDescriptionHtml(editorialHtml: string): string {
  const editorial = sanitizeDescriptionHtml(editorialHtml);
  return `${editorial}\n\n${HEAVYNAUTA_INSTITUTIONAL_HTML}`.trim();
}