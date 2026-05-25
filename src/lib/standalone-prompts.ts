/**
 * Default prompts for standalone (avulso) episode topics.
 *
 * Each topic type has its own prompt template that the editor can edit
 * before copying it to an external AI. The editor then pastes the response
 * back into the wizard.
 *
 * The prompts intentionally re-use the Heavynauta voice rules from the
 * weekly pautas pipeline so the editorial tone stays consistent.
 */
import { StandaloneTopicType, Release, AppSettings } from './types';

export interface StandaloneTopicMeta {
  type: StandaloneTopicType;
  label: string;
  icon: string;
  inputKind: 'release' | 'url';
  inputLabel: string;
  inputHint: string;
}

export const STANDALONE_TOPIC_META: Record<StandaloneTopicType, StandaloneTopicMeta> = {
  anniversary: {
    type: 'anniversary',
    label: 'Aniversário de álbum',
    icon: '🎂',
    inputKind: 'url',
    inputLabel: 'URL de referência (Wikipedia, Metal Archives, matéria)',
    inputHint: 'Cole um link com informações sobre o álbum aniversariante.',
  },
  review: {
    type: 'review',
    label: 'Review de álbum',
    icon: '💿',
    inputKind: 'release',
    inputLabel: 'Disco a ser resenhado',
    inputHint: 'Selecione o lançamento da base de releases.',
  },
  news: {
    type: 'news',
    label: 'Notícia',
    icon: '📰',
    inputKind: 'url',
    inputLabel: 'URL da notícia',
    inputHint: 'Cole o link da matéria de origem.',
  },
  interview: {
    type: 'interview',
    label: 'Entrevista (Faixa a Faixa)',
    icon: '🎙️',
    inputKind: 'url',
    inputLabel: 'Link da banda / álbum (Spotify, Bandcamp, Metal Archives)',
    inputHint: 'Cole um link de referência sobre o convidado/álbum.',
  },
};

const SHARED_VOICE_RULES = `Você escreve para o Heavynauta — Papo Sério Sobre Música Pesada.
Voz editorial: precisa, equilibrada, sem clickbait enganoso, respeitosa com todos os subgêneros.
Português (BR), clareza ESL B1, frases curtas, sem markdown além de [Texto](url) para catálogo.
Nunca invente fatos. Se faltar insumo, faça um fallback honesto.`;

// ─── Dynamic context blocks ────────────────────────────────────────────────

/** Renders a release as a labeled block. Skips empty fields. */
export function buildReleaseBlock(release: Release | null | undefined): string {
  if (!release) return '(nenhum release vinculado)';
  const lines: string[] = [];
  lines.push(`Artista: ${release.artist}`);
  lines.push(`Álbum: ${release.album}`);
  if (release.release_date) lines.push(`Lançamento: ${release.release_date}`);
  if (release.country) lines.push(`País: ${release.country}`);
  if (release.genres?.length) lines.push(`Gêneros: ${release.genres.join(', ')}`);
  if (release.rating != null) lines.push(`Nota interna: ${release.rating}`);
  if (release.comments) lines.push(`Comentários do editor: ${release.comments}`);
  const links: Array<[string, string | null | undefined]> = [
    ['Spotify', release.spotify_url],
    ['Bandcamp', release.bandcamp_url],
    ['YouTube', release.youtube_url],
    ['Apple Music', release.apple_music_url],
    ['Deezer', release.deezer_url],
    ['Metal Archives', release.metal_archives_url],
  ];
  const present = links.filter(([, v]) => !!v);
  if (present.length) {
    lines.push('Links de catálogo:');
    for (const [label, url] of present) lines.push(`- ${label}: ${url}`);
  }
  return lines.join('\n');
}

/** Renders the platform-wide editorial guardrails (banned terms, tone temp). */
export function buildPlatformBlock(settings: Partial<AppSettings> | null | undefined): string {
  if (!settings) return '(sem regras adicionais)';
  const lines: string[] = [];
  if (typeof settings.brand_tone_temperature === 'number') {
    lines.push(`Temperatura editorial (0=cirúrgico, 100=incendiário): ${settings.brand_tone_temperature}`);
  }
  const banned = (settings.banned_terms_text || '').trim();
  if (banned) {
    lines.push('Termos PROIBIDOS (não usar nem variações):');
    for (const t of banned.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean)) {
      lines.push(`- ${t}`);
    }
  }
  return lines.length ? lines.join('\n') : '(sem regras adicionais)';
}

// ─── Per-topic prompts ──────────────────────────────────────────────────────

