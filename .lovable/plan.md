# Integrar episódios avulsos ao fluxo completo

Hoje a pauta avulsa é criada pelo wizard, mas o resto da plataforma trata ela como "meio órfã": a linha em Pautas → Episódios Avulsos só mostra Editar/Excluir, o modal do Calendário abre vazio, e a capa preenchida no wizard não aparece no editor avulso nem no Pacote do episódio. Este plano fecha o ciclo para que o avulso se comporte igual a um episódio semanal.

## O que muda na experiência

1. **Linha do episódio avulso ganha "Visualizar"**
  Na tabela `Episódios Avulsos` aparece um botão de olho (`Eye`) antes do Editar. Ao clicar abre exatamente o mesmo modal "Pacote do episódio" usado no Calendário (título selecionado, descrição HTML, capa, link Spotify, Mencionado no episódio, Ações rápidas, OneDrive). Tudo já preenchido com o que veio do wizard.
2. **Modal do Calendário deixa de abrir vazio**
  Quando clico no episódio avulso no Calendário, o "Pacote do episódio" carrega título, descrição, capa, Spotify e tudo o que foi definido no wizard — mesma experiência do print 4 do usuário.
3. **"Visualizar pauta" funciona no avulso**
  Dentro do Pacote do episódio (tanto do Calendário quanto da nova ação na tabela), clicar em "Visualizar pauta" abre o preview da pauta avulsa renderizada (blocos por tipo, com notas e resposta da IA) pronta para gravar. por exmeplo se houver release ou anuversario, ele deve trazer os botoes de youtube, spotify e Metal Archives por exmplo
4. **Capa preenchida no wizard persiste em todas as telas**
  O `cover_url` (e o `cover_source_url`, quando aplicável) salvo no wizard reverbera no editor da aba Episódios Avulsos e no Pacote do episódio. Nada mais aparece em branco depois de uma criação.

## Causa raiz dos bugs (parte técnica)

- `NovaPautaWizard.handleSave` insere o `episode_material` direto no Supabase mas **não chama `addMaterial` do `AppContext**`, então o array `materials` em memória não recebe o registro. Resultado: `CalendarView` (`materials.find(...)`) não acha nada e o modal abre vazio até o próximo reload; e o `StandaloneEpisodesTable` (que também lê de `materials`) renderiza o editor sem capa/descrição/título.
- O editor atual da tabela de avulsos é um modal próprio, mais pobre que o "Pacote do episódio". Precisamos reutilizar o componente do Calendário para ter paridade.
- O salvamento do wizard grava `cover_url` mas não `cover_source_url`; ao reabrir o "Gerar capa", o campo URL aparece vazio. Persistir os dois resolve.

## Mudanças por arquivo

### `src/contexts/AppContext.tsx`

- Garantir que existe (ou expor) `addMaterial(material)` que faz `setMaterials(prev => [...prev, material])` + `supabase.insert`. Se já houver `addMaterials` (plural), criar wrapper singular.

### `src/components/pautas/NovaPautaWizard.tsx`

- Em `handleSave`:
  - Trocar `supabase.from('episode_materials').insert(material)` por `addMaterial(material)` (mesma assinatura do contexto), para que apareça imediatamente no Calendário e na tabela.
  - Persistir `cover_source_url: state.coverUrl || null` junto com `cover_url`, para o editor de capa abrir já preenchido.
- Manter o resto do save igual.

### `src/components/pautas/StandaloneEpisodesTable.tsx`

- Adicionar ação **Visualizar** (ícone `Eye`) antes de Editar, que abre o mesmo "Pacote do episódio" do Calendário.
- Substituir o `StandaloneEpisodeEditor` atual pela reutilização do **EpisodePackageModal** extraído (ver abaixo). O Editar passa a abrir o mesmo modal em modo edição (já é tudo editável lá dentro).
- Remover código duplicado de descrição/capa/spotify daqui.

### `src/components/episodes/EpisodePackageModal.tsx` (novo)

