## 1) Botão Metal Archives na tabela de Releases

Na página **Releases**, em cada linha (tabela e cards), adicionar um botão posicionado **antes das estrelinhas de rating** que abre o link dinâmico de Metal Archives da banda/álbum em nova aba.

- Reusar `resolveLink(release, 'metal_archives')` de `src/lib/dynamic-links.ts` (já considera override manual → fallback search).
- Botão `variant="ghost" size="icon"` discreto com ícone Disc/ExternalLink + tooltip "Abrir no Metal Archives".
- `onClick`: `window.open(url, '_blank', 'noopener,noreferrer')` + `e.stopPropagation()` para não disparar edição da linha.
- Aplicar nas duas views renderizadas em `src/pages/Releases.tsx`: card (linha ~841) e tabela (após coluna de rating).

## 2) BGM Library — modal de upload + busca por gênero

Substituir o componente atual de seleção de BGM (pílulas BGM 1–8) por **um único botão** "Selecionar BGM" que abre um modal de biblioteca persistida no banco. Remover totalmente os presets hardcoded `BGM 1..8` e os MP3s correspondentes em `public/presets/`.

### UI/UX do modal (elite)

Layout em duas colunas dentro de um `Dialog` grande:

```text
┌───────────────────────────────────────────────────────────────┐
│  Biblioteca de BGM                                    [+ Upload]│
│  ┌─────────────────────────┐  ┌──────────────────────────────┐ │
│  │ 🔎 Buscar por gênero…   │  │  Preview da faixa selecionada │ │
│  │ ─────────────────────── │  │  ▶ Play / waveform leve       │ │
│  │ Chips de gêneros (todos)│  │  Nome • Gêneros • Duração     │ │
│  │ [Heavy] [Doom] [Power]… │  │  [Usar este BGM]   [Excluir]  │ │
│  │ ─────────────────────── │  └──────────────────────────────┘ │
│  │ Lista de BGMs:          │                                    │
│  │  ▸ card com nome,       │                                    │
│  │    chips de genres,     │                                    │
│  │    duração, ▶ inline    │                                    │
│  └─────────────────────────┘                                    │
└───────────────────────────────────────────────────────────────┘
```

- Busca: input com debounce filtra por nome **e** por gênero (substring case-insensitive).
- Chips de gênero acima da lista (extraídos da própria biblioteca) funcionam como filtros toggle multi-seleção.
- Cada item tem play inline (HTMLAudio), badge de duração e chips dos gêneros vinculados.
- Upload via drag-and-drop + botão; após drop abre um pequeno painel para **nome** e **multi-select de gêneros** antes de confirmar.
- Estado vazio: ilustração + CTA "Subir seu primeiro BGM".
- Confirmar seleção → callback retorna o `File` (baixado do storage como blob) para o slot BGM existente, preservando o pipeline de áudio atual.

### Backend (migration — em call separada)

Criar bucket `bgm` (público para read) + tabela:

```sql
public.bgm_tracks (
  id uuid pk,
  name text not null,
  genres text[] not null default '{}',
  storage_path text not null,
  duration_seconds numeric,
  created_at, updated_at
)
```

Index GIN em `genres`. RLS: leitura para `authenticated` + `anon`; insert/delete para `authenticated`. GRANTs explícitos conforme padrão.

### Código

- `src/components/rivaldo/BgmLibraryModal.tsx` (novo) — modal completo.
- `src/lib/bgm-library.ts` (novo) — helpers: `listBgm`, `uploadBgm`, `deleteBgm`, `downloadBgmAsFile`.
- `src/pages/Rivaldo.tsx`:
  - Remover `BGM_PRESETS` e o array de presets passado ao slot BGM.
  - Trocar o `UploadSlot` de BGM por `<BgmLibraryButton />` que abre o modal e devolve `File` para `setFiles(p => ({...p, bgm: file}))`.
- `src/contexts/RivaldoBulkContext.tsx` e `src/lib/desktop/queue.ts`: remover dependência de `bgmPreset`/URLs locais; bulk passa a aceitar apenas `bgmFile` resolvido a partir do `bgm_track_id` selecionado (carregado do bucket on-demand). Manter compat: campo `bgmPreset` substituído por `bgmTrackId`.
- Apagar arquivos `public/presets/zzzz*BGM_Heavynauta_2.0.mp3`.

### Ordem de execução

1. Migration (tabela + bucket + policies + grants) — aprovação do usuário.
2. Após aprovação: implementar lib + modal + integração no Rivaldo + remoção dos presets antigos.
3. Em paralelo (não depende do backend): adicionar botão Metal Archives nas linhas de Releases.
