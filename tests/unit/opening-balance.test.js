import assert from 'node:assert/strict';
import { test } from 'node:test';
import { balanceSummary } from '../../src/js/application/finance.js';
import { sums, validateFinancialGraph } from '../../src/js/domain/finance.js';
import { today } from '../../src/js/domain/format.js';
import { sanitizeTransaction } from '../../src/js/domain/records.js';
import { state } from '../../src/js/state/store.js';

const opening = (overrides = {}) =>
  sanitizeTransaction(
    {
      id: 'opening_test',
      type: 'income',
      entryKind: 'opening',
      amount: 1000.01,
      date: today(),
      ...overrides,
    },
    'test-account',
  );

test('saldo inicial aceita zero e valor negativo sem permitir lançamentos comuns de valor zero', () => {
  assert.equal(opening({ amount: 0 }).amount, 0);
  assert.equal(opening({ type: 'expense', amount: 200 }).type, 'expense');
  assert.equal(opening().category, 'Saldo inicial');
  assert.throws(() => opening({ type: 'investment' }), /saldo inicial/);
  assert.throws(() => opening({ amount: 0, entryKind: 'normal' }), /valor/);
  assert.throws(() => opening({ amount: NaN }), /valor/);
});

test('saldo inicial entra uma vez no total e fica separado das receitas, despesas e do saldo mensal', () => {
  const saved = {
    transactions: state.transactions,
    balanceMode: state.balanceMode,
    selectedYear: state.selectedYear,
    selectedMonth: state.selectedMonth,
  };
  const now = new Date();
  try {
    state.selectedYear = now.getFullYear();
    state.selectedMonth = now.getMonth();
    state.balanceMode = 'independent';
    state.transactions = [
      opening(),
      { id: 'income', date: today(), type: 'income', amount: 300.03 },
      { id: 'expense', date: today(), type: 'expense', amount: 100.01 },
      { id: 'investment', date: today(), type: 'investment', amount: 20.02 },
    ];
    assert.deepEqual(sums(state.transactions), {
      income: 300.03,
      expense: 100.01,
      investment: 20.02,
    });
    assert.equal(balanceSummary().total, 1200.03);
    assert.equal(balanceSummary().month, 200.02);
    state.balanceMode = 'integrated';
    assert.equal(balanceSummary().total, 1180.01);
    assert.equal(balanceSummary().month, 180);
    state.transactions[0] = opening({ type: 'expense', amount: 200.03 });
    assert.equal(balanceSummary().total, -20.03);
    state.transactions[0] = opening({ amount: 0 });
    assert.equal(balanceSummary().total, 180);
  } finally {
    Object.assign(state, saved);
  }
});

test('backup rejeita saldo inicial duplicado e vínculos de pagamento ou estorno com o saldo inicial', () => {
  const validate = (transactions, bills = []) =>
    validateFinancialGraph({ transactions, bills, rules: [] });
  assert.doesNotThrow(() => validate([opening({ amount: 0 })]));
  assert.throws(() => validate([opening(), opening({ id: 'duplicate' })]), /apenas um/);
  assert.throws(
    () =>
      validate([
        opening(),
        {
          id: 'refund',
          entryKind: 'reversal',
          relatedTransactionId: 'opening_test',
          type: 'income',
          amount: 1,
          date: today(),
        },
      ]),
    /original válido/,
  );
  assert.throws(
    () =>
      validate(
        [opening()],
        [{ id: 'bill', status: 'paid', type: 'income', transactionId: 'opening_test' }],
      ),
    /pagamento|lançamento/,
  );
});
