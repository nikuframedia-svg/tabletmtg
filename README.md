# Posto Guilhotina 9M — Kanban digital (tablet)

App de chão de fábrica para o posto **Guilhotina 9M** (MTG2), feita para um tablet Android ao lado da máquina. Substitui o kanban em papel (TPL103):

- o operador identifica-se e valida o horário;
- escolhe as OFs do planeamento e regista produção, paragens e quantidades;
- no fim do turno tem o seu kanban pessoal.

A app é **um único ficheiro** ([`index.html`](index.html)), em HTML, CSS e JavaScript simples, sem build nem dependências. O estado fica guardado no `localStorage` do browser (chave `mtg-gui-simple-v1`).

## Como correr

```bash
python3 -m http.server 55986
```

Abrir `http://127.0.0.1:55986/` (ou `?inicio=1` para começar no ecrã "Quem é?").

Para o tablet, a pasta servida é publicada com um túnel Cloudflare (`cloudflared tunnel --url http://127.0.0.1:55986`). O link só funciona enquanto o computador, o servidor e o túnel estiverem ligados.

A app verifica de 2 em 2 minutos se há uma versão nova (`APP_VERSION`) e recarrega sozinha. Nada se perde, porque o estado está no `localStorage`.

## Fluxo do operador

1. **Quem é?** — lista de todos os colaboradores, com o nº de operador. Não há filtro por turno.
2. **Meu horário** — barra de turno (Manhã / Tarde / Noite), ajuste de entrada e saída em ±30 min e **Validar horário**.
3. **Planeamento** — lista de OFs:
   - **Pesquisa por OF.**
   - Filtros de ferramenta: **CONI 10 · CONI 12 · CONI 14 · CONI 16 · OCT**.
   - Separadores **Por iniciar · Em curso · Feitas**.
   - À esquerda de cada OF, a **prioridade (coluna TRN do Excel CPIs, ex. "C3") em vermelho**. A lista é ordenada por essa prioridade.
   - O modelo (designação) aparece em letra grande. O OV não é mostrado.
   - O detalhe (▾) segue a ordem do Excel: Prioridade, Cliente, OF, Designação, Qtd, Data entr., Ferramenta, Espessura, LBase, LTopo, LTotal, Comp, Largura de corte, Comp. corte bobine, Material, Máquina seguinte.
4. **Iniciar** — até 2 OFs com a mesma chapa (material + espessura). A barra da OF em curso fica fixa por baixo do cabeçalho, com cronómetro, produção, paragem, quantidade e os botões Parar e Acabar.
   - **Em curso** mostra todos os dados da OF a correr, os tempos e as paragens.
5. **Parar** — abre um painel em baixo, já preenchido com a OF, a quantidade e a máquina seguinte, e com os motivos de paragem.
   - Se alguém escolher uma OF enquanto a máquina está parada, aparece o aviso **"Há uma paragem nesta máquina"**.
6. **Acabar** — pede só a quantidade produzida (o Enter fecha o teclado) e mostra a máquina seguinte, que é fixa.
   - **Só uma OF 100% feita vai para "Feitas".** Se faltar alguma peça, a OF fica em **Em curso** ("Faltam N · fica em curso") e pode ser retomada; a quantidade continua a somar.
7. **Kanban** — o kanban pessoal em formato de tabela, como a folha em papel, com uma linha por produção:
   - colunas PRI, Cliente, OF, Modelo, Qtd, Comp, CONI, Esp, LBase, LTopo, Início, Fim, Produção e Paragens (motivo + duração);
   - resumo com operador, nº, quantidade produzida, tempo de produção e tempo de paragem;
   - filtros por data, por turno (Todos / Manhã / Tarde / Noite) e **Turno anterior**.

### Cabeçalho

Compacto e fixo. Mostra a máquina (**GUILHOTINA 9M**), a navegação Planeamento / Kanban e o colaborador.

Ao tocar no colaborador abre um menu com:
- Mudar horário;
- Tema claro / escuro;
- Ecrã inteiro (Chrome Android);
- Idioma (PT / EN / ਪੰਜਾਬੀ);
- Sair.

## Dados das OFs

As OFs vêm da exportação do planeamento `plan_colunas_cpis.xlsx` (pasta Drive "MTG | Kanban Digital", 16/11/2026). Ficam as linhas com destino **Guilhotina 9m**, exceto:
- as anuladas;
- as já cortadas (coluna `c` ≥ `quanttrp`);
- as OFs repetidas.

Todas começam em "Por iniciar", com quantidade produzida 0.

- **Ferramenta**: deduzida da geometria.
  - **OCT** para modelos C?O… e CD..P.
  - Nos outros, conicidade = (dbase − dtopo) / comp × 1000, arredondada para 10 / 12 / 14 / 16.
- **Máquina seguinte**: fixa, **GUIFIL** (designação kanban da Quinadora Guifil MTG2 em `maquinas.xlsx`).
- **Largura de corte / Comp. corte bobine**: vêm do LTotal e do Comp da planificação, enquanto o Excel não trouxer colunas próprias.

### Em falta

- **Prioridade (TRN) e data de entrega**: não estão na exportação `plan_colunas_cpis.xlsx`. Só a OF 264983 tem prioridade (C3), tirada de uma captura do Excel CPIs. Para preencher todas, é preciso o Excel CPIs com as colunas TRN e ENTREGA.
- **Testes**: [`tests/app.test.cjs`](tests/app.test.cjs) (Playwright) foi escrito para a versão anterior (filtro por turno, "Por cortar / Cortadas") e ainda não foi atualizado.

## Estrutura

| Ficheiro | O quê |
|---|---|
| `index.html` | A app inteira (estilos, textos PT/EN/PA, dados das OFs, lógica). |
| `tests/app.test.cjs` | Testes Playwright (desatualizados, ver acima). |
