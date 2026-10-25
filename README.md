# Age of Zombies

RTS de sobrevivência no navegador. Você comanda um pequeno grupo de sobreviventes: monta um acampamento, junta recursos, saqueia cidades abandonadas e se fortifica contra as hordas de zumbis que chegam toda noite. A meta é aguentar 10 noites.

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
| Outros | `E` todos, `X` parar, `R` recrutar, `Ctrl+1…9` / `1…9` grupos, `Espaço` último alerta, `P` pausar, `+`/`-` velocidade, `Del` demolir/cancelar |

### Regras principais

- **Recursos:** madeira (árvores), pedra (rochas), comida (casas, mercados, hortas) e sucata (oficinas). Os sobreviventes carregam até 10 por viagem e entregam no acampamento ou num depósito.
- **Ruínas:** casas, mercadinhos, oficinas e cabanas têm recursos. Às vezes há zumbis escondidos lá dentro, e às vezes um sobrevivente que entra para o grupo (se houver abrigo).
- **Dia e noite:** o dia dura 150 s e a noite 90 s. Uns 25 s antes de escurecer aparece o aviso da direção da horda. Ao anoitecer, a horda nasce na borda do mapa e os errantes próximos se juntam a ela.
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
src/render.js       desenho no canvas: chão em chunks, objetos, luz noturna, névoa, minimapa
src/input.js        mouse, teclado, seleção, câmera e posicionamento de obras
src/ui.js           HUD em DOM: recursos, relógio, seleção, botões e telas
src/main.js         laço principal (simulação em passo fixo de 1/30 s)
tests/sim.test.mjs  teste de fumaça da simulação
```

A simulação (`game.js` e afins) não toca no DOM, então pode ser testada no Node e trocada de renderizador no futuro.

## Próximos passos possíveis

- Sons (tiros, gemidos, sino de alerta) com WebAudio
- Armas e melhorias usando sucata (oficina, arsenal)
- Profissões: lenhador, batedor, atirador, médico
- Controles por toque (toque longo como botão direito)
- Salvar e carregar partida
- Mais tipos de zumbi (cuspidor, explosivo) e eventos (chuva, neblina, comerciante)
- Sprites desenhados à mão no lugar das formas geométricas