const PROMPT_ANNIVERSARY = `${SHARED_VOICE_RULES}

TAREFA: Escreva uma seção editorial sobre o aniversário de um álbum.
- Identifique álbum, banda, ano de lançamento, marco do aniversário.
- Cubra contexto histórico, recepção, impacto e legado.
- Cite curiosidades de gravação quando relevantes.
- ~250 palavras em prosa contínua.
- Inclua links de catálogo no fim quando possível.

INSUMO PRINCIPAL:
{{input}}

DADOS DA PLATAFORMA SOBRE O DISCO (use como verdade):
{{release_block}}

REGRAS EDITORIAIS DA PLATAFORMA:
{{platform_block}}

DIREÇÃO EDITORIAL:
{{notes}}`;

const PROMPT_REVIEW = `${SHARED_VOICE_RULES}

TAREFA: Monte a PAUTA completa de um episódio AVULSO de review de álbum no formato Heavynauta abaixo.
Siga EXATAMENTE a estrutura, ordem, emojis, bullets, indentação e blocos fixos. Não troque rótulos.
Preencha todos os campos entre colchetes com base nos DADOS DO RELEASE e na pesquisa.
SEGWAY1 e SEGWAY2 são falas FIXAS — copie literalmente como estão no template, sem reescrever.

ESTRUTURA OBRIGATÓRIA (preencha mantendo a forma):

[Título:[Banda] - [album]: subtítulo criativo]

🔗 Link

-[Metal Archives]:[link obrigatório]

SEGWAY1 [Você está ouvindo  Heavynauta, o podcast que te leva para explorar o universo do Heavy Metal, todos os dias de segunda a sexta, às 6 da manhã um metal novo na sua timeline . E todo sábado, às 18 horas, tem o Sonar Heavynauta, nosso episódio semanal com um panorama dos lançamentos da próxima semana, para você marcar na agenda e não perder nadinha!

Se está curtindo o que ouviu até agora, que tal dar aquela força para a gente? Segue a gente no Spotify, deixe aquelas cinco estrelas cheias de brilho, escreva um comentário e compartilhe com seus amigos metaleiros nos seus grupos de WhatsApp . Sua participação ajuda o Heavynauta a chegar a mais fãs de metal como você!]

🤘 Que Metal é Esse?

-[Gênero]

 -[Características:+/-20 palavras]

-Bandas Pioneiras(3):

 -[B1]:[+/-20 palavras]

  -[ponto1:+/-20]

  -[ponto2:+/-20]

  -[ponto3:+/-20]

 -[B2]:[+/-20 palavras]

  -[ponto1:+/-20]

  -[ponto2:+/-20]

  -[ponto3:+/-20]

 -[B3]:[+/-20 palavras]

  -[ponto1:+/-20]

  -[ponto2:+/-20]

  -[ponto3:+/-20]

-Bandas Similares(3):

 -[BS1]:[+/-20 palavras]

  -[ponto1:+/-20]

  -[ponto2:+/-20]

  -[ponto3:+/-20]

 -[BS2]:[+/-20 palavras]

  -[ponto1:+/-20]

  -[ponto2:+/-20]

  -[ponto3:+/-20]

 -[BS3]:[+/-20 palavras]

  -[ponto1:+/-20]

  -[ponto2:+/-20]

  -[ponto3:+/-20]

🔍 Curiosidades

-[Item1]:[+/-20]

 -[Sub1]:[+/-20]

  -[SubSub1:+/-20]

  -[SubSub2:+/-20]

  -[SubSub3:+/-20]

 -[Sub2]:[+/-20]

  -[SubSub1:+/-20]

  -[SubSub2:+/-20]

  -[SubSub3:+/-20]

 -[Sub3]:[+/-20]

  -[SubSub1:+/-20]

  -[SubSub2:+/-20]

  -[SubSub3:+/-20]

🎭 Tema do Disco

-[Item1]:[+/-20]

 -[Sub1]:[+/-20]

  -[SubSub1:+/-20]

  -[SubSub2:+/-20]

  -[SubSub3:+/-20]

 -[Sub2]:[+/-20]

  -[SubSub1:+/-20]

  -[SubSub2:+/-20]

  -[SubSub3:+/-20]

 -[Sub3]:[+/-20]

  -[SubSub1:+/-20]

  -[SubSub2:+/-20]

  -[SubSub3:+/-20]

-[Item2]a[Item4]:igual acima

🎙️ Encerramento

-Resumo:[+/-50 palavras]

-Se gostou do [disco]da[banda],Heavynauta recomenda:

 -[banda]-[album]-[ano]-[semelhança]

 -[banda]-[album]-[ano]-[semelhança]

 -[banda]-[album]-[ano]-[semelhança]

SEGWAY2 [E esse foi o  Heavynauta, o podcast que te leva para explorar o universo do Heavy Metal, todos os dias de segunda a sexta, às 6 da manhã um metal novo na sua timeline . E todo sábado, às 18 horas, tem o Sonar Heavynauta, nosso episódio semanal com um panorama dos lançamentos da próxima semana, para você marcar na agenda e não perder nadinha!

Se curtiu o que ouviu até agora, que tal nos dar aquela força? Siga a gente no Spotify, deixe aquelas cinco estrelas que nos precisamos, escreva um comentário bacana e compartilhe com seus amigos metaleiros nos seus grupos de WhatsApp . Sua participação ajuda o Heavynauta a chegar a mais fãs de metal como você!

A nossa nave esta levantando voo mais uma vez, um abraço para você, Heavynauta, e nos vemos no próximo episódio!]

#Restrições

-Não inventar dados;fontes confiáveis

-Metal Archives antes de tudo

-15 reviews antes Tema do Disco

-Entrevistas para quotes Curiosidades

-Tema:6 itens,3 sub,3 subsub

-Cada bloco:50 palavras mínimo

-Emojis e bullets

DISCO ALVO:
{{input}}

DADOS COMPLETOS DO RELEASE (banco da plataforma — fonte de verdade):
{{release_block}}

REGRAS EDITORIAIS DA PLATAFORMA:
{{platform_block}}

DIREÇÃO EDITORIAL:
{{notes}}`;