- Extrair o JSX e os handlers do "Pacote do episódio" hoje embutidos em `src/pages/CalendarView.tsx` (linhas ~650–905) para um componente reutilizável.
- Props: `material`, `pauta?`, `open`, `onOpenChange`, `onPreviewPauta`.
- O componente fica responsável por: copiar título, editar/limpar "Mencionado no episódio", editar descrição HTML, gerar/baixar capa, link Spotify, OneDrive (download/abrir/excluir), Ações rápidas (Visualizar pauta, Copiar link compartilhável, Abrir workspace, Baixar pacote, Spotify for Creators).
- Internamente continua usando `useApp()` (`updateMaterial`, `loadMaterialCover`, etc.).

### `src/pages/CalendarView.tsx`

- Substituir o bloco grande do "Pacote do episódio" pelo novo `<EpisodePackageModal />`.
- Reaproveitar o `previewPauta` dialog que já existe; ele é passado como callback `onPreviewPauta` para o componente.
- Para episódio avulso: `getPautasForDate` já retorna o pauta avulso (filtra por `publication_date`), e o `materials.find(m => m.episode_date === ...)` passa a achar o material assim que o `addMaterial` for chamado no wizard.

### Visualizar pauta avulsa (preview)

- O preview hoje (`previewPauta` no CalendarView) usa o renderer semanal por slot do dia da semana. Para avulso, detectar `pauta.is_standalone` e renderizar `standalone_topics` (ícone + label + notas + resposta da IA), reutilizando o estilo do `StandaloneEpisodeEditor` em modo leitura.

## Fora de escopo

- Nenhuma mudança em RLS/migrations: as colunas (`cover_url`, `cover_source_url`, `description_html`, `is_standalone`) já existem.
- Nenhuma mudança no upload OneDrive / Rivaldo — já está roteado para `Snakepit/Avulsos/…`.
- Nenhuma mudança nos prompts dinâmicos do wizard.

## Critério de aceite

