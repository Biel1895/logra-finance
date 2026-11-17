import { sanitizeRule, sanitizeTransaction } from '../domain/records.js';
import { sha256Hash } from '../infrastructure/credentials.js';
import { account } from '../state/store.js';

function cleanTransaction(raw, key = account()) {
  return sanitizeTransaction(raw, key);
}
function cleanRule(raw, key = account()) {
  return sanitizeRule(raw, key);
}

async function openingBalanceId(key) {
  return 'opening_' + (await sha256Hash(key)).slice(0, 48);
}

export { cleanRule, cleanTransaction, openingBalanceId };