const PROMPT_NEWS = `${SHARED_VOICE_RULES}

TAREFA: Transforme a notícia abaixo em uma matéria editorial Heavynauta.
- Estrutura: o que aconteceu, quem está envolvido, contexto, impacto.
- Cruze com contexto da cena/banda/gênero.
- ~400 palavras em prosa contínua.

URL DA NOTÍCIA:
{{input}}

REGRAS EDITORIAIS DA PLATAFORMA:
{{platform_block}}

DIREÇÃO EDITORIAL:
{{notes}}`;

const PROMPT_INTERVIEW = `Você é um(a) produtor(a) de podcast e entrevistador(a) especialista em Heavy Metal, com experiência em entrevistas com bandas, artistas, produtores e músicos.
Sua tarefa é criar uma pauta completa e escalável para o quadro:
Heavynauta — Faixa a Faixa
Este quadro faz parte do podcast apresentado por Kilton Fernandes e Rafa.
A pauta deve ser repetível (mesma estrutura em todo episódio), mas sempre diferente (perguntas variam a cada convidado).

INPUT (sempre vou te enviar)
- Convidado(s): [NOME DO CONVIDADO]
- Banda/Projeto: [BANDA/PROJETO]
- Álbum: [NOME DO ÁLBUM]
- Ano: [ANO]
- Links (se houver): [LINKS]

REGRA DE PLURAL (quando houver 2+ convidados)
Quando [NOME DO CONVIDADO] tiver mais de um nome:
- Trate como [NOMES DOS CONVIDADOS] (ex.: "Fulano e Sicrano").
- Alterne quem responde e inclua chamadas direcionadas (letra pro vocal, arranjo pro guitarrista etc.).
- Ajuste "bem vindo(a)" para "bem vindos(as)".

PESQUISA RÁPIDA (uso interno, NÃO entra na pauta final)
- Priorize fontes oficiais (site, Bandcamp, Spotify, Metal Archives, press release).
- Use links do input como prioridade.
- Não invente. Se algo não for encontrado, apenas não use.

FORMATO DA RESPOSTA (obrigatório)
A pauta deve vir APENAS com estas seções, nesta ordem, sem texto extra:
1. Introdução (falas fixas)
2. Perguntas — Faixa a Faixa | [NOME DO ÁLBUM] (5–7)
3. Segway para Fechando a Conta (falas fixas)
4. Perguntas — Fechando a Conta | [NOME DO ÁLBUM] (5)
5. Segway de Encerramento (falas fixas)

Regras de formatação:
- Use emojis nos títulos (ex.: 🎙️, 🎸, 💸, ✅, 🚀).
- Use **negrito** para hosts e rótulos importantes.
- Use *itálico* para observações de tom (curtas).
- Nas listas, mantenha somente a pergunta (sem parágrafos contextualizando).
- Não inclua "Convidado", "Banda", "Álbum", "Ano", "Links" como seções no final.
- Sem perguntas tipo "você prefere..." no final.
- Sem citações ou marcadores de fonte.
- Sem links em colchetes-rótulo. Se precisar, no máximo 3 links em "Links úteis: ...".
- Não inclua "Estrutura do episódio" na pauta final.
- Perguntas devem ser perguntas DIRETAS, numeradas.

INTRODUÇÃO (falas fixas — copiar e colar e preencher placeholders)
Kilton: "Saudações, Heavynautas. O meu nome é Kilton Fernandes e esse episodio é o ***Heavynauta — Faixa a Faixa***, o nosso episodio onde a gente abre o disco, aperta o play e vamos trocar uma ideia sobre a história por trás de cada faixa."
Rafa: "É isso mesmo Kilton. Hoje estamos aqui pra virar o álbum do avesso. No episódio de hoje a gente recebe [NOME DO CONVIDADO], da [BANDA/PROJETO], pra falar do álbum [NOME DO ÁLBUM] ([ANO]). E é com muito prazer que recebemos [NOME DO CONVIDADO], seja muito bem vindo(a)."

PERGUNTAS — FAIXA A FAIXA (5 a 7)
Selecione 5–7 perguntas do banco abaixo e escreva versões específicas para este álbum, usando a pesquisa/tracklist. Cada pergunta segue sendo UMA pergunta só, sem parágrafos.

Banco resumido (escolha variando estilos):
- Como nasceu a primeira ideia deste álbum
- Qual música foi a primeira a ser composta
- Qual faixa mudou mais entre demo e versão final
- Qual riff nasceu primeiro
- Qual faixa representa melhor o espírito da banda
- Qual música quase ficou fora do álbum
- Qual faixa funciona melhor ao vivo
- Qual música tem a letra mais pessoal
- Qual faixa tem o melhor solo
- Qual música tem a melhor virada/quebra
- Qual faixa foi a mais difícil tecnicamente
- Qual música ficou melhor do que vocês esperavam

SEGWAY — entrada para Fechando a Conta (falas fixas)
Kilton: "Aí sim. Foi uma conversa monstra e deu pra abrir bem esse disco… mas o tempo voa. Então bora pro nosso bloco final: Fechando a Conta."
Rafa: "Vambora. Agora a gente vai pro Fechando a Conta. A gente vai te fazer algumas perguntas e você pode comentar à vontade, no seu tempo. Bora!"
Kilton: "Primeira: [PERGUNTA ESCOLHIDA DO BANCO]"

PERGUNTAS — FECHANDO A CONTA (5 prompts aleatórios)
Selecione 5 prompts variando entre: álbum, banda, show, músico/riff/solo, recomendação. Apenas os prompts numerados, sem contexto.

Banco resumido:
- Álbum perfeito de metal
- Banda subestimada
- Riff mais pesado já feito
- Melhor vocal do metal
- Melhor show que você viu
- Banda que mudou sua vida
- Álbum clássico obrigatório
- Banda nova que merece atenção
- Melhor capa de álbum
- Melhor produção de álbum
- Melhor solo de guitarra
- Melhor recomendação final: um álbum e uma banda para a galera ouvir hoje

SEGWAY DE ENCERRAMENTO (falas fixas)
Kilton: "E pra fechar, [NOME DO CONVIDADO], deixa o recado pra galera: onde o pessoal te encontra, quais são os próximos passos da [BANDA/PROJETO], e o que você quiser divulgar aqui."
Convidado: "[CTAs do convidado]"
Rafa: "Boa demais. Obrigado por colar com a gente, [NOME DO CONVIDADO]."
Kilton: "E esse foi mais um Heavynauta — Faixa a Faixa. Se curtiu esse episódio, dá aquela força: segue a gente no Spotify, deixa 5 estrelas, compartilha com os metaleiros do seu grupo. A nossa nave tá levantando voo mais uma vez. Um abraço pra você, Heavynauta, e a gente se vê no próximo episódio."

REGRAS FINAIS
- A resposta deve ser uma PAUTA FINAL pronta para gravação.
- Não inclua bastidores nem fontes.
- Sem links em excesso.

INSUMO DO CONVIDADO/ÁLBUM:
{{input}}

DADOS DO RELEASE (se vinculado):
{{release_block}}

REGRAS EDITORIAIS DA PLATAFORMA:
{{platform_block}}

DIREÇÃO EDITORIAL EXTRA:
{{notes}}`;

