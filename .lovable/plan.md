# Plano: Persistência blindada dos insumos + Overhaul UI tabular

## Parte 1 — Persistência dos insumos (bug crítico)

### Diagnóstico

Hoje, cada tecla digitada em qualquer campo de **Pautas → Insumos** chama `updateRawInput` → `updatePauta` → `supabase.update(raw_inputs_json INTEIRO).eq(id)`. Não há:

- Debounce → 1 request por keystroke (rate limit, ordem fora de sequência).
- Garantia de ordem → request mais antigo pode chegar depois e sobrescrever.
- Retry em falha de rede → digitação some sem aviso.
- Indicador visual de "salvando/salvo".
- Proteção ao fechar a aba com edição pendente.

O mesmo padrão existe em `updateMaterial` (Materiais) e edições inline de Releases.

### Correções

1. **Novo hook `useAutosave**` (`src/hooks/use-autosave.ts`):
  - Debounce de 600ms por entidade+campo.
  - Fila por `id` com versionamento monotônico — request com versão menor é descartado ao retornar.
  - Retry exponencial (3 tentativas) em falha de rede.
  - Estado exposto: `idle | dirty | saving | saved | error`.
  - `flush()` síncrono usado em `beforeunload` e ao trocar de pauta/aba.
2. **Refatorar `AppContext.updatePauta`, `updateMaterial`, `updateRelease**`:
  - Atualização local imediata (UI responsiva).
  - Persistência roteada pelo `useAutosave` (debounced + ordenado).
  - Manter API atual (chamadas existentes não quebram).
3. **Indicador global "Salvando…/Salvo"** no header da aba Pautas (e Materiais), alimentado pelo estado da fila.
4. `**beforeunload` guard**: se houver dirty na fila, bloqueia navegação até flush concluir.
5. **Auto-recuperação local**: snapshot do `raw_inputs_json` em `localStorage` por pauta enquanto a fila estiver `dirty/saving`. Limpa ao confirmar `saved`. Se a página recarregar com snapshot pendente, reaplica e re-enfileira.  
  
mas precisa garantir a performance   
  


## Parte 2 — Overhaul de UI: Releases, Pautas, Materiais

### Princípios

- **Tabela como visão padrão** em todas as três abas.
- **Toggle Card/Tabela** visível e consistente (mesmo componente do print: dois ícones, ativo destacado).
- Remover redundâncias: ações duplicadas, blocos repetidos, headers verbosos.
- Favorecer **fluxo de jornada**: ações principais sempre visíveis; ações raras em menus de overflow.

### Componente compartilhado

Criar `src/components/shared/ViewModeToggle.tsx` reutilizável (extraído do que já existe em Releases) + hook `useViewMode(key)` que persiste a escolha em `localStorage` por aba.

### Releases (já tem toggle, só refinar)

- Mover seletor para o mesmo padrão visual do print (compacto, canto direito da toolbar).
- Tabela: priorizar colunas Artist · Album · Country · Genre · Rating · Date · Ações. Remover coluna "Comments" do default (mover para hover/expand).
- Remover botão "Bandas" duplicado — virá como ação no menu overflow.

### Pautas (NOVO — adicionar visão tabular)

Sub-aba **Insumos**: além dos cards atuais (um por dia), adicionar visão tabular com:

```text
| Dia | Tipo | Aniversário | Notícia | Review Rafa | Review Kilton | Direção | Status |
```

- Cada célula é editável inline (popover compacto para campos longos).
- Botão Direção abre o `DirectionEditor` modal já existente.
- Status com badge dinâmico (pesquisa → publicado).
- Sub-abas Insumos/Geração/Preview ganham o `ViewModeToggle` no canto superior direito.
- Remover acordeões redundantes em telas largas.

### Materiais (NOVO — adicionar visão tabular)

- Tabela:

```text
| Dia | Capa (thumb) | Título selecionado | Descrição (✓/✗) | Spotify | Repositório | Status |
```

- Click na linha abre o painel de edição lateral (Sheet) — não navega.
- Visão Card permanece para trabalho visual de capas.
- Remover seção redundante de "ações em massa" da topo — virá em menu overflow.

### Toggle visual (replicando print)

```text
┌────────────┐
│  ▦   ⊞    │   ← table icon (left) | cards icon (right)
└────────────┘
```

Cores via tokens semânticos (`bg-primary` ativo, `bg-card` inativo). Sem cores hardcoded.

## Arquivos afetados

**Persistência:**

- `src/hooks/use-autosave.ts` (novo)
- `src/contexts/AppContext.tsx` (rotear updates)
- `src/pages/Pautas.tsx`, `src/pages/Materials.tsx`, `src/pages/Releases.tsx` (indicador + flush em troca)

**UI Overhaul:**

- `src/components/shared/ViewModeToggle.tsx` (novo)
- `src/hooks/use-view-mode.ts` (novo)
- `src/pages/Releases.tsx` (refinar toolbar, mover botões)
- `src/pages/Pautas.tsx` (adicionar tabela Insumos + toggle nas sub-abas)
- `src/pages/Materials.tsx` (adicionar visão tabular + Sheet de edição)
- `src/components/pautas/InsumosTable.tsx` (novo)
- `src/components/materials/MaterialsTable.tsx` (novo)

## Detalhes técnicos

- Debounce + fila ordenada usa `Map<string, { version: number; pending: Partial<T>; timer }>` por entidade.
- `flush()` aguarda `Promise.all` da fila e retorna boolean.
- `localStorage` keys: `autosave:pauta:<id>`, `autosave:material:<id>`.
- ViewMode key em `localStorage`: `viewMode:releases | viewMode:pautas-insumos | viewMode:pautas-geracao | viewMode:materials`.
- Toggle usa Tailwind tokens; sem cores diretas.
- Tabelas usam `<Table>` shadcn com `sticky` header; respeitam ordem cronológica (Mon→Sun) conforme regra Core de memória.

## Não escopado

- Mudanças de schema no banco (não necessárias).
- Auth/RLS (mantém público como hoje).
- Refator do gerador de pautas / Rivaldo (intocado).