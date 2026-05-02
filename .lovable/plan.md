# Plano: Sorting + Grouping (Airtable-like) na aba Releases

## Objetivo

Trazer para a aba **Releases** (visão tabular) o mesmo modelo do Airtable:

- **Sort** (ordenação) multi-nível, empilhável, asc/desc por campo, com prioridade.
- **Group** (agrupamento) por um ou mais campos, criando blocos colapsáveis com **chevrons**.
- Sort e Group convivem: dentro de cada grupo a ordenação configurada continua valendo.

## Escopo

- Aplicar **somente na aba Releases** (`src/pages/Releases.tsx`), na **visão tabular**.
- Visão Card permanece como está.
- Persistência das preferências em `localStorage` (sem mudança de schema).

## UX — toolbar da tabela

Adicionar dois botões na toolbar, ao lado do `ViewModeToggle`:

```text
[ Buscar... ] [Filtros rápidos] ... [ Sort (2) ▾ ] [ Group (1) ▾ ] [ ▦ ⊞ ]
```

- O número entre parênteses mostra quantas regras estão ativas.
- Botão fica destacado (variant=`secondary`) quando há regras.
- Cada um abre um `Popover` com o editor de regras.

### Popover de Sort

- Lista de regras empilhadas (drag-to-reorder simples via setas ↑↓).
- Cada regra: `Campo` (Select) + `Asc/Desc` (toggle) + `Remover`.
- Botão "Adicionar nível de ordenação".
- Campos disponíveis: `Artist`, `Album`, `Release Date`, `Rating`, `Country`, `Genre (primeiro)`.

### Popover de Group

- Mesma mecânica: lista de campos de agrupamento empilháveis (multi-nível).
- Cada nível: `Campo` + `Direção do header` (asc/desc) + `Remover`.
- Botão "Adicionar nível de agrupamento".
- Campos: `Release Date (Ano)`, `Release Date (Ano-Mês)`, `Country`, `Genre (primeiro)`, `Rating`, `Decade`, `Has review` (sim/não).

## UX — tabela com grupos

Quando há agrupamento ativo, a tabela passa a renderizar **headers de grupo** + linhas:

```text
▾ Country: Brazil  (12)
   ▾ Genre: Death Metal  (5)
      [linhas de release...]
   ▸ Genre: Black Metal  (4)   ← colapsado
▸ Country: Norway  (8)
```

- Chevron `▸/▾` à esquerda do label do grupo (`ChevronRight` / `ChevronDown` do lucide).
- Click no header alterna colapso. Estado por chave de grupo guardado em `useState` + `localStorage`.
- Ações em massa: checkbox no header do grupo seleciona/deseleciona todas as linhas daquele grupo.
- Contador de itens à direita do label.
- Indentação progressiva por nível (nível 0 = 0px, nível 1 = 20px, etc.).
- Cabeçalho de coluna da tabela continua sticky no topo.

## Detalhes técnicos

### Estado e persistência

```ts
type SortRule = { field: SortField; dir: 'asc' | 'desc' };
type GroupRule = { field: GroupField; dir: 'asc' | 'desc' };

const [sortRules, setSortRules] = useState<SortRule[]>(() => loadLS('releases:sort', [{ field: 'release_date', dir: 'desc' }]));
const [groupRules, setGroupRules] = useState<GroupRule[]>(() => loadLS('releases:group', []));
const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set(loadLS('releases:collapsed', [])));
```

- Persistir em `localStorage` em cada mudança (`useEffect`).
- Migração suave: se já existir `sortField/sortDir` no estado atual, popular `sortRules` no boot.

### Ordenação multi-nível

```ts
function compareWithRules(a: Release, b: Release, rules: SortRule[]): number {
  for (const r of rules) {
    const cmp = fieldCompare(a, b, r.field);
    if (cmp !== 0) return r.dir === 'desc' ? -cmp : cmp;
  }
  return 0;
}
```

`fieldCompare` cobre string, number, null-safe.

### Agrupamento recursivo

```ts
type GroupNode = { key: string; label: string; level: number; items: Release[]; children?: GroupNode[] };

function buildGroups(items: Release[], rules: GroupRule[], level = 0, parentKey = ''): GroupNode[] {
  if (level >= rules.length) return [{ key: parentKey, label: '', level, items }];
  const rule = rules[level];
  const buckets = new Map<string, Release[]>();
  for (const it of items) {
    const k = groupValueOf(it, rule.field); // ex: 'Brazil', '2024-09', 'Death Metal', '—' p/ vazios
    buckets.set(k, [...(buckets.get(k) || []), it]);
  }
  const sorted = Array.from(buckets.entries()).sort(([a], [b]) => rule.dir === 'desc' ? b.localeCompare(a) : a.localeCompare(b));
  return sorted.map(([k, arr]) => ({
    key: `${parentKey}/${rule.field}=${k}`,
    label: `${labelForField(rule.field)}: ${k} (${arr.length})`,
    level,
    items: arr,
    children: buildGroups(arr, rules, level + 1, `${parentKey}/${rule.field}=${k}`),
  }));
}
```

### Render

- Quando `groupRules.length === 0` → tabela atual (sem mudanças).
- Quando há grupos → percorrer árvore e emitir:
  - `<TableRow>` com `colspan` total contendo chevron + label + contador + checkbox de seleção em massa.
  - Recursão para filhos; ao chegar no nível folha, emite as linhas de release ordenadas por `sortRules`.
- Linhas dentro de um grupo respeitam a ordenação global.

### Performance

- `buildGroups` em `useMemo([filtered, groupRules])`.
- Linhas filhas são memoizadas individualmente quando possível.
- Para >2000 releases não há virtualização hoje; manter como está (nenhuma regressão), avaliar virtualização futura se necessário (fora do escopo).

## Arquivos afetados

- `src/pages/Releases.tsx` — adicionar estado, popovers, render com grupos.
- `src/components/releases/SortRulesPopover.tsx` (novo) — editor de regras de sort.
- `src/components/releases/GroupRulesPopover.tsx` (novo) — editor de regras de group.
- `src/components/releases/ReleasesGroupedTable.tsx` (novo) — render recursivo da árvore de grupos.
- `src/lib/releases-grouping.ts` (novo) — `compareWithRules`, `buildGroups`, `groupValueOf`, `labelForField`, helpers de localStorage.

## Não escopado

- Mudanças nas abas Pautas e Materiais (mantêm o que foi feito antes).
- Filtros avançados estilo Airtable (ficam para outra rodada).
- Virtualização de linhas.
- Mudanças de schema no banco.

## Aceite

- Tabela sem regras: comportamento atual preservado.
- Sort multi-nível funciona como desempate (ex.: Country asc → Release Date desc).
- Group cria blocos colapsáveis com chevrons; estado de colapso persiste entre reloads.
- Sort + Group combinados ordenam linhas dentro de cada bloco.
- Preferências de sort/group/colapso persistem em `localStorage`.
