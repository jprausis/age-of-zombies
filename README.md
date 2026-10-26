# Age of Zombies

RTS de sobrevivência no navegador, em visão isométrica. Você comanda um pequeno grupo de sobreviventes: monta um acampamento, junta recursos, saqueia cidades abandonadas e se fortifica contra os mortos que atacam o acampamento à noite. Três ninhos espalhados pelo mapa soltam zumbis sem parar; a meta é destruir os três antes que o mapa fique tomado.

Feito com HTML5 Canvas e JavaScript puro (módulos ES), sem dependências e sem etapa de build.

## Como rodar

Os módulos ES precisam de um servidor HTTP (abrir o `index.html` direto pelo `file://` não funciona):

```bash
cd age-of-zombies
python3 -m http.server 8080      # ou: npm start
```

Abra http://localhost:8080. Com `?debug` na URL, o estado do jogo fica acessível no console como `window.aoz`.

Teste da simulação (roda no Node, sem navegador):

```bash
npm test
```

## Como se joga

| Ação | Controle |
| --- | --- |
| Selecionar | clique, arrastar caixa, `Shift` para somar, duplo clique seleciona todos na tela |
| Ordem contextual | botão direito: chão = mover, árvore/pedra = coletar, casa = saquear, zumbi ou ninho = atacar, obra = construir/consertar, depósito = entregar. Soldados mandados trabalhar fazem escolta |
| Construir | painel inferior ou `B` barraca, `D` depósito, `C` cerca, `M` muro, `G` portão, `T` torre, `H` horta, `V` ferro-velho. Cercas e muros: arraste para fazer uma linha. `Shift` mantém o modo de construção |
| Câmera | setas, mouse nas bordas, botão do meio arrastando, roda para zoom, clique no minimapa |
| Evoluir | selecione a construção e use `U` (ou o botão no painel). Quem estiver parado vai trabalhar na reforma |
| Grupo | painel à direita: clique seleciona, duplo clique leva a câmera; `.` vai para o próximo parado |
| Recrutar | `R` catador, `S` soldado (ou pelos botões do acampamento) |
| Outros | `E` todos, `X` parar, `Ctrl+1…9` / `1…9` grupos, `Espaço` último alerta, `P` pausar, `+`/`-` velocidade, `Del` demolir/cancelar, `F` quadros por segundo, `N` liga/desliga o som |

### Regras principais

