# Nova Pauta — Fluxo Guiado & Episódios Avulsos

Adicionar um fluxo flexível para criar episódios sob demanda, sem precisar amarrar à grade da semana editorial, e uma aba dedicada para gerenciá-los.

## Visão geral da experiência

1. Na aba **Pautas**, novo botão `+ Nova Pauta` (ao lado dos controles já existentes).
2. Abre um modal-wizard com etapas:
   - **Etapa 1 — Conteúdo**: multiselect (checkboxes) com os blocos do episódio:
     - Aniversário de álbum
     - Review de álbum
     - Notícia
     - Entrevista
   - O wizard monta dinamicamente as próximas etapas, uma por bloco marcado, na ordem escolhida.
3. **Etapas por bloco** (mesmo padrão para todos):
   - Campo de **insumo principal**:
     - Review → lookup do disco em `releases` (combobox de busca).
     - Demais → input de URL (com botão "validar / resolver").
   - **Texto livre** (direção editorial / notas).
   - **Prompt** pré-preenchido com o default da plataforma (de `prompt-defaults.ts`), editável.
   - Botão **Copiar prompt** (mesma UX do que já existe em pautas semanais).
   - Área **"Colar resposta da IA"** com parser (`parsePautaResponse`) → ao colar, registra o material parsed inline (com badge de status + warnings).
4. **Etapas de materiais** (após todos os blocos):
   - **Título do episódio** (mesma dinâmica copiar prompt → colar → parser de títulos).
   - **Descrição** (template + copiar prompt → colar HTML/texto).
   - **Capa** (prompt para gerador + URL/imagem; mantém o fluxo atual do Cover Generator).
5. **Etapa final — Revisão & salvar**: resumo do episódio, data de publicação (opcional), botão "Criar episódio avulso".

## Aba Episódios Avulsos

Nova aba de topo em Pautas (ou na Workstation), irmã de Insumos / Conteúdo / Flow / Management. UI forte de organização:

- Filtros: status, tipo(s) de bloco, intervalo de datas, busca livre.
- Visão **tabular padrão da plataforma** (mesma toolbar de sort/group já usada em Releases / Insumos, conforme memória).
- Cada linha = episódio avulso, com:
  - Badges dos blocos contidos (Aniversário, Review, Notícia, Entrevista).
  - `StatusBadge` reutilizado do workflow existente (Pesquisa → … → Publicado).
  - Indicadores de completude (pauta, título, descrição, capa, salvo no OneDrive) — mesmo padrão de `EpisodeCompletionIndicators`.
  - Ações rápidas: editar (reabre o wizard), abrir no Rivaldo, exportar, deletar (com `AlertDialog`).
- Linha clicável abre **modal grande** (mesmo padrão dos modais expandidos de Insumos, 95vw x 92vh) para edição direta dos campos.

## Integração com Rivaldo + OneDrive

- Episódios avulsos aparecem no Rivaldo na mesma listagem dos da semana, com flag visual "Avulso".
- Upload para OneDrive segue o caminho atual `Snakepit/YYYY-Www/…`, derivando a semana ISO da `publication_date` do avulso (ou de uma pasta `Snakepit/Avulsos/YYYY-MM/` quando não houver data definida — comportamento a confirmar; ver pergunta abaixo).
- `episode_materials.repository_url`, `cover_url`, etc. continuam sendo a fonte de verdade — sem fork no fluxo Rivaldo.

## Detalhes técnicos

### Modelo de dados
- Reaproveitar `pautas` + `episode_materials`. Adicionar:
  - `pautas.is_standalone boolean default false`.
  - `pautas.standalone_topics jsonb` — array de `{ type, prompt, response_text, parsed_json, url|release_id, notes }`.
  - `episode_materials.is_standalone boolean default false`.
- `week_id` continua obrigatório no schema; para avulsos, usar uma "semana sintética" por mês (`standalone-YYYY-MM`) criada on-demand — evita migração destrutiva e mantém Rivaldo/Materials funcionando sem branching.
- Novo `pauta_type = 'standalone'` no enum lógico (campo é text, basta convenção).

### Wizard
- Componente `src/components/pautas/NovaPautaWizard.tsx` (Dialog com `Stepper` interno).
- Estado controlado por reducer (`useReducer`) com snapshot em `localStorage` (`nova_pauta_draft`) para recuperação — alinhado ao Autosave Queue.
- Etapas geradas dinamicamente a partir dos checkboxes; usa os mesmos helpers `buildSectionPrompt` (estender `prompt-builder.ts` para suportar tópicos avulsos).
- Parser: `parsePautaResponse` já cobre o contrato `snakepit_response`; reaproveitar.
- Materiais (título/descrição/capa) chamam os mesmos builders usados em `MaterialsTable`.

### Persistência
- Ao concluir o wizard:
  1. `upsert` da semana sintética.
  2. `insert` em `pautas` (com `is_standalone=true`, `raw_inputs_json` consolidando os blocos, `sections_json` com saídas parseadas).
  3. `insert` em `episode_materials` com `is_standalone=true`.
  4. `activity_logs` registra criação.

### UI shared
- Reutilizar `ContentTable`, `ManagementTable` como referência visual; criar `StandaloneEpisodesTable.tsx` com mesma toolbar de sort/group/expand.
- Status workflow idêntico ao atual (`episode-status.ts`).

## Pontos a validar com o usuário

1. **Data do episódio avulso**: obrigatória no wizard ou pode ficar "sem data" até o usuário agendar?
2. **Pasta OneDrive para avulsos**: usar `Snakepit/YYYY-Www/` baseado na `publication_date`, ou pasta separada `Snakepit/Avulsos/`?
3. **Tipos de bloco** fixos nos 4 propostos, ou já deixar extensível por template?
4. **Aba Episódios Avulsos** deve ficar dentro de Pautas (nova tab) ou ser uma rota de topo no menu lateral?

## Crítica do plano

- **Risco de duplicação de UX**: o wizard pode ficar muito parecido com o `InsumosTable` expandido. Mitigação: extrair um componente `SectionInputCard` reutilizado nos dois lugares (mesmo padrão: URL/release + texto + prompt + copiar + colar + parser).
- **Risco de divergência de dados**: dois caminhos criando `episode_materials` aumentam chance de bugs de sync. Mitigação: usar um único serviço `createEpisodeMaterial()` consumido tanto pelo fluxo semanal quanto pelo wizard.
- **Risco de poluir Pautas semanais**: filtrar `is_standalone` em todas as queries de Insumos / Conteúdo / Management para que avulsos só apareçam na aba dedicada.
- **Risco de fricção no wizard**: 4 blocos + 3 telas de material = potencialmente 7 etapas. Mitigação: barra de progresso, botão "Salvar rascunho e sair", e permitir pular etapas de material (criando depois pela aba avulsos).
- **Consistência com OneDrive**: usar semana ISO real evita branching no Rivaldo; precisa só de uma data válida no episódio. Forçar data no wizard simplifica o resto da plataforma.

