

# Plano de Ajustes — Multi-tela

Este plano cobre ~15 ajustes distintos distribuídos por todas as abas do app. Dado o volume, a implementação será dividida em 3 blocos sequenciais.

---

## Bloco 1: Pautas + Reviews + Calendário

### 1.1 Review Rafa/Kilton: janela D-90 a D-1
**Arquivo:** `src/pages/Pautas.tsx`

A função `getEligibleReviews` atualmente filtra `release_date >= D+1`. Trocar para `release_date >= (pubDate - 90 dias)` e `release_date <= (pubDate - 1 dia)`. Mesma lógica no `ReleasePicker`.

### 1.2 Flow: tela de seleção de lançamentos de Sábado
**Arquivo:** `src/pages/Pautas.tsx`

Adicionar um novo passo ao `FLOW_STEPS` entre "Review Kilton" e a tela final de geração:
`{ key: 'saturday_releases', label: 'Lançamentos de Sábado', inputKey: 'selected_release_ids' }`

Renderizar o `SaturdayReleasePicker` para a pauta de sábado nesse step.

### 1.3 Auto-finalização de pautas
**Arquivo:** `src/pages/Pautas.tsx`

Ao salvar inputs (`updateRawInput`) ou aplicar resposta da IA, verificar automaticamente:
- `anniversary` preenchido E `news_link` preenchido
- `review_rafa_id` OU `review_kilton_id` preenchido
- Todas as seções de conteúdo (`sections_json`) preenchidas

Se todas as condições forem atendidas, chamar `updatePauta(id, { status: 'finalized', finalized_at: now() })` automaticamente.

### 1.4 Semana começa na segunda em TODAS as telas
**Arquivos:** `src/pages/CalendarView.tsx`, `src/pages/Dashboard.tsx`

- `CalendarView`: o array `DAYS_OF_WEEK` já começa com Dom. Reordenar para `['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']` e ajustar `getDaysInMonth` para iniciar na segunda.
- Dashboard: garantir que a ordem de dias no grid expandido siga Seg→Dom.

### 1.5 Calendário: miniatura da capa no card
**Arquivo:** `src/pages/CalendarView.tsx`

No `DayCell`, quando o material tiver `cover_url`, exibir uma miniatura (32x32px) da capa no card. Usar `loadMaterialCover` sob demanda ou um thumbnail lazy.

### 1.6 Calendário: botão "Gerar capa" no modal
**Arquivo:** `src/pages/CalendarView.tsx`

No modal de "Pacote do episódio", ao lado de "Baixar capa", adicionar botão "Gerar capa" que navega para `/materials` com o slot do episódio pré-selecionado (ou abre o modal de geração inline).

### 1.7 Calendário: link de visualização da pauta
**Arquivo:** `src/pages/CalendarView.tsx`

No modal, adicionar botão "Visualizar pauta" que abre o `previewPauta` dialog (ou link para `/pautas` com a pauta ativa).

### 1.8 Link compartilhável da semana (página pública)
**Novos arquivos:** `src/pages/PublicWeekView.tsx`, rota `/week/:weekId`

Criar uma página pública (sem autenticação) que:
- Busca semana + pautas + materiais do banco
- Exibe 6 sub-páginas (uma por episódio) com abas
- Cada aba mostra: título, pauta completa com hyperlinks, capa, descrição
- URL compartilhável: `/week/{weekId}`

Adicionar no `App.tsx` como rota pública. No modal do calendário, adicionar botão "Copiar link compartilhável".

---

## Bloco 2: Rivaldo + Releases + Dashboard

### 2.1 Rivaldo: parâmetros detalhados de silêncio e auto-duck
**Arquivos:** `src/lib/audio/types.ts`, `src/components/rivaldo/ParametersSidebar.tsx`

Adicionar ao `AudioParams`:
- `silenceThresholdDb` (já existe: -26, ajustar default para -20)
- `minSilenceDuration` (novo: 0.9s — duração mínima para considerar silêncio)
- `masterLeadSilence` (novo: 7s — silêncio inserido no início da master)
- `duckFadeDownDuration` (já é `fadeDownDuration`: 1.23s)
- `duckFadeUpDuration` (já é `fadeUpDuration`: 0.3s)
- `bgmTailAfterMaster` (já existe: 12s)

