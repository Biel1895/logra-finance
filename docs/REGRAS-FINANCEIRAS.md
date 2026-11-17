# Regras financeiras que devem ser preservadas

## Valores e sinais

Os registros guardam valores positivos em reais, com até duas casas decimais. `entryKind: 'reversal'` representa um estorno vinculado ao original. Para os totais, `entryAmount` aplica o sinal negativo. Não transforme uma devolução de despesa em salário ou receita.

Totalizações de lançamentos, distribuição de parcelas e rateio de desconto usam centavos inteiros. Não arredonde cada fração independentemente e depois aceite uma diferença no total.

## Saldo total e mensal

- **Saldo total hoje:** saldo inicial informado mais entradas menos saídas de todo o histórico confirmado com data até hoje, inclusive. Fica estável ao navegar entre meses. Não inclui parcelas pendentes nem lançamentos com data futura.
- **Saldo do mês:** resultado apenas dos lançamentos do período selecionado. Pode incluir movimentações futuras que o usuário registrou nesse mês.
- No modo `independent`, investimentos ficam separados do saldo. No modo `integrated`, os aportes também são descontados. A preferência vale para os dois saldos.
- O usuário define o saldo inicial no convite exibido no primeiro acesso ou em **Dados e preferências → Saldo inicial**. Ele pode ser zero ou negativo e é somado ao total uma única vez. Ao corrigir o valor, a mesma base é atualizada.
- O saldo inicial fica registrado com `entryKind: 'opening'`, com data de definição. Seu sinal usa `income` ou `expense`. Ele é excluído das receitas, despesas, resultados mensais e gráficos de movimentação. O extrato CSV o identifica como **Saldo inicial**.
- Uma conta com histórico existente deve informar o saldo anterior aos lançamentos cadastrados. O formulário explica essa soma. O sistema calcula os valores informados pelo usuário.

## Vencimento e pagamento

`Bill.dueDate` é o vencimento original. `Transaction.date` é a data real em que o dinheiro entrou ou saiu. `paidAt` e `settledAmount` mantêm a correspondência com o lançamento vinculado.

Pagar em outro mês afeta o saldo e o filtro de pagos do mês efetivo do pagamento. Editar um pagamento atualiza seu vínculo com a conta. Não substitua silenciosamente o vencimento pela data de pagamento.

## Parcelas e recorrências

- `installment`: `rule.amount` é o total da compra e `totalInstallments` vai de 2 a 120. O total precisa permitir pelo menos um centavo por parcela. Os centavos restantes são distribuídos pelas primeiras parcelas.
- `monthly`: `rule.amount` é o valor de cada vencimento. A quantidade é projetada até o horizonte necessário.
- Os vencimentos são calculados a partir da data original. Uma compra de 31/01 vence em 28 ou 29/02 e volta a 31/03.
- Identificadores e índices de ocorrência evitam duplicação ao reabrir ou projetar outros meses.
- O nome do cartão é apenas um rótulo opcional. Não há cadastro de cartões ou faturas.

## Edição, estorno, antecipação e cancelamento

- Identificadores e vínculos devem permanecer estáveis ao editar.
- Estorno exige um lançamento original válido, mesmo tipo, data igual ou posterior e soma devolvida que não ultrapasse o valor original.
- Um original não pode ser reduzido abaixo do que já foi estornado.
- Antes de pagamentos ou cancelamentos, uma compra pode ser recalculada. Depois disso, preserve o histórico e edite parcelas individualmente.
- Antecipação registra os pagamentos na data escolhida, preserva os vencimentos e distribui o desconto sem perder centavos.
- Cancelamento retira compromissos pendentes da previsão e preserva registros históricos. Reembolso só é criado quando a devolução é informada.

## Previsão e relatórios

A previsão mostra cada mês separadamente, usando lançamentos e contas programadas. Não acumula o resultado dos meses, não estima salário e não inventa gastos ausentes.

O período visível do gráfico é separado do mês selecionado. Clicar em um mês antigo não deve eliminar os meses seguintes da janela. Gráficos, tabelas e exportações respeitam os sinais de estorno e o período escolhido.

Datas de negócio usam `YYYY-MM-DD`, sem conversão automática para UTC. Instantes técnicos de criação e atualização usam milissegundos. Ao escrever testes de datas, indique o fuso e evite depender do dia atual quando a regra permitir entradas explícitas.
