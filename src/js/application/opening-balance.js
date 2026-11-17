import { openingBalanceId } from './records.js';
import { commitEntities } from '../data/repository.js';
import { amountInput, amountOK, formatDateBR, parseAmount, today } from '../domain/format.js';
import { Cloud } from '../services/cloud.js';
import { openingBalance } from '../state/selectors.js';
import { account, sessionLifecycle, state } from '../state/store.js';
import { $ } from '../ui/dom.js';
import { toast } from '../ui/feedback.js';

function openOpeningBalance() {
  if (Cloud.configured && !state.lastSync) {
    throw new Error('Sincronize sua conta primeiro para conferir o saldo inicial salvo.');
  }
  const entry = openingBalance();
  $('openingBalanceForm').reset();
  $('openingBalanceTitle').textContent = entry
    ? 'Altere seu saldo inicial'
    : 'Defina seu saldo inicial';
  $('openingBalanceAmount').value = entry
    ? amountInput((entry.type === 'expense' ? -1 : 1) * entry.amount)
    : '';
  $('openingBalanceDate').textContent =
    'Valor de partida em ' + formatDateBR(entry?.date || today()) + '.';
  $('openingBalanceHistoryHint').hidden =
    Boolean(entry) || !state.transactions.some((item) => item.entryKind !== 'opening');
  $('openingBalanceError').hidden = true;
  $('openingBalanceDialog').showModal();
}

async function saveOpeningBalance(event) {
  event.preventDefault();
  const button = $('btnSaveOpeningBalance');
  if (button.disabled) {
    return;
  }
  const key = account(),
    generation = sessionLifecycle.generation;
  button.disabled = true;
  $('openingBalanceError').hidden = true;
  try {
    const raw = $('openingBalanceAmount')
      .value.trim()
      .replace(/R\$|\s/g, '');
    const amount = parseAmount(raw.replace(/^[+-]/, '')) * (raw.startsWith('-') ? -1 : 1);
    if (!Number.isFinite(amount) || (amount !== 0 && !amountOK(Math.abs(amount)))) {
      throw new Error('Informe um saldo entre −R$ 999.999.999,99 e R$ 999.999.999,99.');
    }
    const previous = openingBalance();
    const id = await openingBalanceId(key);
    if (generation !== sessionLifecycle.generation) {
      throw new Error('Sua sessão mudou. Entre novamente para continuar.');
    }
    await commitEntities([
      [
        'tx',
        {
          id,
          type: amount < 0 ? 'expense' : 'income',
          amount: Math.abs(amount),
          date: previous?.date || today(),
          entryKind: 'opening',
          description: 'Saldo inicial',
          category: 'Saldo inicial',
          createdAt: previous?.createdAt || Date.now(),
        },
      ],
    ]);
    $('openingBalanceDialog').close();
    toast('Saldo inicial salvo. Seu saldo total foi atualizado.');
  } catch (error) {
    $('openingBalanceError').textContent =
      error.message || 'Não foi possível salvar o saldo inicial.';
    $('openingBalanceError').hidden = false;
  } finally {
    button.disabled = false;
  }
}

export { openOpeningBalance, saveOpeningBalance };
