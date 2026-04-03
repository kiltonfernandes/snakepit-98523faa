/**
 * Default prompt texts for each editable block.
 * These are the "factory defaults" that users can override in Settings.
 */

export interface PromptBlock {
  key: string;
  label: string;
  category: 'ingest' | 'output';
  group: string;
  defaultText: string;
}

// ─── INGEST BLOCKS (what the AI reads as context) ───────────────────────────

const COMMON_INSTRUCTIONS = `Responda APENAS com um bloco <snakepit_response> válido.
Use schema_version="snakepit.manual.v1".
NÃO escreva texto fora do contrato.
NÃO invente tags extras.
Siga a identidade editorial Heavynauta.
Nunca invente fatos, datas, quotes ou créditos.
Se faltar insumo, use fallback honesto.
Seções densas: mínimo 500 palavras.
Intro/Outro são locais — NÃO entram no contrato.`;

const BRAND_VOICE = `Público: Comunidade metal brasileira.
Missão: Informar com profundidade, entreter com autenticidade.
Promessa: Papo Sério Sobre Música Pesada.
Framework: Descobrir → Aprofundar → Conectar

Valores:
- Precisão factual acima de tudo
- Respeito a todos os subgêneros
- Linguagem acessível mas informada
- Audio-first: texto será lido em voz alta

Restrições:
- Nunca desmerecer gêneros ou bandas
- Nunca inventar informações
- Nunca usar linguagem excludente
- Nunca clickbait enganoso`;

const GLOBAL_PLAYBOOK = `- Texto direto dentro da tag correta (sem code blocks).
- Cada seção deve ter profundidade editorial real.
- Links de catálogo em markdown: [YouTube](...) | [Spotify](...) | [Deezer](...) | [Metal Archives](...)`;

// ─── OUTPUT BLOCKS (section-specific instructions) ──────────────────────────

const PLAYBOOK_ANNIVERSARY = `- Gere efeméride principal com base no aniversário manual.
- Entrada: "Banda - Álbum" em raw_inputs.anniversary.
- Use comment_anniversary como direção editorial.
- Contexto histórico, recepção, impacto cultural.
- Abertura: data e fato celebrado.
- Mínimo 500 palavras.
- Inclua links de catálogo quando possível.
- Sem input: fallback honesto.`;

const PLAYBOOK_REVIEW_RAFA = `- Review pesquisado e granular do disco selecionado.
- Alvo: raw_inputs.review_rafa_release.
- Use comment_review_rafa como briefing.
- Mínimo 500 palavras.
- Estrutura: gênero, recepção, curiosidades, tema.
- Exige links de catálogo do release.
- Sem release: fallback honesto.`;

const PLAYBOOK_NEWS = `- Transforme a notícia em matéria aprofundada.
- Âncora: sources.news_items.
- Use comment_news como enquadramento.
- Uma matéria por dia.
- Estrutura: título, subtítulo, o que aconteceu, envolvidos.
- Mínimo 500 palavras.`;

const PLAYBOOK_REVIEW_KILTON = `- Análise aprofundada com contexto, expectativa e relevância.
- Alvo: raw_inputs.review_kilton_release.
- Use comment_review_kilton como ajuste.
- Mínimo 500 palavras.
- Estrutura: contextualização, expectativas, citações, relevância.
- Exige links de catálogo.
- Sem release: fallback honesto.`;

const PLAYBOOK_NEXT_WEEK_RELEASES = `- Seção de sábado com destaques e demais lançamentos.
- Pool: raw_inputs.weekly_release_pool.
- Destaques: raw_inputs.selected_releases.
- Separe em: ### Destaques da Semana e ### Demais Lançamentos.
- Links de catálogo para cada release.
- Mínimo 500 palavras nos destaques.`;

const MATERIAL_TITLES_INSTRUCTIONS = `Regras de títulos:
- 3 opções por episódio (clickbait, curiosidade, impacto)
- Máximo ~60-70 caracteres
- Caps lock em no máximo 1-2 palavras
- Nome da banda quando fizer sentido
- No máximo 2 emojis
- Nunca clickbait enganoso`;

const MATERIAL_DESCRIPTIONS_INSTRUCTIONS = `Regras de descrição:
- HTML válido: <p>, <b>, <i>, <a>, <br>, <ul>, <li>
- Use o título selecionado como âncora
- Priorize "Notícias" como base factual
- Não invente seções ausentes
- Inclua bloco institucional antes dos CTAs
- CTAs obrigatórios: "Ouça onde quiser" + links (YouTube, Spotify, Apple Podcasts, Deezer, Pod.link, Discord, WhatsApp)`;

const MATERIAL_BRAND_BLOCK = `<p><b>Heavynauta — Papo Sério Sobre Música Pesada</b></p>
<p>Diariamente, o Heavynauta traz notícias, reviews e análises do universo do heavy metal. De clássicos atemporais a lançamentos frescos, nosso compromisso é com informação de qualidade e paixão pela música pesada.</p>`;

// ─── Registry ───────────────────────────────────────────────────────────────

export const PROMPT_BLOCKS: PromptBlock[] = [
  // Ingest - shared
  { key: 'common_instructions', label: 'Instruções Globais', category: 'ingest', group: 'Compartilhado', defaultText: COMMON_INSTRUCTIONS },
  { key: 'brand_voice', label: 'Identidade Heavynauta', category: 'ingest', group: 'Compartilhado', defaultText: BRAND_VOICE },
  { key: 'global_playbook', label: 'Regras de Playbook', category: 'ingest', group: 'Compartilhado', defaultText: GLOBAL_PLAYBOOK },

  // Output - per section
  { key: 'playbook_anniversary', label: 'Aniversário', category: 'output', group: 'Seções', defaultText: PLAYBOOK_ANNIVERSARY },
  { key: 'playbook_review_rafa', label: 'Review Rafa', category: 'output', group: 'Seções', defaultText: PLAYBOOK_REVIEW_RAFA },
  { key: 'playbook_news', label: 'Notícias', category: 'output', group: 'Seções', defaultText: PLAYBOOK_NEWS },
  { key: 'playbook_review_kilton', label: 'Review Kilton', category: 'output', group: 'Seções', defaultText: PLAYBOOK_REVIEW_KILTON },
  { key: 'playbook_next_week_releases', label: 'Lançamentos da Semana', category: 'output', group: 'Seções', defaultText: PLAYBOOK_NEXT_WEEK_RELEASES },

  // Output - materials
  { key: 'material_titles_instructions', label: 'Títulos de Materiais', category: 'output', group: 'Materiais', defaultText: MATERIAL_TITLES_INSTRUCTIONS },
  { key: 'material_descriptions_instructions', label: 'Descrições de Materiais', category: 'output', group: 'Materiais', defaultText: MATERIAL_DESCRIPTIONS_INSTRUCTIONS },
  { key: 'material_brand_block', label: 'Bloco Institucional', category: 'output', group: 'Materiais', defaultText: MATERIAL_BRAND_BLOCK },
];

export type PromptOverrides = Record<string, string>;

export function getPromptText(key: string, overrides: PromptOverrides = {}): string {
  if (overrides[key]) return overrides[key];
  const block = PROMPT_BLOCKS.find(b => b.key === key);
  return block?.defaultText || '';
}
