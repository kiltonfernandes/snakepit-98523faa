

## Plano: Portar o Podcast Pal para a aba Rivaldo do Snakepit

### Contexto
O projeto **Podcast Pal** (Rivaldo by Heavynauta 3.2) é uma workstation de processamento de áudio com pipeline RNNoise + WPE, auto-duck, multi-track, bulk processing e fila desktop. O objetivo é trazer todo esse app para dentro da aba Rivaldo do Snakepit, substituindo o placeholder atual.

### Escopo da migração

**Arquivos a copiar do Podcast Pal → Snakepit:**

| Origem (Podcast Pal) | Destino (Snakepit) |
|---|---|
| `src/lib/audio/*` (8 arquivos: types, pipeline, decoder, encoder, dsp, assembler, auto-duck, voice-processor, voice-worker, voice-worker-client, analysis, pre-master, silence-remover) | `src/lib/audio/*` |
| `src/lib/assets/presets.ts` | `src/lib/assets/presets.ts` |
| `src/lib/desktop/runtime.ts`, `types.ts`, `queue.ts` | `src/lib/desktop/runtime.ts`, `types.ts`, `queue.ts` |
| `src/assets/heavynauta-badge.svg` | `src/assets/heavynauta-badge.svg` |
| `src/components/MultiTrackMaster.tsx` | `src/components/rivaldo/MultiTrackMaster.tsx` |
| `src/components/UploadSlot.tsx` | `src/components/rivaldo/UploadSlot.tsx` |
| `src/components/ParametersSidebar.tsx` | `src/components/rivaldo/ParametersSidebar.tsx` |
| `src/components/GranularProgress.tsx` | `src/components/rivaldo/GranularProgress.tsx` |
| `src/components/ProcessLog.tsx` | `src/components/rivaldo/ProcessLog.tsx` |
| `src/components/BulkModal.tsx` | `src/components/rivaldo/BulkModal.tsx` |
| `src/components/ElapsedTimer.tsx` | `src/components/rivaldo/ElapsedTimer.tsx` |
| `src/components/ProcessingReportPanel.tsx` | `src/components/rivaldo/ProcessingReportPanel.tsx` |
| `src/components/HeavynautaBrand.tsx` | `src/components/rivaldo/HeavynautaBrand.tsx` |
| `src/components/DesktopJobsPanel.tsx` | `src/components/rivaldo/DesktopJobsPanel.tsx` |
| `public/presets/*` (10 MP3 files) | `public/presets/*` |

**Arquivos a modificar no Snakepit:**

| Arquivo | Alteração |
|---|---|
| `src/pages/Rivaldo.tsx` | Substituir completamente pelo conteúdo de `Index.tsx` do Podcast Pal, ajustando imports para os novos paths (`@/components/rivaldo/*`) |
| `package.json` | Adicionar dependências: `@breezystack/lamejs`, `@jitsi/rnnoise-wasm`, `fft.js` |

### Detalhes técnicos

1. **Dependências novas**: 3 pacotes de áudio (`@breezystack/lamejs` para encoding MP3, `@jitsi/rnnoise-wasm` para denoise via WASM, `fft.js` para FFT). O `framer-motion` já existe no Snakepit mas em versão `^11.0.0` — o Podcast Pal usa `^12.36.0`; atualizaremos para a versão mais recente.

2. **Estrutura**: Componentes do Rivaldo ficarão em `src/components/rivaldo/` para não conflitar com componentes existentes do Snakepit. As bibliotecas de áudio e desktop ficam em `src/lib/audio/` e `src/lib/desktop/`.

3. **Adaptação do layout**: O `Rivaldo.tsx` original (Podcast Pal) tem seu próprio `<header>` e layout full-page. Como no Snakepit ele já está dentro do `AppLayout` (com sidebar + header), removeremos o header duplicado do componente e ajustaremos para que o conteúdo se encaixe no `<main>` do layout.

4. **Desktop mode**: O código de desktop (`window.rivaldoDesktop`) funciona apenas no Electron. No browser, `isDesktopRuntime()` retorna `false` e todo o código desktop é ignorado automaticamente — não precisa de alteração.

5. **Assets de preset**: Os 10 arquivos MP3 de presets (intro, outro, 8 BGMs) serão copiados para `public/presets/`.

6. **Módulos não utilizados**: `pre-master.ts` e `silence-remover.ts` referenciam tipos inexistentes (`PreProcessOptions`, campos extras em `AudioParams`). Serão copiados mas não são importados pelo pipeline principal — funcionam como código morto sem impacto.

### Etapas de implementação

1. Instalar dependências (`@breezystack/lamejs`, `@jitsi/rnnoise-wasm`, `fft.js`, atualizar `framer-motion`)
2. Copiar os 10 arquivos de preset MP3 para `public/presets/`
3. Copiar o SVG badge para `src/assets/`
4. Criar `src/lib/audio/` com todos os 12 arquivos de áudio
5. Criar `src/lib/desktop/` com os 3 arquivos desktop
6. Criar `src/lib/assets/presets.ts`
7. Criar `src/components/rivaldo/` com os 10 componentes
8. Reescrever `src/pages/Rivaldo.tsx` com o conteúdo completo do Index.tsx adaptado ao layout do Snakepit