const PROMPT_TITLE = `${SHARED_VOICE_RULES}

TAREFA: Gere 3 opções de título para um episódio Heavynauta a partir do conteúdo abaixo.
Cada opção em uma linha, sem numeração nem marcadores. Estilos:
1) Clickbait (instigante mas honesto)
2) Curiosidade (gancho informativo)
3) Impacto (frase forte, direta)
Máximo ~65 caracteres por título. Máximo 1 emoji.

CONTEÚDO DO EPISÓDIO:
{{content}}

REGRAS EDITORIAIS DA PLATAFORMA:
{{platform_block}}`;

const PROMPT_DESCRIPTION = `${SHARED_VOICE_RULES}

TAREFA: Escreva a DESCRIÇÃO (HTML simples) para a publicação do episódio.
- Use só <p>, <b>, <i>, <a>, <br>, <ul>, <li>.
- Use o título como âncora.
- Inclua os principais tópicos como lista curta.
- NÃO inclua o bloco institucional "Heavynauta — Papo Sério Sobre Música Pesada".
- NÃO inclua CTAs de plataformas.

TÍTULO ESCOLHIDO:
{{title}}

CONTEÚDO DO EPISÓDIO:
{{content}}

REGRAS EDITORIAIS DA PLATAFORMA:
{{platform_block}}`;

