const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { once } = require('node:events');
const { readFile } = require('node:fs/promises');
const { createServer } = require('node:http');
const { extname, join } = require('node:path');
const { launchBrowser, projectRoot } = require('./support.cjs');

const types = {
  '.css': 'text/css',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};
let release = 1;
let failDownload = false;

const server = createServer(async (request, response) => {
  const { pathname } = new URL(request.url, 'http://localhost');
  const path = pathname === '/' ? '/index.html' : pathname;
  if (failDownload && path === '/style.css') {
    response.writeHead(503).end();
    return;
  }
  try {
    let body = await readFile(join(projectRoot, 'dist', path));
    if (path === '/service-worker.js') {
      body = body
        .toString()
        .replace(/"version":"[a-f0-9]+"/, `"version":"test-release-${release}"`);
    } else if (path === '/app.js') {
      body = `window.testRelease = ${release};\n` + body;
    } else if (path === '/config.js') {
      body = 'window.FF_SUPABASE_CONFIG = null;';
    }
    response.writeHead(200, {
      'Content-Type': types[extname(path)],
      'Cache-Control': 'no-store',
    });
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
});

async function publish(page, version) {
  release = version;
  await page.evaluate(() => {
    window.testControllerChanged = false;
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => {
        window.testControllerChanged = true;
      },
      { once: true },
    );
    window.dispatchEvent(new Event('focus'));
  });
}

async function waitForRelease(page, version) {
  await page.waitForFunction((expected) => window.testRelease === expected, version);
  await page.locator('#appWrapper').waitFor({ state: 'visible' });
}

async function settings(page) {
  await page.locator('[data-action="settings"]').filter({ visible: true }).first().click();
}

async function test() {
  execFileSync(process.execPath, ['scripts/build-vercel.mjs'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      FF_SITE_URL: 'https://pwa.example.test/',
      FF_SUPABASE_URL: 'https://testefinancas.supabase.co',
      FF_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_teste',
    },
    stdio: 'inherit',
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({ timezoneId: 'America/Bahia' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(origin + '/login.html');
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await page.locator('#tabRegisterBtn').click();
    await page.locator('#authIdentifier').fill('teste-atualizacao');
    await page.locator('#authPassword').fill('senha-local-123');
    await page.locator('#btnAuthSubmit').click();
    await page.locator('#appWrapper').waitFor({ state: 'visible' });
    await page.locator('#openingBalanceSetup button').click();
    await page.locator('#openingBalanceAmount').fill('1000,00');
    await page.locator('#btnSaveOpeningBalance').click();
    await page.locator('#openingBalanceDialog').waitFor({ state: 'hidden' });
    await settings(page);
    await page.locator('#btnCheckAppUpdate').click();
    await page.waitForFunction(() =>
      document.getElementById('appUpdateStatus').textContent.includes('versão mais recente'),
    );
    await page.locator('#settingsDialog [data-close]').click();

    await publish(page, 2);
    await waitForRelease(page, 2);
    assert.equal(await page.evaluate(() => FF_Finance.balanceSummary().total), 1000);
    assert.equal(await page.evaluate(() => FF_STATE.transactions.length), 1);
    console.log('OK Nova publicação atualiza automaticamente e preserva sessão e saldo inicial.');

    await page.locator('[data-action="new"]').filter({ visible: true }).first().click();
    await page.locator('[data-compose="manual"]').click();
    await page.locator('#manualDescription').fill('Compra durante a atualização');
    await page.locator('#manualAmount').fill('20,00');
    await publish(page, 3);
    await page.waitForFunction(() => window.testControllerChanged);
    // Aguarda um ciclo da aplicação automática para conferir a proteção do formulário.
    await page.waitForTimeout(1200);
    assert.equal(await page.evaluate(() => window.testRelease), 2);
    assert.equal(await page.locator('#manualAmount').inputValue(), '20,00');
    await page.locator('#manualSaveButton').click();
    await waitForRelease(page, 3);
    assert.equal(await page.evaluate(() => FF_Finance.balanceSummary().total), 980);
    assert.equal(await page.evaluate(() => FF_STATE.transactions.length), 2);
    console.log(
      'OK Atualização aguarda salvar o lançamento e recarrega sem perder ou duplicar o registro.',
    );

    await settings(page);
    await page.locator('#btnLogout').click();
    await page.locator('#authIdentifier').fill('teste-atualizacao');
    await page.locator('#authPassword').fill('senha-local-123');
    await publish(page, 4);
    await page.waitForFunction(() => window.testControllerChanged);
    await page.waitForTimeout(1200);
    assert.equal(await page.evaluate(() => window.testRelease), 3);
    assert.equal(await page.locator('#authPassword').inputValue(), 'senha-local-123');
    await page.locator('#btnAuthSubmit').click();
    await waitForRelease(page, 4);
    assert.equal(await page.evaluate(() => FF_Finance.balanceSummary().total), 980);
    console.log('OK Formulário de acesso preenchido é preservado até concluir o login.');

    release = 5;
    failDownload = true;
    const failed = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      const outcome = new Promise((resolve) => {
        registration.addEventListener(
          'updatefound',
          () => {
            const worker = registration.installing;
            worker.addEventListener('statechange', () => {
              if (worker.state === 'redundant') {
                resolve('failed');
              }
              if (worker.state === 'activated') {
                resolve('activated');
              }
            });
          },
          { once: true },
        );
      });
      await registration.update();
      return outcome;
    });
    assert.equal(failed, 'failed');
    assert.equal(await page.evaluate(() => window.testRelease), 4);
    await context.setOffline(true);
    await page.reload();
    await waitForRelease(page, 4);
    assert.equal(await page.evaluate(() => FF_Finance.balanceSummary().total), 980);
    assert.deepEqual(errors, []);
    console.log(
      'OK Download incompleto conserva a versão funcional, inclusive ao reabrir offline.',
    );
  } finally {
    await browser.close();
  }
}

test()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => server.close());
