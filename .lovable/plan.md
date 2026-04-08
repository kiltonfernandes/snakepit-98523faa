
Objetivo: fazer a URL da imagem virar um dado persistido de verdade do episódio, independente da geração da capa.

1. Confirmar e preservar a base atual
- O campo `cover_source_url` já existe no banco e já está tipado.
- O carregamento inicial de `episode_materials` já traz `cover_source_url`.
- Portanto, não precisa nova migration; o problema é de comportamento na UI.

2. Corrigir a lógica de persistência
- Hoje a URL só é salva quando a capa é gerada com sucesso.
- Vou ajustar para que a URL seja salva no episódio assim que o usuário editar o campo, sem depender do botão “Gerar Capa”.
- Implementação recomendada:
  - manter estado local do input;
  - persistir com debounce curto ou no `blur`;
  - salvar `''` como `null` no banco;
  - reutilizar `updateMaterial(...)` para manter estado local + backend sincronizados.

3. Aplicar isso nos 2 fluxos que usam o campo
- `src/pages/Materials.tsx`
  - sub-aba Capas: ao digitar/editar “URL da Imagem”, persistir em `episode_materials.cover_source_url`.
  - ao abrir um episódio, preencher o input com a URL salva.
  - ao clicar em gerar, usar a URL já persistida; a geração da capa continua salvando apenas `cover_url`/`cover_saved_at`.
- `src/pages/CalendarView.tsx`
  - modal “Gerar Capa”: mesmo comportamento.
  - ao abrir o modal, carregar `selectedMaterial.cover_source_url`.
  - se o usuário alterar a URL no modal, persistir imediatamente no mesmo registro do episódio.

4. Garantir consistência do estado
- Atualizar também `selectedMaterial` no modal do calendário quando a URL mudar, para evitar desencontro entre input e estado exibido.
- Manter `weekMaterials/materials` sincronizados para que, ao reabrir a sub-aba Capas ou o modal, a URL reapareça corretamente.
- Validar que materiais criados pelo fluxo de “repair” continuam com `cover_source_url: null` por padrão.

5. Ajustes de UX
- Opcionalmente mostrar feedback discreto de “URL salva” / “Salvando...” para deixar claro que o campo persistiu.
- Não exigir que a capa exista para a URL permanecer gravada.
- Se a geração falhar, a URL continua salva mesmo assim.

6. Verificação final
- Fluxo 1: Materiais → Capas → colar URL → fechar → reabrir → URL continua lá.
- Fluxo 2: Calendário → abrir modal do episódio → colar/editar URL → fechar → reabrir → URL continua lá.
- Fluxo 3: salvar URL em um lugar e gerar capa no outro, confirmando que ambos usam o mesmo valor persistido.
- Fluxo 4: limpar o campo, confirmar que o banco recebe `null` e o input volta vazio depois.

Detalhes técnicos
- Arquivos principais:
  - `src/pages/Materials.tsx`
  - `src/pages/CalendarView.tsx`
  - possivelmente um pequeno ajuste em `src/contexts/AppContext.tsx` apenas se precisar melhorar sincronização local, mas sem mudança estrutural.
- Banco:
  - usar o campo já existente `episode_materials.cover_source_url`.
  - sem mudança de schema.