const PROMPT_COVER = `${SHARED_VOICE_RULES}

TAREFA: Descreva uma capa quadrada (3000x3000) para o episódio.
Estilo Heavynauta: visual editorial pesado, contrastado, tipografia forte.
Em uma frase de até 30 palavras, dê uma direção visual concreta (cor, mood, elementos).

CONTEÚDO DO EPISÓDIO:
{{content}}

REGRAS EDITORIAIS DA PLATAFORMA:
{{platform_block}}`;

// ─── Helpers ────────────────────────────────────────────────────────────────

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] ?? '').trim() || '(não informado)');
}

export interface StandaloneTopicPromptCtx {
  input: string;
  notes: string;
  release?: Release | null;
  platform?: Partial<AppSettings> | null;
}

export function getStandaloneTopicPrompt(
  type: StandaloneTopicType,
  vars: StandaloneTopicPromptCtx,
  overrideTemplate?: string | null,
): string {
  const filled = {
    input: vars.input,
    notes: vars.notes,
    release_block: buildReleaseBlock(vars.release),
    platform_block: buildPlatformBlock(vars.platform),
  };
  if (overrideTemplate && overrideTemplate.trim() && overrideTemplate.trim() !== '__BUILTIN__') {
    return fill(overrideTemplate, filled);
  }
  switch (type) {
    case 'anniversary': return fill(PROMPT_ANNIVERSARY, filled);
    case 'review':      return fill(PROMPT_REVIEW, filled);
    case 'news':        return fill(PROMPT_NEWS, filled);
    case 'interview':   return fill(PROMPT_INTERVIEW, filled);
  }
}

/** Returns the raw built-in template text for a given topic type (for cloning into custom templates). */
export function getBuiltinTemplateText(type: StandaloneTopicType): string {
  switch (type) {
    case 'anniversary': return PROMPT_ANNIVERSARY;
    case 'review':      return PROMPT_REVIEW;
    case 'news':        return PROMPT_NEWS;
    case 'interview':   return PROMPT_INTERVIEW;
  }
}

function resolveBuiltin(template: string | null | undefined, builtin: string): string {
  if (!template) return builtin;
  const trimmed = template.trim();
  if (!trimmed || trimmed === '__BUILTIN__') return builtin;
  return template;
}

export function getStandaloneTitlePrompt(content: string, platform?: Partial<AppSettings> | null, override?: string | null): string {
  return fill(resolveBuiltin(override, PROMPT_TITLE), { content, platform_block: buildPlatformBlock(platform) });
}

export function getStandaloneDescriptionPrompt(title: string, content: string, platform?: Partial<AppSettings> | null, override?: string | null): string {
  return fill(resolveBuiltin(override, PROMPT_DESCRIPTION), { title, content, platform_block: buildPlatformBlock(platform) });
}

export function getStandaloneCoverPrompt(content: string, platform?: Partial<AppSettings> | null, override?: string | null): string {
  return fill(resolveBuiltin(override, PROMPT_COVER), { content, platform_block: buildPlatformBlock(platform) });
}

/** Returns the raw built-in text for a given component key + topic type. */
export function getBuiltinComponentText(type: StandaloneTopicType, key: 'pauta_completa' | 'capa' | 'titulo' | 'descricao'): string {
  if (key === 'capa')      return PROMPT_COVER;
  if (key === 'titulo')    return PROMPT_TITLE;
  if (key === 'descricao') return PROMPT_DESCRIPTION;
  return getBuiltinTemplateText(type);
}
