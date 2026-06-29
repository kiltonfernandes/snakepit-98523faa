Plano para resolver o problema principal de persistência e consistência:

1. Corrigir a gravação da Pré-produção
- Refatorar o salvamento em `PreProducao.tsx` para nunca sobrescrever o JSON salvo anteriormente.
- Hoje vários `persistData(...)` substituem `data` inteiro, então etapas posteriores podem apagar `result_markdown`, títulos, descrição, capa ou insumo já salvos.
- Criar uma fonte local de verdade do rascunho atual e sempre salvar por merge: dados antigos + campos atuais + patch novo.
- Persistir também mudanças simples de texto ao sair do campo e nos botões de avanço.

2. Carregar e mostrar `preprod_pautas` no calendário de Pré-produção
- Ao abrir a aba Pré-produção, buscar do banco todos os rascunhos/resultados salvos em `preprod_pautas`.
- Renderizar esses itens dentro dos dias do calendário mensal, semanal e diário.
- No anual/trimestral, mostrar pelo menos indicadores/contagem por mês para ficar claro que existe conteúdo ali.
- Depois de criar, alterar, descartar ou fechar o modal, atualizar a lista sem depender de refresh manual.

3. Permitir reabrir rascunhos existentes
- Clicar em uma pauta já exibida no calendário de Pré-produção deve abrir o mesmo registro, não criar outro.
- O modal deve hidratar os campos salvos: tipo, release, query, insumo, tamanho, sentimento, resultado markdown, títulos, título escolhido, mencionados, descrição HTML e capa.
- O botão `+` continua criando uma pauta nova na data escolhida.

4. Marcar estado coerente do item
- Manter status como `draft` no início.
- Atualizar status conforme avanço real: pesquisa/insumo, pauta gerada, pacote/final.
- Mostrar visualmente no calendário se é rascunho, gerada ou finalizada, usando título escolhido quando existir; senão artista/álbum; senão tipo + data.

5. Fazer a aba Calendário enxergar a Pré-produção
- Incluir os registros de `preprod_pautas` também na aba Calendário, além das pautas/materiais já existentes.
- Exibir esses itens na mesma data (`publication_date`) com uma identificação clara de Pré-produção.
- Assim, uma pauta criada na Pré-produção aparece coerentemente também no Calendário.

6. Reforçar o fluxo antigo da aba Calendário
- Revisar a criação via `NovaPautaWizard` para garantir que o rascunho seja persistido cedo o suficiente e que o calendário atualize após criar/fechar.
- Onde necessário, recarregar a lista de pautas após criação para evitar depender apenas do estado otimista.

7. Validação final
- Testar o fluxo: criar pelo `+` na Pré-produção, preencher insumo, gerar pauta, gerar título/descrição/capa, fechar e recarregar.
- Confirmar que o item aparece na Pré-produção e na aba Calendário na data correta.
- Confirmar que reabrir o item restaura rascunho e resultado final sem perda de campos.