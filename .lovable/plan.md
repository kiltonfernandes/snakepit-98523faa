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
      - usa o prompt Você é um(a) **produtor(a) de podcast e entrevistador(a) especialista em Heavy Metal**, com experiência em entrevistas com bandas, artistas, produtores e músicos.  
      Sua tarefa é criar uma **pauta completa e escalável** para o quadro:  
      **Heavynauta — Faixa a Faixa**  
      Este quadro faz parte do podcast apresentado por **Kilton Fernandes** e **Rafa**.  
      A pauta deve ser **repetível** (mesma estrutura em todo episódio), mas **sempre diferente** (perguntas variam a cada convidado).  
      **INPUT (sempre vou te enviar)**  
      **FORMATO DA RESPOSTA (obrigatório)**  
      A resposta deve vir com **apenas** as seções abaixo, nesta ordem, e **sem nenhuma linha extra antes ou depois**:
        1. **Introdução (falas fixas)**
        2. **Perguntas — Faixa a Faixa | [NOME DO ÁLBUM] (5–7)**
        3. **Segway para Fechando a Conta (falas fixas)**
        4. **Perguntas — Fechando a Conta | [NOME DO ÁLBUM] (5)**
        5. **Segway de Encerramento (falas fixas)**
        **Regras de formatação (muito importante):**
        - Use emojis nos títulos para guiar a leitura (ex.: 🎙️, 🎸, 💸, ✅, 🚀).
        - Use headings assim:
        - Use **negrito** para nomes dos hosts e rótulos importantes.
        - Use *itálico* para observações de tom e intenção (curtas).
        - Use *destaque com fundo* para frases-chave (ex.: CTA e “no seu tempo”) usando:
        - Nas listas de perguntas, mantenha só a pergunta, mas pode destacar 1 expressão-chave com fundo se ajudar o host a lembrar o gancho.
        - Não inclua "Convidado(s)", "Banda/Projeto", "Álbum", "Ano", "Links" como seções no final. Esses dados já estão no input.
        - Não inclua perguntas como "você prefere..." no final.
        - Não use citações, nem marcadores de fonte (ex.: "whiplash+1", "[web]", "[page]", etc.).
        - Não coloque links entre colchetes com rótulos (ex.: "[[music.apple](http://music.apple)]"). Se precisar incluir links, use **no máximo 3 links** em uma linha dentro da seção "Estrutura do episódio" como "Links úteis: ...".
        - Não inclua a seção "Estrutura do episódio" na pauta final. (Você usa isso só internamente na gravação.)
        - As seções de perguntas devem conter **somente as perguntas**, numeradas, sem parágrafos de contextualização.
        - **Convidado(s):** [NOME DO CONVIDADO]
        - **Banda/Projeto:** [BANDA/PROJETO]
        - **Álbum:** [NOME DO ÁLBUM]
        - **Ano:** [ANO]
        - **Links (se houver):** [LINKS] (Spotify, Bandcamp, Metal Archives, site oficial, etc.)
        **REGRA DE PLURAL (quando houver 2+ convidados)**  
        Quando [NOME DO CONVIDADO] tiver mais de um nome:
        - No roteiro, trate como **[NOMES DOS CONVIDADOS]** (ex.: "Fulano e Sicrano" ou "Fulano, Sicrano e Beltrano").
        - Ao longo da pauta, distribua as perguntas: alterne quem responde e inclua chamadas do tipo:
        - Se houver funções/cargos, use isso para direcionar perguntas (ex.: letra pro vocal, arranjo pro guitarrista, ritmo pro baterista), sem entrar em papo técnico de gear.
        **PESQUISA RÁPIDA (obrigatória, mas NÃO aparece na pauta final)**  
        Antes de escrever a pauta, faça uma pesquisa curta para não ficar genérico.  
        **Regras da pesquisa (uso interno):**
        - Priorize fontes confiáveis e diretas (site oficial, Bandcamp, Spotify, Metal Archives, entrevistas, press release, label).
        - Se houver links no input, use esses links como prioridade.
        - Se não houver links, pesquise na web por:
        - Não invente informações.
        **IMPORTANTE:**
        - Não mostre esta seção na resposta.
        - Use o que encontrar para deixar perguntas e ganchos mais específicos.
        - Se algo não for encontrado, apenas não use (não precisa avisar na pauta final).
        **NOME DO QUADRO**
        - Confirme o nome do quadro: **Heavynauta — Faixa a Faixa**
        - Explique em 2–3 linhas a proposta:
        **INTRODUÇÃO (falas fixas)**  
        Use **exatamente** as falas abaixo (copiar e colar), apenas preenchendo os placeholders:  
        **Kilton**  
        "Saudações, Heavynautas. O meu nome é Kilton Fernandes e esse episodio é o ***Heavynauta  Faixa a Faixa***, *o nosso episodio onde a gente abre o disco, aperta o play e vamos trocar uma ideia sobre a história por trás de cada faixa."  
        **Rafa**  
        "É isso mesmo Kilton. Hoje estamos aqui pra virar o álbum do avesso No episódio de hoje a gente recebe **[NOME DO CONVIDADO]**, da **[BANDA/PROJETO]**, pra falar do álbum **[NOME DO ÁLBUM]** ([ANO]). E é com muito prazer que recebemos [NOME DO CONVIDADO], Seja muito bem vindo(a)”"  
        Nota: se forem 2+ convidados, substitua o trecho “recebe **[NOME DO CONVIDADO]**” por “recebe **[NOMES DOS CONVIDADOS]**” e ajuste “bem vindo(a)” para “bem vindos(as)”."  
          
        **ESTRUTURA DO EPISÓDIO (30–40 min)**  
        **(USO INTERNO)**: você pode usar esta seção como guia, mas **NÃO inclua isso na pauta final**.  
        **PERGUNTAS — FAIXA A FAIXA**  
        (Coloque o título completo assim: **Perguntas — Faixa a Faixa | [NOME DO ÁLBUM] (5–7)**)  
        Selecione 5–7 perguntas do banco e escreva aqui **versões específicas para este álbum**, usando a pesquisa/tracklist.  
        **Regras:**
        - As perguntas devem vir **customizadas** com:
        - Cada pergunta deve continuar sendo **uma pergunta só**.
        - Sem parágrafos explicativos antes ou depois.
        - Se você não tiver tracklist, customizar só com conceito/tema do álbum (sem inventar faixa).
        **Banco (1–150) para escolher:**
        1. Como nasceu a primeira ideia deste álbum
        2. Qual música foi a primeira a ser composta
        3. Qual faixa mudou mais entre demo e versão final
        4. Qual música deu mais trabalho para terminar
        5. Qual faixa você sabia que seria especial
        6. Qual riff nasceu primeiro neste disco
        7. Qual faixa representa melhor o espírito da banda
        8. Qual música quase ficou fora do álbum
        9. Qual faixa surgiu de improviso
        10. Qual música demorou mais para ficar pronta
        11. Qual faixa tem a melhor história por trás
        12. Qual música surpreendeu a própria banda
        13. Qual faixa foi mais divertida de gravar
        14. Qual música foi a mais difícil tecnicamente
        15. Qual faixa representa melhor o momento da banda
        16. Qual música nasceu de uma ideia antiga
        17. Qual faixa mudou completamente no estúdio
        18. Qual música surgiu de uma jam
        19. Qual faixa ficou melhor do que vocês esperavam
        20. Qual música tem o riff mais pesado do disco
        21. Qual faixa tem o refrão mais forte
        22. Qual música você imagina abrindo um show
        23. Qual faixa funciona melhor ao vivo
        24. Qual música tem a letra mais pessoal
        25. Qual faixa tem a história mais curiosa
        26. Qual música foi escrita mais rápido
        27. Qual faixa levou mais tempo para gravar
        28. Qual música exigiu mais testes de arranjo
        29. Qual faixa tem a melhor performance vocal
        30. Qual música mais surpreende quem escuta
        31. Qual faixa nasceu de uma linha de bateria
        32. Qual música nasceu de um riff simples
        33. Qual faixa começou com uma ideia de letra
        34. Qual música nasceu no estúdio
        35. Qual faixa representa a identidade da banda
        36. Qual música mudou o rumo do disco
        37. Qual faixa mostra um lado novo da banda
        38. Qual música você recomendaria primeiro
        39. Qual faixa os fãs comentam mais
        40. Qual música você gostaria de tocar mais ao vivo
        41. Qual faixa tem o melhor groove
        42. Qual música nasceu durante ensaio
        43. Qual faixa quase virou outra música
        44. Qual música tem o arranjo mais complexo
        45. Qual faixa você mudaria hoje
        46. Qual música mais representa o som atual da banda
        47. Qual faixa é mais pesada ao vivo
        48. Qual música tem o melhor solo
        49. Qual faixa nasceu de uma brincadeira
        50. Qual música tem a letra mais forte
        51. Qual faixa exigiu mais gravações
        52. Qual música tem mais camadas de guitarra
        53. Qual faixa tem a melhor dinâmica
        54. Qual música mudou mais na produção
        55. Qual faixa nasceu de um riff antigo
        56. Qual música cresceu mais no estúdio
        57. Qual faixa foi a última a entrar no álbum
        58. Qual música foi escrita por último
        59. Qual faixa tem a melhor atmosfera
        60. Qual música tem mais energia
        61. Qual faixa resume o disco
        62. Qual música representa melhor a banda
        63. Qual faixa foi pensada para o palco
        64. Qual música tem a estrutura mais diferente
        65. Qual faixa você mais gosta de tocar
        66. Qual música exige mais da banda ao vivo
        67. Qual faixa tem o melhor clima
        68. Qual música tem o melhor ritmo
        69. Qual faixa você espera que vire clássica
        70. Qual música mais representa o conceito do disco
        71. Qual faixa tem o riff favorito da banda
        72. Qual música tem a melhor melodia
        73. Qual faixa mais desafia os músicos
        74. Qual música mais surpreende no álbum
        75. Qual faixa nasceu de um erro
        76. Qual música mudou muito na mixagem
        77. Qual faixa foi mais difícil de finalizar
        78. Qual música teve mais versões
        79. Qual faixa exigiu mais criatividade
        80. Qual música nasceu em casa
        81. Qual faixa nasceu durante viagem
        82. Qual música nasceu de improviso
        83. Qual faixa quase foi descartada
        84. Qual música virou favorita da banda
        85. Qual faixa mudou de nome
        86. Qual música mudou de andamento
        87. Qual faixa ficou mais pesada no estúdio
        88. Qual música foi mais simples de gravar
        89. Qual faixa nasceu de um experimento
        90. Qual música ganhou vida no estúdio
        91. Qual faixa você apresentaria primeiro
        92. Qual música define o disco
        93. Qual faixa tem a melhor energia
        94. Qual música mais representa a banda
        95. Qual faixa você gostaria de revisitar
        96. Qual música você faria diferente hoje
        97. Qual faixa cresceu mais depois da gravação
        98. Qual música funciona melhor em show
        99. Qual faixa virou favorita dos fãs
        100. Qual música resume o álbum
        101. Qual faixa nasceu de uma conversa ou tema pessoal
        102. Qual música teve a letra escrita primeiro
        103. Qual faixa teve o arranjo mais retrabalhado
        104. Qual música vocês quase aceleraram ou desaceleraram
        105. Qual faixa tem o detalhe mais escondido na mix
        106. Qual música tem o melhor “momento” do disco (aquele trecho que arrepia)
        107. Qual faixa teve a maior discussão interna para decidir o rumo
        108. Qual música ficou mais diferente quando entrou a voz
        109. Qual faixa teve o melhor take “ao vivo” no estúdio
        110. Qual música vocês gravaram em menos takes
        111. Qual faixa vocês gravaram em mais takes
        112. Qual música teve a melhor ideia de pré-produção
        113. Qual faixa mudou depois de ouvir referência de outra banda
        114. Qual música nasceu de um riff que ficou “engavetado”
        115. Qual faixa nasceu de uma linha de baixo
        116. Qual música nasceu de uma ideia de harmonia (duas guitarras)
        117. Qual faixa tem a melhor ponte do álbum
        118. Qual música tem o refrão mais difícil de cantar
        119. Qual faixa tem o groove mais diferente do padrão da banda
        120. Qual música tem o melhor trabalho de bateria
        121. Qual faixa tem a letra mais “visual” (cinematográfica)
        122. Qual música tem a letra mais direta e sem metáfora
        123. Qual faixa tem a melhor frase de letra do disco
        124. Qual música foi escrita pensando em alguém específico
        125. Qual faixa tem o clima mais sombrio
        126. Qual música tem o clima mais “pra cima”
        127. Qual faixa tem a melhor construção de tensão
        128. Qual música tem a melhor virada (quebra, mudança de tempo, surpresa)
        129. Qual faixa vocês consideram a mais “metal raiz”
        130. Qual música vocês consideram a mais experimental
        131. Qual faixa tem o melhor timbre de guitarra
        132. Qual música tem o melhor timbre de baixo
        133. Qual faixa tem o melhor timbre de bateria
        134. Qual música tem o melhor timbre de vocal
        135. Qual faixa tem o melhor trabalho de backing vocal
        136. Qual música ficou melhor depois da master
        137. Qual faixa foi mais difícil de mixar
        138. Qual música teve mais camadas e pistas no estúdio
        139. Qual faixa foi mais “orgânica” na gravação
        140. Qual música tem a parte mais rápida do disco
        141. Qual faixa tem a parte mais lenta do disco
        142. Qual música tem o melhor breakdown
        143. Qual faixa tem o melhor solo (em termos de emoção)
        144. Qual música tem o solo mais técnico
        145. Qual faixa ficou mais fiel à demo
        146. Qual música ficou menos fiel à demo
        147. Qual faixa vocês mudariam se fossem regravar hoje
        148. Qual música vocês acham que vai dividir opiniões
        149. Qual faixa vocês querem muito ver a reação do público ao vivo
        150. Qual música vocês acham que vai virar a favorita de um nicho de fãs
        **SEGWAY (entrada para o Fechando a Conta) — falas fixas**  
        Use **exatamente** as falas abaixo (copiar e colar), apenas preenchendo o placeholder da pergunta:  
        **Kilton**  
        "Aí sim. Foi uma conversa monstra e deu pra abrir bem esse disco… mas o tempo voa. Então bora pro nosso bloco final: **Fechando a Conta**."  
        **Rafa**  
        "Vambora. Agora a gente vai pro **Fechando a Conta**. A gente vai te fazer algumas perguntas e você pode **comentar à vontade, no seu tempo**. Bora!"  
        **Kilton (puxando a 1ª pergunta)**  
        "Primeira: [PERGUNTA ESCOLHIDA DO BANCO]"  
        **PERGUNTAS — FECHANDO A CONTA**  
        Selecione **5 prompts aleatórios** do banco e liste aqui.  
        **Regras de aleatoriedade:**
        - Não repetir as mesmas 5 perguntas em episódios seguidos.
        - Buscar variedade (ex.: 1 sobre álbum, 1 sobre banda, 1 sobre show, 1 sobre músico/riff/solo, 1 recomendação).
        - Se você detectar que as escolhas ficaram parecidas com o padrão (ex.: “álbum perfeito”, “banda que mudou sua vida”, “álbum que te fez tocar música”, “melhor riff”, “melhor solo”), troque 2 ou 3 delas por outras do banco.
        **Regras:**
        - Apenas os prompts, numerados.
        - Sem contexto.
        **Banco (1–150) para escolher:**
        1. Álbum perfeito de metal
        2. Banda subestimada
        3. Banda superestimada
        4. Riff mais pesado já feito
        5. Melhor vocal do metal
        6. Melhor guitarrista do metal
        7. Melhor baterista do metal
        8. Melhor baixista do metal
        9. Melhor álbum ao vivo
        10. Melhor show que você viu
        11. Banda que mudou sua vida
        12. Álbum que te fez tocar música
        13. Primeiro show da sua vida
        14. Banda que todos deveriam ouvir
        15. Álbum clássico obrigatório
        16. Melhor disco dos anos 80
        17. Melhor disco dos anos 90
        18. Melhor disco dos anos 2000
        19. Melhor disco recente
        20. Banda nova que merece atenção
        21. Melhor riff de todos os tempos
        22. Música perfeita para abrir show
        23. Música perfeita para fechar show
        24. Música que você gostaria de ter escrito
        25. Álbum que você escuta sempre
        26. Banda que gostaria de dividir turnê
        27. Banda que te surpreendeu ao vivo
        28. Melhor festival que você já tocou
        29. Melhor público que você já viu
        30. Cidade com melhor público
        31. Álbum que mudou sua forma de compor
        32. Banda que te influenciou
        33. Melhor capa de álbum
        34. Melhor produção de álbum
        35. Melhor solo de guitarra
        36. Música que define metal
        37. Banda que merece mais respeito
        38. Banda nova que vai crescer muito
        39. Álbum que envelheceu bem
        40. Álbum que você redescobriu
        41. Disco que você recomendaria para alguém que não gosta de metal
        42. Banda que você queria ter visto no auge
        43. Show que você mais se arrepende de ter perdido
        44. Melhor intro de música de metal
        45. Melhor final de música de metal
        46. Melhor música para dirigir de noite
        47. Melhor música para treinar
        48. Melhor música para “virar a chave” antes do palco
        49. Melhor música para ressaca
        50. Melhor música para um dia ruim
        51. Banda que você escuta escondido
        52. Guilty pleasure fora do metal
        53. Melhor álbum de estreia
        54. Melhor segundo álbum
        55. Melhor álbum “tardio” de uma banda
        56. Melhor comeback da história do metal
        57. Banda que você respeita mas não ouve muito
        58. Banda que você não suporta mas respeita
        59. Melhor banda ao vivo
        60. Melhor banda em estúdio
        61. Melhor vocalista clássico
        62. Melhor vocalista atual
        63. Melhor vocalista extremo
        64. Melhor vocal feminino
        65. Melhor dupla de guitarras
        66. Melhor trio de guitarras
        67. Melhor baixista “subestimado”
        68. Melhor baterista “subestimado”
        69. Melhor letrista do metal
        70. Melhor compositor de riffs
        71. Melhor compositor de refrões
        72. Melhor compositor de solos
        73. Melhor produtor de metal
        74. Melhor engenheiro de som (na sua opinião)
        75. Melhor som de caixa (snare) que você já ouviu
        76. Melhor timbre de guitarra (álbum)
        77. Melhor timbre de baixo (álbum)
        78. Melhor timbre de bateria (álbum)
        79. Melhor timbre de vocal (álbum)
        80. Melhor álbum com som “cru”
        81. Melhor álbum com som “polido”
        82. Melhor álbum com produção “gigante”
        83. Melhor álbum com produção minimalista
        84. Melhor capa clássica
        85. Capa mais feia (mas o álbum é bom)
        86. Capa que você gostaria de ter feito
        87. Melhor encarte / arte interna
        88. Melhor logo de banda
        89. Melhor nome de banda
        90. Melhor nome de álbum
        91. Melhor título de música
        92. Melhor clipe de metal
        93. Melhor performance ao vivo gravada (vídeo)
        94. Melhor álbum de turnê / live session
        95. Melhor festival para tocar
        96. Melhor festival para assistir
        97. Melhor lugar (venue) que você já tocou
        98. Melhor lugar (venue) que você já assistiu show
        99. Melhor som que você já teve no palco
        100. Pior som que você já teve no palco
        101. Melhor som que você já ouviu na plateia
        102. Pior som que você já ouviu na plateia
        103. Melhor público do Brasil (cidade)
        104. Melhor público fora do Brasil (país/cidade)
        105. Cidade que te surpreendeu
        106. Cidade que você quer voltar pra tocar
        107. Turnê dos sonhos (com quais bandas)
        108. Banda que seria um “feat” perfeito
        109. Músico que seria um “feat” perfeito
        110. Melhor collab / participação especial do metal
        111. Música que você queria tocar com a banda original
        112. Música que você queria cantar com a pessoa original
        113. Melhor cover de metal já feito
        114. Cover que você odeia
        115. Banda que faz o melhor cover ao vivo
        116. Melhor versão ao vivo de uma música de estúdio
        117. Melhor versão de estúdio de uma música que ao vivo é melhor
        118. Melhor solo para aprender na guitarra
        119. Melhor riff para aprender na guitarra
        120. Melhor linha de baixo para aprender
        121. Melhor virada de bateria
        122. Melhor breakdown
        123. Melhor blast beat
        124. Melhor groove
        125. Melhor “música de entrada” (walk-in)
        126. Melhor “música de saída” (encerramento)
        127. Música que te dá vontade de quebrar tudo (no bom sentido)
        128. Música que te dá vontade de cantar junto do começo ao fim
        129. Música que te dá vontade de chorar
        130. Música que te dá medo (sombrio, pesado)
        131. Música que te dá paz
        132. Música que te dá energia instantânea
        133. Álbum para ouvir inteiro sem pular faixa
        134. Álbum para ouvir só em dias específicos
        135. Álbum que mudou sua adolescência
        136. Álbum que mudou sua fase adulta
        137. Álbum que você só entendeu depois de velho
        138. Álbum que você enjoou
        139. Álbum que você voltou a amar
        140. Disco que todo mundo ama e você não
        141. Disco que todo mundo odeia e você ama
        142. Melhor disco “cult”
        143. Melhor disco “mainstream”
        144. Melhor disco de thrash
        145. Melhor disco de death
        146. Melhor disco de black
        147. Melhor disco de doom
        148. Melhor disco de power
        149. Melhor disco de prog metal
        150. Melhor recomendação final: um álbum e uma banda para a galera ouvir hoje
        **SEGWAY DE ENCERRAMENTO (despedida + CTAs) — falas fixas**  
        Use **exatamente** as falas abaixo (copiar e colar), apenas preenchendo os placeholders:  
        **Kilton (passando a bola pro convidado)**  
        "E pra fechar, [NOME DO CONVIDADO], deixa o recado pra galera: onde o pessoal te encontra, quais são os próximos passos da **[BANDA/PROJETO]**, e o que você quiser divulgar aqui."  
        **Convidado**  
        "[CTAs do convidado: Instagram, YouTube, Spotify, agenda, merch, etc.]"  
        **Rafa (puxando o encerramento do programa)**  
        "Boa demais. Obrigado por colar com a gente, [NOME DO CONVIDADO]."  
        **Kilton (encerramento + CTAs do Heavynauta — no estilo Snakepit)**  
        "E esse foi mais um **Heavynauta — Faixa a Faixa**.  
        Se curtiu esse episódio, dá aquela força:
        - segue a gente no Spotify
        - deixa 5 estrelas
        - compartilha com os metaleiros do seu grupo
        A nossa nave tá levantando voo mais uma vez. Um abraço pra você, Heavynauta, e a gente se vê no próximo episódio."  
        **COMO USAR (regra de ouro)**  
        Em cada episódio:
        - Escolha **5–7 perguntas** do banco **Faixa a Faixa**
        - Escolha **5 perguntas** do banco **Fechando a Conta**
        Isso mantém o formato consistente, mas deixa cada episódio com cara própria.  
        **REGRAS IMPORTANTES DA PAUTA FINAL (para gravar e enviar ao convidado)**
        - A resposta deve ser uma **PAUTA FINAL** pronta para gravação e para enviar ao convidado.
        - Não inclua bastidores, fonte, nem citações.
        - Não inclua links em excesso.
        - Nada de explicação longa: tudo em bullets e perguntas diretas.
        - Não faça perguntas para os hosts no final (sem "você prefere...").
        - Se faltar informação, mantenha genérico e siga o formato.
          
          
        mandatory update a pagina
  - O wizard monta dinamicamente as próximas etapas, uma por bloco marcado, na ordem escolhida.
3. **Etapas por bloco** (mesmo padrão para todos):
  - Campo de **insumo principal**:
    - Review → lookup do disco em `releases` (combobox de busca). adicioe tbm um botaozi nnho de + e  eu clico e e u posso incluir um lancamento com um form com os campos neessarios apra o releases 
      &nbsp;
    - Demais → input de URL (com botão "validar / resolver").
  - **Texto livre** (direção editorial / notas).
  - **Prompt** pré-preenchido com o default da plataforma (de `prompt-defaults.ts`), editável.
  - Botão **Copiar prompt** (mesma UX do que já existe em pautas semanais).
  - Área **"Colar resposta da IA"** com parser (`parsePautaResponse`) → ao colar, registra o material parsed inline (com badge de status + warnings).
4. **Etapas de materiais** (após todos os blocos):
  - **Título do episódio** (mesma dinâmica copiar prompt → colar → parser de títulos). Respietando o comportamento de  trazer tres opcoes e o ususario escolhe uam opcao 
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