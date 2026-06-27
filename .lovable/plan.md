## Problema

Ao clicar **Gerar tudo** (toggle on/off ou com pauta marcada/desmarcada), a pipeline não entrega o material completo (pauta + títulos + descrição). Nenhum log de edge function aparece nas últimas execuções, então provavelmente uma exceção precoce derruba a pipeline inteira antes de chegar nas etapas seguintes — ou um `await` infinito mantém o modal de progresso travado.

Após revisar `src/components/pautas/NovaPautaWizard.tsx::runGenerateAll`, identifiquei 3 fragilidades que provavelmente causaram a regressão:

1. **Falha em qualquer etapa derruba toda a pipeline.** O try/catch é único, em volta do bloco inteiro. Se a `web-research` der 500 (ou o `streamGeneratePauta` da pauta levantar erro), os passos de **títulos** e **descrição** nunca rodam.
2. `**aiProgressTopic.start(...)` é chamado várias vezes seguidas**, e `streamGeneratePauta` também chama `start()` internamente. Cada `start()` zera `attempts`/`bytes` — perde-se trilha do passo anterior e, mais grave, o `_meta:error` que vier de uma etapa pode chamar `p?.finish(msg)` deixando o modal "preso" enquanto o `throw` quebra a pipeline.
3. `**onPaste('')` antes de cada `streamGeneratePauta` apaga o `response_text**` — mesmo no fluxo `formatarApenas`, que justamente precisa ler esse campo. Se o usuário tiver desligado "pauta" mas ativado "formatar apenas" sem conteúdo bruto, o passo aborta com `return` (linha 909) e nem títulos nem descrição rodam.

## Solução

Reestruturar `runGenerateAll` em `src/components/pautas/NovaPautaWizard.tsx` para que cada etapa seja independente, robusta a falhas e instrumentada.

### Mudanças em `runGenerateAll` (linhas ~801-993)

1. **Try/catch por etapa.** Envolver `pesquisa`, `pauta`/`formatarApenas`, `titulos` e `descricao` cada um em seu próprio `try { ... } catch (e) { console.warn(...); toast.warning(...); }`. Falha de uma etapa **continua para a próxima** ao invés de abortar tudo. Apenas a `pauta` é "soft-required" para `formatarApenas` e títulos/descrição usarem o conteúdo agregado — se ela falhar, ainda usamos o `topic.response_text` anterior como fonte.
2. **Reset de progresso explícito.** Substituir os múltiplos `aiProgressTopic.start(label)` no meio da pipeline por um único `start('Gerar tudo')` no começo, e usar apenas `setStage` + `pushAttempt({model: 'Etapa: X', status: 'trying'/'selected'})` entre etapas para mostrar o passo corrente sem zerar histórico. O `start()` interno do `streamGeneratePauta` continuará atualizando rótulo/modelo normalmente.
3. `**formatarApenas` resiliente.** Se `response_text` estiver vazio, **não abortar a pipeline** — apenas emitir `toast.warning` e seguir para títulos/descrição usando o conteúdo agregado existente (ou pular títulos/descrição se nada existir).
4. **Logs diagnósticos.** Adicionar `console.info('[gerar-tudo]', 'pesquisa:start' | 'pesquisa:ok' | 'pesquisa:fail', ...)` em cada etapa para futura depuração via console.
5. **Garantir entrega final.** Trocar o `toast.success` único do final por toasts incrementais por etapa concluída (`✓ Pauta`, `✓ Títulos`, `✓ Descrição`) + toast final agregando resultado.
6. **Botão "Gerar tudo" não fica disabled sem prompt.** Quando o toggle "Gerar tudo" está ligado, o botão abre o picker; o picker pode rodar pesquisa+notes mesmo sem `prompt_text` (o prompt é montado a partir das notas pesquisadas). Ajustar `disabled` na linha 1261 para considerar `googleQuery` ou `notes` quando `generateAll` estiver ativo.

### Mudanças menores

- Em `src/lib/ai/openrouter-client.ts`, garantir que `p?.finish(null)` no fim do stream **não dispare** quando chamado dentro de um pipeline maior — adicionar opção `progress.noAutoFinish?: boolean` ou simplesmente não chamar `finish` quando o caller indicar pipeline. Mais simples: o caller (`runGenerateAll`) faz `aiProgressTopic.finish(null)` só uma vez ao final. Para isso, expor uma flag `silentFinish` em `StreamGeneratePautaOptions` que pule o `finish` interno.

### Diagnóstico paralelo

Após a correção, abrir o modal **Gerar tudo**, marcar todas as etapas e clicar **Iniciar**. Acompanhar console (`[gerar-tudo] ...`) + edge function logs (`web-research`, `generate-pauta`) para confirmar que todas as 4 etapas executam ponta-a-ponta tanto com `pauta:on` quanto com `pauta:off`.

## Critérios de aceitação

- Clicar **Gerar tudo** com todas as etapas marcadas: pauta, títulos e descrição preenchem-se sequencialmente; modal de progresso mostra cada etapa; toasts confirmam cada conclusão.
- Clicar **Gerar tudo** desmarcando "pauta" (sem "formatar apenas"): títulos e descrição ainda são gerados usando o `response_text` atual do tópico. mas o sisimtea usa ia para formatar o texto de acordo com o letgh definido pelo usuario 
- Se `web-research` falhar (timeout/500): pauta/títulos/descrição ainda rodam normalmente usando notas existentes; toast avisa "Pesquisa web falhou — seguindo sem ela".
- Console mostra trilha `[gerar-tudo] pesquisa:ok → pauta:ok → titulos:ok → descricao:ok`.
- mandatorio qu eo sisiteam entrega todos os materiais conforme experado  essea eh a meta maixa desse plano