Expor todos no sidebar com sliders + campo numérico editável.

Adicionar slider de **qualidade do export** (bitrate): 128, 192, 256, 320 kbps — já existe `outputBitrate`, expor no sidebar.

### 2.2 Dashboard: árvore hierárquica Ano > Mês > Semana > Dia
**Arquivo:** `src/pages/Dashboard.tsx`

Refatorar `weeksByYear` para agrupar em 3 níveis:
```
Ano → Mês (Janeiro, Fevereiro...) → Semana → Dia
```
Cada nível colapsável com accordion, progresso agregado e traffic light.

### 2.3 Releases: cards 1:1 + campo country + bandeira
**Arquivos:** `src/pages/Releases.tsx`, `src/lib/types.ts`, migration SQL

- **Migration**: `ALTER TABLE releases ADD COLUMN country text DEFAULT NULL`
- **Cards**: trocar grid de `md:grid-cols-2 lg:grid-cols-3` para cards com `aspect-square` (1:1)
- **Bandeira**: exibir emoji da bandeira (`🇧🇷`, `🇺🇸` etc.) ao lado do artista em todos os lugares (cards, tabela, pickers)
- **Filtro por país**: dropdown com lista de países únicos + opção "Sem país" para filtrar vazios
- **Auto-fill country na importação**: após importar, para cada release sem `country`, chamar um LLM (Gemini Flash Lite) via edge function para buscar o país da banda. Usar search grounding ou knowledge do modelo.

### 2.4 Títulos sem emojis
**Arquivo:** `src/pages/Materials.tsx`

No `buildTitlePrompt` (ou equivalente), adicionar instrução explícita: "Não use emojis nos títulos." Aplicar sanitização com regex `title.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')` como fallback.

---

## Bloco 3: Settings UX + Modal de progresso + Animações

### 3.1 Configurações: reorganização completa da tela
**Arquivo:** `src/pages/Settings.tsx`

Reestruturar com sub-abas (tabs internas):
- **Tom & Prompts**: slider de tom, prompt manager, template de descrição
- **Termos Banidos**: lista + campo de adição
- **Logs & Exportação**: activity log com export CSV e delete all
- **IA & Tokens**: dashboard de uso de tokens (já implementado como modal, mover para tab dedicada)
- **Áudio**: qualidade de export padrão (bitrate)

### 3.2 Modal de progresso granular em TODOS os botões "Gerar"
**Novo componente:** `src/components/GenerationProgressModal.tsx`

Criar um modal reutilizável que exibe:
- Lista de itens sendo gerados com status (pendente/gerando/concluído/erro)
- Barra de progresso geral
- Timer de elapsed time
- Log de atividade em tempo real

Integrar em:
- Materiais: geração de títulos (individual e bulk), descrições, capas
- Pautas: geração individual e flow
- Qualquer outro botão "Gerar" no app

### 3.3 Parallax e animações
**Arquivos:** múltiplos

- Adicionar `framer-motion` (já instalado) para:
  - Page transitions: fade + slide ao trocar de aba
  - Stagger animation nos cards do dashboard e releases
  - Parallax sutil no header do dashboard
  - Animação de entrada nos modais (scale + fade)
  - Micro-animações em botões de ação (hover scale, click feedback)
  - Progress bars animadas com spring physics

---

## Ordem de Implementação
1. **Bloco 1** (Pautas + Calendar): ~6 alterações, impacto direto no workflow editorial
2. **Bloco 2** (Rivaldo + Releases + Dashboard): ~4 alterações, inclui migration
3. **Bloco 3** (Settings + UX global): ~3 alterações, polimento final

## Detalhes Técnicos
- Bloco 2.3 requer migration SQL para adicionar coluna `country` na tabela `releases`
- Bloco 2.3 requer edge function para auto-fill de país via LLM com busca online
- Bloco 1.8 requer nova rota pública e query RLS adequada (policy `FOR SELECT TO public USING (true)`)
- Bloco 3.3 usa apenas `framer-motion` já disponível no projeto

