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

## 💿 Disco alvo
{{input}}

## 🗃️ Dados completos do release
{{release_block}}

## 📰 Regras editoriais da plataforma
{{platform_block}}

## 🧠 Direção editorial / Insumo da pesquisa
{{notes}}

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