

## O que vamos construir

5 melhorias no fluxo do episódio, conectando OneDrive, descrição com IA, pauta compartilhável e calendário.

### 1. Botão "Baixar do Drive" no modal do calendário
No modal do episódio (CalendarView), **acima** do campo "Link do Spotify", aparece uma seção `Arquivo no OneDrive`:
- Se `repository_url` existir: badge verde "MP3 no Drive · enviado em <data>", botão **Baixar do Drive** (abre `repository_url`) e botão **Excluir do Drive** (vermelho).
- Se não existir: estado vazio com mensagem "Nenhum MP3 enviado ainda. Use a aba Rivaldo para gerar e subir."

### 2. Excluir arquivo do Drive (com confirmação)
- Botão **Excluir do Drive** abre um `AlertDialog` (padrão do projeto): *"Tem certeza? O arquivo será removido permanentemente do OneDrive."*
- Confirmação chama nova action no edge function `upload-episode-to-onedrive` (action: `delete`, recebe `fileId`) que faz `DELETE /me/drive/items/{fileId}` no Graph.
- Após sucesso: limpa `repository_url`, `repository_file_id`, `repository_provider`, `repository_uploaded_at` no `episode_materials` e mostra toast.

### 3. Campo "Mencionado no Episódio" + ação IA (no modal do calendário)
**Acima** do campo "Descrição em HTML" no modal:
- Novo `Textarea` "Mencionado no Episódio" (multilinha) — aceita texto livre, URLs ou misto.
- Botão **Inserir na descrição (IA)** — habilitado **somente** quando o campo tem conteúdo.
- Persiste em `episode_materials.mentioned_in_episode` (nova coluna `text`).

**Comportamento da IA**:
- Edge function nova `enrich-episode-description` recebe `{ mentioned: string, currentDescriptionHtml: string }`.
- Roda Lovable AI (`google/gemini-2.5-flash`) com o prompt traduzido para PT-BR baseado no fornecido pelo usuário (analisar links/texto, criar 1-2 frases por item, emoji relevante, HTML válido com `<a>`).
- Resultado HTML é **inserido no início** do `description_html` (antes do bloco institucional `<p><b>Heavynauta — Papo Sério...`), dentro de uma seção `<h3>🎙️ Mencionado neste episódio</h3>` + `<ul>...</ul>`.
- Se já existir uma seção "Mencionado neste episódio" anterior, **substitui** (idempotente).

### 4. Campo "Mencionado no Episódio" também na aba Pautas (por dia)
- Em `Pautas.tsx` → aba `inputs` (e dentro do flow wizard se aplicável), cada card de dia ganha um `Textarea` "Mencionado no episódio (links/assuntos)".
- Salvo em `pauta.raw_inputs_json.mentioned_in_episode`.
- **Sincronização**: quando o material é gerado/regerado a partir da pauta, o campo da pauta é copiado para `episode_materials.mentioned_in_episode`. Edição posterior no calendário sobrepõe e fica como SSOT do material.

### 5. Integração na geração da descrição (consistência)
- `buildMaterialDescriptionsPrompt` em `prompt-builder.ts` passa a incluir, por episódio, um bloco `<mentioned>...</mentioned>` no `<ep>` quando `mentioned_in_episode` (do material ou da pauta) tiver conteúdo.
- Novo bloco em `prompt-defaults.ts` (`material_mentioned_instructions`) com a regra: *"Se houver conteúdo em <mentioned>, criar uma seção `🎙️ Mencionado neste episódio` no topo do HTML, antes do bloco institucional, com 1-2 frases por item + emoji + `<a>` quando houver URL. Se vazio, ignorar."*
- Garante que **gerar a descrição com o campo preenchido** produz o mesmo resultado que **inserir depois pelo botão IA no calendário**.

## Detalhes técnicos

**Migration**:
```sql
ALTER TABLE public.episode_materials ADD COLUMN IF NOT EXISTS mentioned_in_episode text;
-- raw_inputs_json.mentioned_in_episode em pautas usa o JSONB existente, sem migration.
```

**Edge Functions**:
- `upload-episode-to-onedrive`: adicionar `action: "delete"` (DELETE no Graph via gateway).
- `enrich-episode-description` (nova): Lovable AI gateway, retorna `{ html: string }` com a seção pronta. Faz fetch dos URLs com tolerância a falhas (link inválido vira só "🔗 título do link").

**Frontend**:
- `CalendarView.tsx`: nova seção OneDrive + nova seção Mencionado + AlertDialog de exclusão. Reordenar: `[Mencionado] → [Descrição HTML] → [OneDrive] → [Spotify]`.
- `Pautas.tsx`: novo `Textarea` por dia no tab `inputs`, salvando em `raw_inputs_json.mentioned_in_episode`.
- `PublicWeekView.tsx`: a descrição do material já renderiza o HTML completo, então o conteúdo aparece automaticamente quando inserido.
- `AppContext.tsx`: incluir `mentioned_in_episode` em `updateMaterial` payload e no template inicial.
- Helper utilitário `injectMentionedSection(html, mentionedHtml)` que insere/substitui o bloco `<h3>🎙️ Mencionado neste episódio</h3>` antes do marcador institucional.

**Memória**: atualizar `mem://features/onedrive-upload.md` (action delete) e criar `mem://features/episode-mentioned-section.md` documentando o fluxo.

## Layout do modal (depois)

```text
┌─ Pacote do episódio ─────────────────────────────┐
│ [Badges]                                         │
│ Título selecionado                               │
│ Mencionado no Episódio    [Inserir na descrição]│
│ Descrição em HTML          [Copy to clipboard]  │
│ Arquivo no OneDrive  [Baixar] [Excluir]         │
│ Link do Spotify           [Salvar]              │
└──────────────────────────────────────────────────┘
```