- **Objetivo:** destruir os 3 ninhos (pontos vermelhos no minimapa, sempre visíveis). Cada ninho solta um zumbi a cada 24 s no dia 1, 2 s mais rápido por dia (mínimo 8 s), e esses zumbis vagam pelo mapa todo: quanto mais o jogador demora, mais mortos terá que enfrentar (teto de 280 no mapa). Ninhos mais longe do acampamento têm mais vida; eles se regeneram quando ninguém atira, soltam levas de defensores e cospem ácido em quem chega perto. Cada ninho destruído rende sucata e comida e para de soltar zumbis.
- **Classes:** catadores (60 de vida, revólver fraco) coletam, saqueiam e constroem. Soldados (110 de vida, fuzil com mais dano e alcance) só lutam e custam 40 de comida e 25 de sucata. O grupo começa com 4 catadores e 1 soldado; quem é resgatado nas ruínas vira catador.
- **Cura:** quem fica perto do acampamento sem apanhar recupera 2 de vida por segundo.
- **Recursos:** madeira (árvores), pedra (rochas), comida (casas, mercados, hortas) e sucata (carros e caminhões abandonados nas ruas e estradas, oficinas e o ferro-velho). Os sobreviventes carregam até 10 por viagem e entregam no acampamento ou num depósito.
- **Ruínas:** casas, mercadinhos, oficinas e cabanas têm recursos. Às vezes há zumbis escondidos lá dentro, e às vezes um sobrevivente que entra para o grupo (se houver abrigo).
- **Dia e noite:** o dia dura 150 s e a noite 90 s. A primeira noite é calma.
- **Ferro-velho (`V`):** produz sucata sozinho, 1 a cada 7 s; evolui para prensa (4,5 s) e fundição (2,8 s). É a fonte que não acaba.
- **Evoluções:** acampamento (3 níveis), barraca → cabana de toras → casa de tijolos, depósito → armazém (+20% por entrega), cerca → com espetos (fere quem bate), muro → muralha, portão → de ferro, torre → torre de tiro → ninho de metralhadora, horta → irrigada → estufa.
- **Sons:** tiros (espingarda, rifle da torre com eco, rajadas da metralhadora), gemidos, mordidas, pancadas em muros, sino de alerta antes do anoitecer e corneta quando os mortos vêm. Tudo sintetizado com Web Audio, sem arquivos; volume e lado dependem da distância até a câmera.
- **Ícones:** sobre cada sobrevivente aparece o que ele está fazendo; o anel em volta enche conforme a carga. Âmbar piscando = parado.
- **Noites:** a partir da segunda, os zumbis que estiverem a até 24 tiles do acampamento ao anoitecer vêm atrás da fogueira. O aviso ~25 s antes diz quantos são, e uma seta na borda da tela aponta o maior grupo. Eles seguem um campo de fluxo até os prédios do acampamento. Muros entram no cálculo como obstáculo caro: se houver brecha, os zumbis passam por ela; se o acampamento estiver fechado, atacam o trecho mais fraco. Os ninhos passam a soltar corredores no dia 3 e brutamontes no dia 4.
- **Comida:** a cada amanhecer cada pessoa come 4. Se faltar, todos perdem vida.
- **Mordidas:** quem morre tem 50% de chance de se levantar como zumbi.
- **Vitória:** o último ninho cai. Dá para continuar jogando depois.
- **Derrota:** o acampamento é destruído ou o grupo inteiro morre sem comida para recrutar.

## Estrutura

```
index.html          página, HUD, estilos e os ícones (SVG embutido)
src/config.js       constantes e balanceamento (prédios, zumbis, ruínas, tempos)
src/game.js         simulação: sobreviventes, zumbis, prédios, ciclo dia/noite, comandos
src/worldgen.js     geração procedural do mapa, cidades e estradas
src/map.js          grade do mundo (terreno, recursos, ocupação, névoa)
src/pathfinding.js  A* com suavização de caminho
src/flowfield.js    campo de fluxo (Dijkstra) usado pelos zumbis que atacam à noite
src/heap.js         heap binário mínimo
src/iso.js          projeção isométrica 2:1 (tile <-> pixel)
src/render.js       quadro isométrico: chão em chunks pré-projetados com transições, ordenação por
                    profundidade, partículas, luz noturna, névoa, vinheta, minimapa
src/draw/shapes.js  paleta e primitivas isométricas (caixa, telhado, faces)
src/draw/nature.js  árvores, pedras e decoração (sprites pintados uma vez)
src/draw/buildings.js  ruínas e construções em cada nível de evolução, andaimes
src/draw/actors.js  sobreviventes, zumbis e ícones de atividade
src/input.js        mouse, teclado, seleção, câmera e posicionamento de obras
src/ui.js           HUD em DOM: recursos, relógio, objetivo (ninhos), alertas, seta do maior grupo à noite, grupo por classe,
                    retrato da seleção, botões e telas
src/audio.js        efeitos sonoros sintetizados (Web Audio) a partir dos eventos da simulação
src/main.js         laço principal (simulação em passo fixo de 1/30 s)
tests/sim.test.mjs  teste de fumaça da simulação
```

A simulação (`game.js` e afins) não toca no DOM e trabalha em coordenadas de tile; a projeção isométrica existe só no `render.js` e no `input.js`. Por isso ela é testada no Node.

## Próximos passos possíveis

- Trilha sonora ambiente (vento, grilos à noite)
- Armas e melhorias usando sucata (oficina, arsenal)
- Mais classes: batedor, médico
- Controles por toque (toque longo como botão direito)
- Salvar e carregar partida
- Mais tipos de zumbi (cuspidor, explosivo) e eventos (chuva, neblina, comerciante)
- Sprites desenhados à mão no lugar das formas geométricas
