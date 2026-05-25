## Objetivo
Garantir que, ao abrir um evento no calendário e clicar em `Visualizar pauta`, a pauta individual exibida seja exatamente a vinculada àquele evento, sem cair em outra pauta do mesmo dia ou em conteúdo reaproveitado indevidamente.

## O que vou implementar
1. Tornar o vínculo entre item do calendário, material do episódio e pauta explícito no fluxo de abertura do modal.
2. Remover a resolução ambígua por data nos pontos em que o calendário decide qual pauta abrir.
3. Ajustar o modal do calendário para carregar e preservar a pauta correta desde o clique no card/evento.
4. Validar o fluxo completo dos prints: abrir review, abrir notícia, abrir a pauta individual de cada um e confirmar que cada botão leva ao conteúdo certo.

## Causa provável encontrada
- No calendário, ainda existe lógica de fallback por data (`publication_date` / `episode_date`) para descobrir qual pauta pertence ao material.
- Esse fallback é perigoso quando existem múltiplas pautas/eventos próximos, materiais sem vínculo perfeito, ou estado local desatualizado.
- O botão `Visualizar pauta` hoje resolve a pauta a partir de `selectedMaterial`, em vez de manter a referência exata do item que originou a abertura.
- Também vi um sinal de inconsistência entre o que aparece nos prints e o que está persistido no backend neste momento, o que reforça a hipótese de estado local/associação ambígua no frontend.

## Ajuste técnico
### No `src/pages/CalendarView.tsx`
- Substituir a descoberta indireta da pauta por uma referência explícita:
  - ao clicar num item do calendário, salvar junto do modal não só o `selectedMaterial`, mas também a `selectedPauta` correta quando ela existir;
  - fazer o botão `Visualizar pauta` abrir essa pauta explícita primeiro;
  - só usar busca auxiliar quando realmente não houver vínculo explícito.
- Endurecer `getPautaForMaterial` / `getMaterialForPauta` para nunca escolher por data quando houver qualquer ambiguidade.
- Revisar as chaves/identidade dos itens renderizados no calendário para evitar reaproveitamento visual incorreto entre cards do mesmo dia.

### Validação
- Testar os caminhos:
  1. abrir o evento do review e abrir sua pauta;
  2. abrir o evento da notícia e abrir sua pauta;
  3. confirmar que nenhum abre o conteúdo do outro;
  4. conferir se o calendário continua exibindo os cards certos sem regressão.

## Resultado esperado
Cada evento do calendário passa a carregar sua própria pauta individual, mesmo quando houver mais de um item no mesmo dia ou vínculos parcialmente preenchidos.