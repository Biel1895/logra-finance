const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { prepareSuite, launchBrowser } = require('./support.cjs');

const site = prepareSuite('opening-balance');

async function settings(page) {
  await page.locator('[data-action="settings"]').filter({ visible: true }).first().click();
  await page.locator('#settingsDialog').waitFor({ state: 'visible' });
}

async function saveOpening(page, value) {
  await page.locator('#openingBalanceAmount').fill(value);
  await page.locator('#btnSaveOpeningBalance').click();
  await page.locator('#openingBalanceDialog').waitFor({ state: 'hidden' });
}

async function register(page, user) {
  await page.goto(pathToFileURL(join(site, 'login.html')).href);
  await page.locator('#tabRegisterBtn').click();
  await page.locator('#authIdentifier').fill(user);
  await page.locator('#authPassword').fill('senha-teste-123');
  await page.locator('#btnAuthSubmit').click();
  await page.locator('#appWrapper').waitFor({ state: 'visible' });
}

async function manual(page, type, description, amount) {
  await page.locator('[data-action="new"]').filter({ visible: true }).first().click();
  await page.locator('[data-compose="manual"]').click();
  await page.locator(`#composerDialog input[name="manualType"][value="${type}"]`).check();
  await page.locator('#manualDescription').fill(description);
  await page.locator('#manualAmount').fill(amount);
  await page.locator('#manualSaveButton').click();
  await page.locator('#composerDialog').waitFor({ state: 'hidden' });
}

async function expectBalances(page, total, month) {
  const values = await page.evaluate(() => FF_Finance.balanceSummary());
  assert.equal(values.total, total);
  assert.equal(values.month, month);
}

async function test() {
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({ timezoneId: 'America/Bahia' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await register(page, 'saldo-inicial');
    await page.locator('#openingBalanceSetup').waitFor({ state: 'visible' });
    await page.locator('#openingBalanceSetup button').click();
    await saveOpening(page, '1.234,56');
    await page.locator('#openingBalanceSetup').waitFor({ state: 'hidden' });
    await expectBalances(page, 1234.56, 0);
    assert.match(await page.locator('.summary-card.income .metric-value').innerText(), /0,00/);
    await manual(page, 'income', 'Recebimento de teste', '100,00');
    await manual(page, 'expense', 'Despesa de teste', '50,05');
    await expectBalances(page, 1284.51, 49.95);

    await settings(page);
    await page.locator('#btnEditOpeningBalance').click();
    await saveOpening(page, '2.000,01');
    await expectBalances(page, 2049.96, 49.95);
    await page.locator('#btnEditOpeningBalance').click();
    await saveOpening(page, '0,00');
    await page.locator('#btnEditOpeningBalance').click();
    await saveOpening(page, '-1.000,00');
    await page.locator('#settingsDialog [data-close]').click();
    await page.reload();
    await page.locator('#appWrapper').waitFor({ state: 'visible' });
    await expectBalances(page, -950.05, 49.95);
    await page.locator('#openingBalanceSetup').waitFor({ state: 'hidden' });
    console.log(
      'OK Primeiro acesso, soma dos movimentos, edição, saldo zero e negativo persistem.',
    );

    await settings(page);
    await page.locator('#btnEditOpeningBalance').click();
    await page.locator('#openingBalanceAmount').fill('inválido');
    await page.locator('#btnSaveOpeningBalance').click();
    await page.locator('#openingBalanceError').waitFor({ state: 'visible' });
    await expectBalances(page, -950.05, 49.95);
    await page.locator('#openingBalanceAmount').fill('300,00');
    await page.evaluate(() => {
      window.originalCommit = FF_LocalDB.commit;
      FF_LocalDB.commit = async () => {
        throw new Error('Falha de teste ao salvar');
      };
    });
    await page.locator('#btnSaveOpeningBalance').click();
    await page.locator('#openingBalanceError').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#openingBalanceAmount').inputValue(), '300,00');
    await expectBalances(page, -950.05, 49.95);
    await page.evaluate(() => {
      FF_LocalDB.commit = window.originalCommit;
    });
    await page.locator('#openingBalanceDialog').getByRole('button', { name: 'Cancelar' }).click();

    const downloaded = page.waitForEvent('download');
    await page.locator('#btnExportJSON').click();
    const backup = JSON.parse(await readFile(await (await downloaded).path(), 'utf8'));
    assert.equal(backup.schemaVersion, 4);
    assert.equal(backup.transactions.filter((entry) => entry.entryKind === 'opening').length, 1);
    const originalId = backup.transactions.find((entry) => entry.entryKind === 'opening').id;
    await page.locator('#settingsDialog [data-close]').click();
    await page.locator('#privacyButton').click();
    await settings(page);
    assert.equal(await page.locator('#settingsOpeningBalance').innerText(), 'R$ ••••');
    await page.locator('#settingsDialog [data-close]').click();
    await page.locator('#privacyButton').click();
    await page.setViewportSize({ width: 320, height: 740 });
    await settings(page);
    await page.locator('#btnEditOpeningBalance').click();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth));
    await page.locator('#openingBalanceDialog').getByRole('button', { name: 'Cancelar' }).click();
    await page.locator('#settingsDialog [data-close]').click();
    console.log(
      'OK Validação e falha de armazenamento preservam o saldo, com privacidade e layout móvel.',
    );

    const second = await context.newPage();
    second.on('pageerror', (error) => errors.push(error.message));
    // Logout também isola o saldo inicial ao criar outra conta neste aparelho.
    await settings(page);
    await page.locator('#btnLogout').click();
    await register(second, 'outra-conta-saldo');
    await expectBalances(second, 0, 0);
    await settings(second);
    for (let attempt = 0; attempt < 2; attempt++) {
      await second.locator('#inputImportJSON').setInputFiles({
        name: 'saldo-inicial.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(backup)),
      });
      await second.locator('#confirmAccept').click();
      await second.waitForFunction(() => !FF_STATE.busy && FF_STATE.transactions.length === 3);
      await second.waitForFunction(() => FF_Finance.balanceSummary().total === -950.05);
    }
    const openings = await second.evaluate(() =>
      FF_STATE.transactions.filter((entry) => entry.entryKind === 'opening'),
    );
    assert.equal(openings.length, 1);
    assert.notEqual(openings[0].id, originalId);
    await expectBalances(second, -950.05, 49.95);
    assert.deepEqual(errors, []);
    console.log(
      'OK Backup restaura o saldo inicial em outra conta sem duplicar ao importar novamente.',
    );
  } finally {
    await browser.close();
  }
}

test().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
