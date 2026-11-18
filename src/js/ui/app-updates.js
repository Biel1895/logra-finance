import { state } from '../state/store.js';

function initAppUpdates(registration, previousController) {
  const section = document.getElementById('appUpdateSettings');
  const button = document.getElementById('btnCheckAppUpdate');
  const status = document.getElementById('appUpdateStatus');
  const dirtyForms = new WeakSet();
  let controller = navigator.serviceWorker.controller;
  let pending = Boolean(previousController && controller !== previousController);
  let checking = null;
  let retry = null;
  let reloading = false;

  function message(text) {
    if (status) {
      status.textContent = text;
      status.hidden = !text;
    }
  }

  function editing() {
    const boot = document.getElementById('bootMessage');
    if (
      (boot && !boot.hidden) ||
      state.busy ||
      state.syncBusy ||
      state.isSubmittingCommand ||
      state.isRecording ||
      document.querySelector('dialog[open], #toastAction')
    ) {
      return true;
    }
    return [...document.forms].some(
      (form) =>
        form.getClientRects().length > 0 &&
        (dirtyForms.has(form) ||
          form.id === 'resetPasswordForm' ||
          form.querySelector('button[type="submit"]:disabled, input[type="submit"]:disabled')),
    );
  }

  function applyWhenReady() {
    clearTimeout(retry);
    if (!pending || reloading || document.hidden || !navigator.onLine) {
      return;
    }
    if (editing()) {
      message('Atualização pronta. Ela será aplicada ao concluir a edição e fechar esta janela.');
      retry = setTimeout(applyWhenReady, 1000);
      return;
    }
    reloading = true;
    location.reload();
  }

  async function check(manual = false) {
    if (!navigator.onLine) {
      if (manual) {
        message('Conecte-se à internet para buscar uma atualização.');
      }
      return;
    }
    if (checking || document.hidden) {
      return;
    }
    if (manual) {
      message('Buscando atualização…');
    }
    if (button) {
      button.disabled = true;
    }
    checking = registration
      .update()
      .then(() => {
        if (pending) {
          applyWhenReady();
        } else if (manual) {
          message(
            registration.installing
              ? 'Baixando a nova versão…'
              : 'Você está usando a versão mais recente.',
          );
        }
      })
      .catch((error) => {
        if (manual) {
          message('Não foi possível buscar a atualização. Confira a conexão e tente novamente.');
        }
        console.warn('Verificação de atualização adiada:', error);
      })
      .finally(() => {
        checking = null;
        if (button) {
          button.disabled = false;
        }
      });
    await checking;
  }

  for (const event of ['input', 'change']) {
    document.addEventListener(event, ({ target }) => {
      const form = target.closest('form');
      if (form) {
        dirtyForms.add(form);
      }
    });
  }
  document.addEventListener('reset', ({ target }) => dirtyForms.delete(target), true);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    const next = navigator.serviceWorker.controller;
    pending ||= Boolean(controller && next !== controller);
    controller = next;
    applyWhenReady();
  });
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'redundant' && !pending) {
        message('O download da atualização foi adiado. Tentaremos novamente.');
      }
    });
  });

  function foreground() {
    if (!document.hidden) {
      applyWhenReady();
      void check();
    }
  }

  document.addEventListener('visibilitychange', foreground);
  window.addEventListener('focus', foreground);
  window.addEventListener('pageshow', foreground);
  window.addEventListener('online', foreground);
  setInterval(foreground, 60_000);
  button?.addEventListener('click', () => void check(true));
  if (section) {
    section.hidden = false;
  }
  applyWhenReady();
  void check();
}

export { initAppUpdates };
