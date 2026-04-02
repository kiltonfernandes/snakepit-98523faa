

# Snakepit 2.0 -- Plano de Implementacao Fase 1

Agora que tenho o mapeamento completo dos dois repositorios e os modelos de capa, vou comecar pela fundacao do app.

---

## O que sera construido nesta fase

A **Fase 1** cria o esqueleto completo do app com navegacao funcional, design system moderno e as 7 abas com UI placeholder. Isso estabelece a base visual e estrutural para todas as fases seguintes.

---

## Estrutura do Template de Capa (baseado nas imagens enviadas)

Analisando os 4 modelos, o layout da capa e um quadrado 1080x1080 com:

```text
┌──────────────────────────────────────┐
│  ┌─ Moldura sci-fi (cantos cortados)│
│  │                                   │
│  │   IMAGEM PRINCIPAL (60%)          │
│  │   (foto da banda/artista)         │
│  │                                   │
│  └───────────────────────────────────│
│  ▓▓▓▓ Barra cinza ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│  ┌─────────────┐                     │
│  │ Heavynauta  │  (label lavanda)    │
│  └─────────────┘                     │
│                                      │
│  TITULO DO EPISODIO    [LOGO]        │
│  (bold, roxo escuro)   (circular)    │
│  ────────────────                    │
│       Papo Serio Sobre Musica Pesada │
└──────────────────────────────────────┘
│ Borda lateral roxa escura (esquerda) │
```

Elementos fixos: moldura sci-fi, barra cinza, label "Heavynauta" lavanda, logo circular, tagline, linha decorativa roxa. Elemento variavel: imagem de fundo e titulo.

---

## Plano Tecnico

### 1. Design System e Layout Principal

- **Tema dark-first** com palette Heavynauta: roxo escuro (#2D1B4E), lavanda (#C8A2C8), cinza quente, vermelho accent
- **Layout**: sidebar colapsavel a esquerda com 7 icones de aba + area de conteudo principal
- **Componentes base**: StatusBadge, WorkspaceShell (componente compartilhado entre Pautas e Materiais), DayColumn

### 2. Routing e Navegacao (7 abas)

| Rota | Aba | Icone |
|---|---|---|
| `/` | Dashboard | LayoutDashboard |
| `/releases` | Lancamentos | Disc |
| `/pautas` | Pautas | FileText |
| `/materials` | Materiais | Palette |
| `/rivaldo` | Rivaldo | Mic |
| `/calendar` | Calendario | Calendar |
| `/settings` | Configuracoes | Settings |

### 3. Arquivos a criar

```text
src/
  layouts/
    AppLayout.tsx          -- sidebar + conteudo
    Sidebar.tsx            -- navegacao lateral
  pages/
    Dashboard.tsx
    Releases.tsx
    Pautas.tsx
    Materials.tsx
    Rivaldo.tsx
    CalendarView.tsx
    Settings.tsx
  components/
    workspace/
      WorkspaceShell.tsx   -- shell compartilhado Pautas/Materiais
      DayColumn.tsx        -- coluna por dia da semana
    StatusBadge.tsx
  lib/
    types.ts               -- todos os tipos (Release, Pauta, Episode, etc.)
    constants.ts           -- cores, presets, dias da semana
```

### 4. Cada pagina tera UI placeholder funcional

- **Dashboard**: cards de resumo + barra de progresso do fluxo + quick actions
- **Lancamentos**: tabela vazia com header de filtros e botoes
- **Pautas**: tree view de semanas + WorkspaceShell placeholder
- **Materiais**: mesmo WorkspaceShell com sub-tabs (Titulos, Descricoes, Capas)
- **Rivaldo**: layout de upload + parametros placeholder
- **Calendario**: grid mensal placeholder
- **Config**: laboratorio de tom + sections

### 5. Dados locais (sem Supabase nesta fase)

Todos os dados serao gerenciados via React state/context. Supabase sera integrado em fase posterior. Tipos TypeScript completos serao definidos desde o inicio.

---

## Resultado esperado

Ao final da Fase 1, o app tera navegacao completa entre as 7 abas com UI moderna e consistente, pronto para receber as funcionalidades reais nas fases seguintes. O design sera clean, dark-first, com espacamento generoso e animacoes sutis de transicao.

