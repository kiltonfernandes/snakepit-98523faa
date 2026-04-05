

# Plano de Ajustes — Rodada de Polimento

## 1. Hover e animações em TODOS os cards do app
**Arquivos:** `Releases.tsx`, `CalendarView.tsx`, `Dashboard.tsx`, `Materials.tsx`, `Pautas.tsx`, `Settings.tsx`

Adicionar `hover:scale-[1.02] hover:shadow-lg hover:border-primary/40 transition-all duration-200` em todos os `Card` interativos. Nos cards com `motion.div`, adicionar `whileHover={{ scale: 1.02 }}`.

## 2. Botão "Source" no modal de Colar Lançamentos
**Arquivo:** `src/pages/Releases.tsx`

No `pasteDialogOpen` dialog, adicionar botão com ícone `ExternalLink` e label "Source" que abre `https://metalstorm.net/events/new_releases.php?upcoming=1&invisible=1` em nova aba. Posicionar ao lado do texto explicativo do formato.

## 3. Campo País no formulário de edição individual
**Arquivo:** `src/pages/Releases.tsx`

Adicionar campo `country` ao `emptyForm` e ao formulário de edição (tab "Informações"), com `Input` para texto livre. Exibir bandeira emoji ao lado. Garantir que `handleSave` persiste o campo `country`. Adicionar bandeira nos headers da tabela e em todos os locais que exibem releases.

## 4. Cards de releases mais compactos
**Arquivo:** `src/pages/Releases.tsx`

Remover `aspect-square` dos cards. Criar um design compacto horizontal:
- Layout: ícone bandeira + artista/álbum em coluna + data + badges de gênero + links de plataforma
- Proporção retangular (tipo card de lista), altura ~120px
- Grid: `sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4`
- Mantém checkbox no hover e seleção

## 5. Fix enriquecimento de países + modal de progresso
**Arquivos:** `src/pages/Releases.tsx`, `supabase/functions/lookup-country/index.ts`

**Edge function**: Corrigir URL para `https://ai.gateway.lovable.dev/v1/chat/completions` (atualmente usa `https://api.lovable.dev/v1/chat/completions` que pode não funcionar).

**Frontend**: Após importar, chamar `enrichCountries` com modal de progresso:
- Novo estado `repatriateModal` com items (um por release sem país)
- Processar em batches de 30 artistas, atualizando o progresso por batch
- Exibir: `X/Y releases repatriados`
- Usar `GenerationProgressModal` existente para mostrar progresso

## 6. Modal de progresso granular em TODOS os botões "Gerar"
**Arquivos:** `src/pages/Pautas.tsx`, `src/pages/Materials.tsx`, `src/pages/CalendarView.tsx`

O `GenerationProgressModal` já existe e está integrado em Materials (bulk titles/descriptions). Falta integrar em:
- **Pautas**: `handleGenerateAI` (geração individual), `handleFlowAutoGenerateInner` (flow)
- **Materials**: geração individual de título e descrição (não apenas bulk)
- **Calendário**: botão "Gerar capa" no modal do episódio

Cada ação que chama IA deve abrir o modal com 1+ items mostrando status.

## 7. Botão "Gerar capa" no Calendário abre modal de geração
**Arquivo:** `src/pages/CalendarView.tsx`

Atualmente o botão "Gerar capa" navega para `/materials`. Mudar para abrir um dialog inline no próprio calendário com:
- Input de URL da imagem
- Busca sugerida (query baseada no título do episódio)
- Botão "Buscar Imagens" (abre Google Images)
- Botão "Gerar Capa" que chama a mesma lógica de `generateCover` de Materials

Isso requer extrair a lógica de geração de capa (`generateCover`, `fetchCanvasSafeImageUrl`, `drawWrappedText`) para um módulo compartilhado ou importar de Materials.

## 8. Sistema de Templates de Pauta escalável
**Arquivos novos + migration SQL + alterações em múltiplos arquivos**

### Arquitetura:

**Migration SQL**: Nova tabela `pauta_templates`:
```sql
CREATE TABLE pauta_templates (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text DEFAULT '',
  sections_config jsonb NOT NULL DEFAULT '[]',
  segway_intro text DEFAULT '',
  segway_outro text DEFAULT '',
  created_at text DEFAULT to_char(now(), ...),
  updated_at text DEFAULT to_char(now(), ...)
);
```

`sections_config` é um array de objetos:
```json
[
  { "key": "anniversary", "label": "Aniversário", "enabled": true, "core_prompt": "..." },
  { "key": "review", "label": "Review", "enabled": true, "core_prompt": "..." },
  { "key": "news", "label": "Notícias", "enabled": true, "core_prompt": "..." },
  { "key": "releases", "label": "Lançamentos", "enabled": false },
  { "key": "interview", "label": "Entrevista", "enabled": false },
  { "key": "list", "label": "Lista", "enabled": false }
]
```

**Tabela pautas**: Adicionar coluna `template_id text DEFAULT NULL` referenciando o template usado.

**Settings**: Nova sub-aba "Templates de Pauta" com:
- Lista de templates existentes (CRUD)
- Editor de template: nome, descrição, segways, e toggle + prompt editor por seção
- Seções disponíveis: review, lançamentos, aniversário, notícia, entrevista, lista

**Propagação no app**:
- `src/lib/constants.ts`: `getSectionsForDay` passa a considerar o template da pauta
- `src/lib/types.ts`: Adicionar interface `PautaTemplate`
- `Pautas.tsx`: Ao criar pauta, permitir escolher template. Seções dinâmicas baseadas no template
- `Materials.tsx`: Gerar conteúdo baseado nas seções do template
- `Dashboard.tsx`, `CalendarView.tsx`, `Rivaldo.tsx`: Compatíveis com seções dinâmicas

### Templates default (seed):
- **Notícias** (Seg-Sex): anniversary + review + news
- **Sábado**: anniversary + releases
- Nenhum template adicional criado — o usuário cria os seus

## Ordem de Implementação
1. Fix edge function URL + enriquecimento de países (#5)
2. Cards compactos + campo país no form (#3, #4)
3. Botão Source no modal de paste (#2)
4. Hover/animações globais (#1)
5. Modal progresso em todos os "Gerar" (#6)
6. Gerar capa inline no calendário (#7)
7. Sistema de templates de pauta (#8) — maior complexidade

## Detalhes Técnicos
- Item #5 requer deploy da edge function com URL corrigida
- Item #7 requer extrair lógica de cover para módulo compartilhado (`src/lib/cover-generator.ts`)
- Item #8 requer migration SQL + seed de templates default + refactor de `getSectionsForDay`