- Criar uma pauta avulsa pelo wizard → ela aparece imediatamente (sem refresh) no Calendário com modal preenchido.
- A linha de Episódios Avulsos tem 3 ações: Visualizar, Editar, Excluir.
- "Visualizar" (tabela) e clique no Calendário abrem o **mesmo** modal "Pacote do episódio".
- "Visualizar pauta" dentro desse modal mostra os blocos avulsos com notas + resposta da IA prontos para gravar.
- A capa preenchida no wizard aparece tanto no editor avulso quanto no Pacote do episódio sem precisar repreencher.

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
    Regras de formatação (muito importante):**
    Use emojis nos títulos para guiar a leitura (ex.: 🎙️, 🎸, 💸, ✅, 🚀).
    Use headings assim:
    Use **negrito** para nomes dos hosts e rótulos importantes.
    Use *itálico* para observações de tom e intenção (curtas).
    Use *destaque com fundo* para frases-chave (ex.: CTA e “no seu tempo”) usando:
    Nas listas de perguntas, mantenha só a pergunta, mas pode destacar 1 expressão-chave com fundo se ajudar o host a lembrar o gancho.
    Não inclua "Convidado(s)", "Banda/Projeto", "Álbum", "Ano", "Links" como seções no final. Esses dados já estão no input.
    Não inclua perguntas como "você prefere..." no final.
    Não use citações, nem marcadores de fonte (ex.: "whiplash+1", "[web]", "[page]", etc.).
    Não coloque links entre colchetes com rótulos (ex.: "[[music.apple](http://music.apple)]"). Se precisar incluir links, use **no máximo 3 links** em uma linha dentro da seção "Estrutura do episódio" como "Links úteis: ...".
    Não inclua a seção "Estrutura do episódio" na pauta final. (Você usa isso só internamente na gravação.)
    As seções de perguntas devem conter **somente as perguntas**, numeradas, sem parágrafos de contextualização.
    **Convidado(s):** [NOME DO CONVIDADO]
    **Banda/Projeto:** [BANDA/PROJETO]
    **Álbum:** [NOME DO ÁLBUM]
    **Ano:** [ANO]
    **Links (se houver):** [LINKS] (Spotify, Bandcamp, Metal Archives, site oficial, etc.)
    REGRA DE PLURAL (quando houver 2+ convidados)**  
    ando [NOME DO CONVIDADO] tiver mais de um nome:
    No roteiro, trate como **[NOMES DOS CONVIDADOS]** (ex.: "Fulano e Sicrano" ou "Fulano, Sicrano e Beltrano").
    Ao longo da pauta, distribua as perguntas: alterne quem responde e inclua chamadas do tipo:
    Se houver funções/cargos, use isso para direcionar perguntas (ex.: letra pro vocal, arranjo pro guitarrista, ritmo pro baterista), sem entrar em papo técnico de gear.
    PESQUISA RÁPIDA (obrigatória, mas NÃO aparece na pauta final)**  
    tes de escrever a pauta, faça uma pesquisa curta para não ficar genérico.  
    Regras da pesquisa (uso interno):**
    Priorize fontes confiáveis e diretas (site oficial, Bandcamp, Spotify, Metal Archives, entrevistas, press release, label).
    Se houver links no input, use esses links como prioridade.
    Se não houver links, pesquise na web por:
    Não invente informações.
    IMPORTANTE:**
    Não mostre esta seção na resposta.
    Use o que encontrar para deixar perguntas e ganchos mais específicos.
    Se algo não for encontrado, apenas não use (não precisa avisar na pauta final).
    NOME DO QUADRO**
    Confirme o nome do quadro: **Heavynauta — Faixa a Faixa**
    Explique em 2–3 linhas a proposta:
    INTRODUÇÃO (falas fixas)**  
    e **exatamente** as falas abaixo (copiar e colar), apenas preenchendo os placeholders:  
    Kilton**  
    audações, Heavynautas. O meu nome é Kilton Fernandes e esse episodio é o ***Heavynauta  Faixa a Faixa***, *o nosso episodio onde a gente abre o disco, aperta o play e vamos trocar uma ideia sobre a história por trás de cada faixa."*  
    *Rafa**  
     isso mesmo Kilton. Hoje estamos aqui pra virar o álbum do avesso No episódio de hoje a gente recebe **[NOME DO CONVIDADO]**, da **[BANDA/PROJETO]**, pra falar do álbum **[NOME DO ÁLBUM]** ([ANO]). E é com muito prazer que recebemos [NOME DO CONVIDADO], Seja muito bem vindo(a)”"  
    ta: se forem 2+ convidados, substitua o trecho “recebe **[NOME DO CONVIDADO]**” por “recebe **[NOMES DOS CONVIDADOS]**” e ajuste “bem vindo(a)” para “bem vindos(as)”."  
    ESTRUTURA DO EPISÓDIO (30–40 min)**  
    (USO INTERNO)**: você pode usar esta seção como guia, mas NÃO inclua isso na pauta final.**  
    **PERGUNTAS — FAIXA A FAIXA**  
    oloque o título completo assim: **Perguntas — Faixa a Faixa | [NOME DO ÁLBUM] (5–7)**)  
    lecione 5–7 perguntas do banco e escreva aqui **versões específicas para este álbum**, usando a pesquisa/tracklist.  
    Regras:**
    As perguntas devem vir **customizadas** com:
    Cada pergunta deve continuar sendo **uma pergunta só**.
    Sem parágrafos explicativos antes ou depois.
    Se você não tiver tracklist, customizar só com conceito/tema do álbum (sem inventar faixa).
    Banco (1–150) para escolher:**
  6. Como nasceu a primeira ideia deste álbum
  7. Qual música foi a primeira a ser composta
  8. Qual faixa mudou mais entre demo e versão final
  9. Qual música deu mais trabalho para terminar
  10. Qual faixa você sabia que seria especial
  11. Qual riff nasceu primeiro neste disco
  12. Qual faixa representa melhor o espírito da banda
  13. Qual música quase ficou fora do álbum
  14. Qual faixa surgiu de improviso
  15. Qual música demorou mais para ficar pronta
  16. Qual faixa tem a melhor história por trás
  17. Qual música surpreendeu a própria banda
  18. Qual faixa foi mais divertida de gravar
  19. Qual música foi a mais difícil tecnicamente
  20. Qual faixa representa melhor o momento da banda
  21. Qual música nasceu de uma ideia antiga
  22. Qual faixa mudou completamente no estúdio
  23. Qual música surgiu de uma jam
  24. Qual faixa ficou melhor do que vocês esperavam
  25. Qual música tem o riff mais pesado do disco
  26. Qual faixa tem o refrão mais forte
  27. Qual música você imagina abrindo um show
  28. Qual faixa funciona melhor ao vivo
  29. Qual música tem a letra mais pessoal
  30. Qual faixa tem a história mais curiosa
  31. Qual música foi escrita mais rápido
  32. Qual faixa levou mais tempo para gravar
  33. Qual música exigiu mais testes de arranjo
  34. Qual faixa tem a melhor performance vocal
  35. Qual música mais surpreende quem escuta
  36. Qual faixa nasceu de uma linha de bateria
  37. Qual música nasceu de um riff simples
  38. Qual faixa começou com uma ideia de letra
  39. Qual música nasceu no estúdio
  40. Qual faixa representa a identidade da banda
  41. Qual música mudou o rumo do disco
  42. Qual faixa mostra um lado novo da banda
  43. Qual música você recomendaria primeiro
  44. Qual faixa os fãs comentam mais
  45. Qual música você gostaria de tocar mais ao vivo
  46. Qual faixa tem o melhor groove
  47. Qual música nasceu durante ensaio
  48. Qual faixa quase virou outra música
  49. Qual música tem o arranjo mais complexo
  50. Qual faixa você mudaria hoje
  51. Qual música mais representa o som atual da banda
  52. Qual faixa é mais pesada ao vivo
  53. Qual música tem o melhor solo
  54. Qual faixa nasceu de uma brincadeira
  55. Qual música tem a letra mais forte
  56. Qual faixa exigiu mais gravações
  57. Qual música tem mais camadas de guitarra
  58. Qual faixa tem a melhor dinâmica
  59. Qual música mudou mais na produção
  60. Qual faixa nasceu de um riff antigo
  61. Qual música cresceu mais no estúdio
  62. Qual faixa foi a última a entrar no álbum
  63. Qual música foi escrita por último
  64. Qual faixa tem a melhor atmosfera
  65. Qual música tem mais energia
  66. Qual faixa resume o disco
  67. Qual música representa melhor a banda
  68. Qual faixa foi pensada para o palco
  69. Qual música tem a estrutura mais diferente
  70. Qual faixa você mais gosta de tocar
  71. Qual música exige mais da banda ao vivo
  72. Qual faixa tem o melhor clima
  73. Qual música tem o melhor ritmo
  74. Qual faixa você espera que vire clássica
  75. Qual música mais representa o conceito do disco
  76. Qual faixa tem o riff favorito da banda
  77. Qual música tem a melhor melodia
  78. Qual faixa mais desafia os músicos
  79. Qual música mais surpreende no álbum
  80. Qual faixa nasceu de um erro
  81. Qual música mudou muito na mixagem
  82. Qual faixa foi mais difícil de finalizar
  83. Qual música teve mais versões
  84. Qual faixa exigiu mais criatividade
  85. Qual música nasceu em casa
  86. Qual faixa nasceu durante viagem
  87. Qual música nasceu de improviso
  88. Qual faixa quase foi descartada
  89. Qual música virou favorita da banda
  90. Qual faixa mudou de nome
  91. Qual música mudou de andamento
  92. Qual faixa ficou mais pesada no estúdio
  93. Qual música foi mais simples de gravar
  94. Qual faixa nasceu de um experimento
  95. Qual música ganhou vida no estúdio
  96. Qual faixa você apresentaria primeiro
  97. Qual música define o disco
  98. Qual faixa tem a melhor energia
  99. Qual música mais representa a banda
  100. Qual faixa você gostaria de revisitar
  101. Qual música você faria diferente hoje
  102. Qual faixa cresceu mais depois da gravação
  103. Qual música funciona melhor em show
  104. Qual faixa virou favorita dos fãs
  105. Qual música resume o álbum
  106. Qual faixa nasceu de uma conversa ou tema pessoal
  107. Qual música teve a letra escrita primeiro
  108. Qual faixa teve o arranjo mais retrabalhado
  109. Qual música vocês quase aceleraram ou desaceleraram
  110. Qual faixa tem o detalhe mais escondido na mix
  111. Qual música tem o melhor “momento” do disco (aquele trecho que arrepia)
  112. Qual faixa teve a maior discussão interna para decidir o rumo
  113. Qual música ficou mais diferente quando entrou a voz
  114. Qual faixa teve o melhor take “ao vivo” no estúdio
  115. Qual música vocês gravaram em menos takes
  116. Qual faixa vocês gravaram em mais takes
  117. Qual música teve a melhor ideia de pré-produção
  118. Qual faixa mudou depois de ouvir referência de outra banda
  119. Qual música nasceu de um riff que ficou “engavetado”
  120. Qual faixa nasceu de uma linha de baixo
  121. Qual música nasceu de uma ideia de harmonia (duas guitarras)
  122. Qual faixa tem a melhor ponte do álbum
  123. Qual música tem o refrão mais difícil de cantar
  124. Qual faixa tem o groove mais diferente do padrão da banda
  125. Qual música tem o melhor trabalho de bateria
  126. Qual faixa tem a letra mais “visual” (cinematográfica)
  127. Qual música tem a letra mais direta e sem metáfora
  128. Qual faixa tem a melhor frase de letra do disco
  129. Qual música foi escrita pensando em alguém específico
  130. Qual faixa tem o clima mais sombrio
  131. Qual música tem o clima mais “pra cima”
  132. Qual faixa tem a melhor construção de tensão
  133. Qual música tem a melhor virada (quebra, mudança de tempo, surpresa)
  134. Qual faixa vocês consideram a mais “metal raiz”
  135. Qual música vocês consideram a mais experimental
  136. Qual faixa tem o melhor timbre de guitarra
  137. Qual música tem o melhor timbre de baixo
  138. Qual faixa tem o melhor timbre de bateria
  139. Qual música tem o melhor timbre de vocal
  140. Qual faixa tem o melhor trabalho de backing vocal
  141. Qual música ficou melhor depois da master
  142. Qual faixa foi mais difícil de mixar
  143. Qual música teve mais camadas e pistas no estúdio
  144. Qual faixa foi mais “orgânica” na gravação
  145. Qual música tem a parte mais rápida do disco
  146. Qual faixa tem a parte mais lenta do disco
  147. Qual música tem o melhor breakdown
  148. Qual faixa tem o melhor solo (em termos de emoção)
  149. Qual música tem o solo mais técnico
  150. Qual faixa ficou mais fiel à demo
  151. Qual música ficou menos fiel à demo
  152. Qual faixa vocês mudariam se fossem regravar hoje
  153. Qual música vocês acham que vai dividir opiniões
  154. Qual faixa vocês querem muito ver a reação do público ao vivo
  155. Qual música vocês acham que vai virar a favorita de um nicho de fãs
    SEGWAY (entrada para o Fechando a Conta) — falas fixas**  
    e **exatamente** as falas abaixo (copiar e colar), apenas preenchendo o placeholder da pergunta:  
    Kilton**  
    í sim. Foi uma conversa monstra e deu pra abrir bem esse disco… mas o tempo voa. Então bora pro nosso bloco final: **Fechando a Conta**."  
    Rafa**  
    ambora. Agora a gente vai pro **Fechando a Conta**. A gente vai te fazer algumas perguntas e você pode **comentar à vontade, no seu tempo**. Bora!"  
    Kilton (puxando a 1ª pergunta)**  
    rimeira: [PERGUNTA ESCOLHIDA DO BANCO]"  
    PERGUNTAS — FECHANDO A CONTA**  
    lecione **5 prompts aleatórios** do banco e liste aqui.  
    Regras de aleatoriedade:**
    Não repetir as mesmas 5 perguntas em episódios seguidos.
    Buscar variedade (ex.: 1 sobre álbum, 1 sobre banda, 1 sobre show, 1 sobre músico/riff/solo, 1 recomendação).
    Se você detectar que as escolhas ficaram parecidas com o padrão (ex.: “álbum perfeito”, “banda que mudou sua vida”, “álbum que te fez tocar música”, “melhor riff”, “melhor solo”), troque 2 ou 3 delas por outras do banco.
    Regras:**
    Apenas os prompts, numerados.
    Sem contexto.
    Banco (1–150) para escolher:**
  156. Álbum perfeito de metal
  157. Banda subestimada
  158. Banda superestimada
  159. Riff mais pesado já feito
  160. Melhor vocal do metal
  161. Melhor guitarrista do metal
  162. Melhor baterista do metal
  163. Melhor baixista do metal
  164. Melhor álbum ao vivo
  165. Melhor show que você viu
  166. Banda que mudou sua vida
  167. Álbum que te fez tocar música
  168. Primeiro show da sua vida
  169. Banda que todos deveriam ouvir
  170. Álbum clássico obrigatório
  171. Melhor disco dos anos 80
  172. Melhor disco dos anos 90
  173. Melhor disco dos anos 2000
  174. Melhor disco recente
  175. Banda nova que merece atenção
  176. Melhor riff de todos os tempos
  177. Música perfeita para abrir show
  178. Música perfeita para fechar show
  179. Música que você gostaria de ter escrito
  180. Álbum que você escuta sempre
  181. Banda que gostaria de dividir turnê
  182. Banda que te surpreendeu ao vivo
  183. Melhor festival que você já tocou
  184. Melhor público que você já viu
  185. Cidade com melhor público
  186. Álbum que mudou sua forma de compor
  187. Banda que te influenciou
  188. Melhor capa de álbum
  189. Melhor produção de álbum
  190. Melhor solo de guitarra
  191. Música que define metal
  192. Banda que merece mais respeito
  193. Banda nova que vai crescer muito
  194. Álbum que envelheceu bem
  195. Álbum que você redescobriu
  196. Disco que você recomendaria para alguém que não gosta de metal
  197. Banda que você queria ter visto no auge
  198. Show que você mais se arrepende de ter perdido
  199. Melhor intro de música de metal
  200. Melhor final de música de metal
  201. Melhor música para dirigir de noite
  202. Melhor música para treinar
  203. Melhor música para “virar a chave” antes do palco
  204. Melhor música para ressaca
  205. Melhor música para um dia ruim
  206. Banda que você escuta escondido
  207. Guilty pleasure fora do metal
  208. Melhor álbum de estreia
  209. Melhor segundo álbum
  210. Melhor álbum “tardio” de uma banda
  211. Melhor comeback da história do metal
  212. Banda que você respeita mas não ouve muito
  213. Banda que você não suporta mas respeita
  214. Melhor banda ao vivo
  215. Melhor banda em estúdio
  216. Melhor vocalista clássico
  217. Melhor vocalista atual
  218. Melhor vocalista extremo
  219. Melhor vocal feminino
  220. Melhor dupla de guitarras
  221. Melhor trio de guitarras
  222. Melhor baixista “subestimado”
  223. Melhor baterista “subestimado”
  224. Melhor letrista do metal
  225. Melhor compositor de riffs
  226. Melhor compositor de refrões
  227. Melhor compositor de solos
  228. Melhor produtor de metal
  229. Melhor engenheiro de som (na sua opinião)
  230. Melhor som de caixa (snare) que você já ouviu
  231. Melhor timbre de guitarra (álbum)
  232. Melhor timbre de baixo (álbum)
  233. Melhor timbre de bateria (álbum)
  234. Melhor timbre de vocal (álbum)
  235. Melhor álbum com som “cru”
  236. Melhor álbum com som “polido”
  237. Melhor álbum com produção “gigante”
  238. Melhor álbum com produção minimalista
  239. Melhor capa clássica
  240. Capa mais feia (mas o álbum é bom)
  241. Capa que você gostaria de ter feito
  242. Melhor encarte / arte interna
  243. Melhor logo de banda
  244. Melhor nome de banda
  245. Melhor nome de álbum
  246. Melhor título de música
  247. Melhor clipe de metal
  248. Melhor performance ao vivo gravada (vídeo)
  249. Melhor álbum de turnê / live session
  250. Melhor festival para tocar
  251. Melhor festival para assistir
  252. Melhor lugar (venue) que você já tocou
  253. Melhor lugar (venue) que você já assistiu show
  254. Melhor som que você já teve no palco
  255. Pior som que você já teve no palco
  256. Melhor som que você já ouviu na plateia
  257. Pior som que você já ouviu na plateia
  258. Melhor público do Brasil (cidade)
  259. Melhor público fora do Brasil (país/cidade)
  260. Cidade que te surpreendeu
  261. Cidade que você quer voltar pra tocar
  262. Turnê dos sonhos (com quais bandas)
  263. Banda que seria um “feat” perfeito
  264. Músico que seria um “feat” perfeito
  265. Melhor collab / participação especial do metal
  266. Música que você queria tocar com a banda original
  267. Música que você queria cantar com a pessoa original
  268. Melhor cover de metal já feito
  269. Cover que você odeia
  270. Banda que faz o melhor cover ao vivo
  271. Melhor versão ao vivo de uma música de estúdio
  272. Melhor versão de estúdio de uma música que ao vivo é melhor
  273. Melhor solo para aprender na guitarra
  274. Melhor riff para aprender na guitarra
  275. Melhor linha de baixo para aprender
  276. Melhor virada de bateria
  277. Melhor breakdown
  278. Melhor blast beat
  279. Melhor groove
  280. Melhor “música de entrada” (walk-in)
  281. Melhor “música de saída” (encerramento)
  282. Música que te dá vontade de quebrar tudo (no bom sentido)
  283. Música que te dá vontade de cantar junto do começo ao fim
  284. Música que te dá vontade de chorar
  285. Música que te dá medo (sombrio, pesado)
  286. Música que te dá paz
  287. Música que te dá energia instantânea
  288. Álbum para ouvir inteiro sem pular faixa
  289. Álbum para ouvir só em dias específicos
  290. Álbum que mudou sua adolescência
  291. Álbum que mudou sua fase adulta
  292. Álbum que você só entendeu depois de velho
  293. Álbum que você enjoou
  294. Álbum que você voltou a amar
  295. Disco que todo mundo ama e você não
  296. Disco que todo mundo odeia e você ama
  297. Melhor disco “cult”
  298. Melhor disco “mainstream”
  299. Melhor disco de thrash
  300. Melhor disco de death
  301. Melhor disco de black
  302. Melhor disco de doom
  303. Melhor disco de power
  304. Melhor disco de prog metal
  305. Melhor recomendação final: um álbum e uma banda para a galera ouvir hoje
    SEGWAY DE ENCERRAMENTO (despedida + CTAs) — falas fixas**  
    e **exatamente** as falas abaixo (copiar e colar), apenas preenchendo os placeholders:  
    Kilton (passando a bola pro convidado)**  
     pra fechar, [NOME DO CONVIDADO], deixa o recado pra galera: onde o pessoal te encontra, quais são os próximos passos da **[BANDA/PROJETO]**, e o que você quiser divulgar aqui."  
    Convidado**  
    CTAs do convidado: Instagram, YouTube, Spotify, agenda, merch, etc.]"  
    Rafa (puxando o encerramento do programa)**  
    oa demais. Obrigado por colar com a gente, [NOME DO CONVIDADO]."  
    Kilton (encerramento + CTAs do Heavynauta — no estilo Snakepit)**  
     esse foi mais um **Heavynauta — Faixa a Faixa**.  
     curtiu esse episódio, dá aquela força:
    segue a gente no Spotify
    deixa 5 estrelas
    compartilha com os metaleiros do seu grupo
    nossa nave tá levantando voo mais uma vez. Um abraço pra você, Heavynauta, e a gente se vê no próximo episódio."  
    COMO USAR (regra de ouro)**  
     cada episódio:
    Escolha **5–7 perguntas** do banco **Faixa a Faixa**
    Escolha **5 perguntas** do banco **Fechando a Conta**
    so mantém o formato consistente, mas deixa cada episódio com cara própria.  
    REGRAS IMPORTANTES DA PAUTA FINAL (para gravar e enviar ao convidado)**
    A resposta deve ser uma **PAUTA FINAL** pronta para gravação e para enviar ao convidado.
    Não inclua bastidores, fonte, nem citações.
    Não inclua links em excesso.
    Nada de explicação longa: tudo em bullets e perguntas diretas.
    Não faça perguntas para os hosts no final (sem "você prefere...").
    Se faltar informação, mantenha genérico e siga o formato.
    ndatory update a pagina
    rd monta dinamicamente as próximas etapas, uma por bloco marcado, na ordem escolhida.
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