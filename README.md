# Age of Zombies

RTS de sobrevivência no navegador, em visão isométrica. Você comanda um pequeno grupo de sobreviventes: monta um acampamento, junta recursos, saqueia cidades abandonadas e se fortifica contra as hordas de zumbis que chegam toda noite. A meta é aguentar 10 noites.

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
| Ordem contextual | botão direito: chão = mover, árvore/pedra = coletar, casa = saquear, zumbi = atacar, obra = construir/consertar, depósito = entregar |
| Construir | painel inferior ou `B` barraca, `D` depósito, `C` cerca, `M` muro, `G` portão, `T` torre, `H` horta. Cercas e muros: arraste para fazer uma linha. `Shift` mantém o modo de construção |
| Câmera | setas, mouse nas bordas, botão do meio arrastando, roda para zoom, clique no minimapa |
| Evoluir | selecione a construção e use `U` (ou o botão no painel). Quem estiver parado vai trabalhar na reforma |
| Grupo | painel à direita: clique seleciona, duplo clique leva a câmera; `.` vai para o próximo parado |
| Outros | `E` todos, `X` parar, `R` recrutar, `Ctrl+1…9` / `1…9` grupos, `Espaço` último alerta, `P` pausar, `+`/`-` velocidade, `Del` demolir/cancelar, `F` quadros por segundo |

### Regras principais

- **Recursos:** madeira (árvores), pedra (rochas), comida (casas, mercados, hortas) e sucata (oficinas). Os sobreviventes carregam até 10 por viagem e entregam no acampamento ou num depósito.
- **Ruínas:** casas, mercadinhos, oficinas e cabanas têm recursos. Às vezes há zumbis escondidos lá dentro, e às vezes um sobrevivente que entra para o grupo (se houver abrigo).
- **Dia e noite:** o dia dura 150 s e a noite 90 s. A primeira noite é calma; as hordas começam na segunda. Uns 25 s antes de escurecer aparece o aviso da direção da horda. Ao anoitecer, a horda nasce na borda do mapa e os errantes próximos se juntam a ela.
- **Evoluções:** acampamento (3 níveis), barraca → cabana de toras → casa de tijolos, depósito → armazém (+20% por entrega), cerca → com espetos (fere quem bate), muro → muralha, portão → de ferro, torre → torre de tiro → ninho de metralhadora, horta → irrigada → estufa.
- **Ícones:** sobre cada sobrevivente aparece o que ele está fazendo; o anel em volta enche conforme a carga. Âmbar piscando = parado.
- **Hordas:** seguem um campo de fluxo até os prédios do acampamento. Muros entram no cálculo como obstáculo caro: se houver brecha, a horda passa por ela; se o acampamento estiver fechado, ela ataca o trecho mais fraco. A partir do dia 2 surgem corredores, e do dia 3 brutamontes.
- **Comida:** a cada amanhecer cada pessoa come 4. Se faltar, todos perdem vida.
- **Mordidas:** quem morre tem 50% de chance de se levantar como zumbi.
- **Derrota:** o acampamento é destruído ou o grupo inteiro morre sem comida para recrutar.

## Estrutura

```
index.html          página, HUD e estilos
src/config.js       constantes e balanceamento (prédios, zumbis, ruínas, tempos)
src/game.js         simulação: sobreviventes, zumbis, prédios, ciclo dia/noite, comandos
src/worldgen.js     geração procedural do mapa, cidades e estradas
src/map.js          grade do mundo (terreno, recursos, ocupação, névoa)
src/pathfinding.js  A* com suavização de caminho
src/flowfield.js    campo de fluxo (Dijkstra) usado pelas hordas
src/heap.js         heap binário mínimo
src/iso.js          projeção isométrica 2:1 (tile <-> pixel)
src/render.js       quadro isométrico: chão em chunks pré-projetados com transições, ordenação por
                    profundidade, partículas, luz noturna, névoa, vinheta, minimapa
src/draw/shapes.js  paleta e primitivas isométricas (caixa, telhado, faces)
src/draw/nature.js  árvores, pedras e decoração (sprites pintados uma vez)
src/draw/buildings.js  ruínas e construções em cada nível de evolução, andaimes
src/draw/actors.js  sobreviventes, zumbis e ícones de atividade
src/input.js        mouse, teclado, seleção, câmera e posicionamento de obras
src/ui.js           HUD em DOM: recursos, relógio, seleção, botões e telas
src/main.js         laço principal (simulação em passo fixo de 1/30 s)
tests/sim.test.mjs  teste de fumaça da simulação
```

A simulação (`game.js` e afins) não toca no DOM e trabalha em coordenadas de tile; a projeção isométrica existe só no `render.js` e no `input.js`. Por isso ela é testada no Node.

## Próximos passos possíveis

- Sons (tiros, gemidos, sino de alerta) com WebAudio
- Armas e melhorias usando sucata (oficina, arsenal)
- Profissões: lenhador, batedor, atirador, médico
- Controles por toque (toque longo como botão direito)
- Salvar e carregar partida
- Mais tipos de zumbi (cuspidor, explosivo) e eventos (chuva, neblina, comerciante)
- Sprites desenhados à mão no lugar das formas geométricas
