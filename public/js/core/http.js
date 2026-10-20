/**
 * Cliente HTTP das telas de entrega (compartilhado).
 *  - postJson(url, body): POST JSON com CSRF. Sessão expirada vira mensagem clara
 *    (em vez de "Unexpected token '<'") e o erro carrega code = 'SESSION_EXPIRED'.
 *  - withBusy(button, label, task): impede envio duplicado (botão desabilitado durante a operação).
 *  - reportError(error): mostra o erro no diálogo do sistema; sessão expirada leva ao login.
 */
(() => {
  const SESSION_EXPIRED = 'SESSION_EXPIRED';

  const csrfHeader = () => {
    const token = document.getElementById('csrf-token')?.value;
    return token ? { 'x-csrf-token': token } : {};
  };

  const sessionError = () => {
    const error = new Error('Sua sessão expirou. Entre novamente para continuar.');
    error.code = SESSION_EXPIRED;
    return error;
  };

  async function postJson(url, body = {}) {
    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...csrfHeader() },
        body: JSON.stringify(body),
        credentials: 'same-origin',
      });
    } catch {
      throw new Error('Sem conexão com o servidor. Verifique sua internet e tente novamente.');
    }

    // Sessão expirada: o servidor redireciona para o login (HTML) ou responde 401.
    if (response.redirected || response.status === 401) throw sessionError();

    const isJson = (response.headers.get('content-type') || '').includes('application/json');
    if (!isJson) {
      throw new Error(`Erro inesperado do servidor (${response.status}). Recarregue a página e tente de novo.`);
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) {
      const error = new Error(data.error || data.message || 'Não foi possível concluir a operação.');
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async function withBusy(button, busyLabel, task) {
    if (!button) return task();
    if (button.dataset.busy === 'true') return undefined;

    const original = button.innerHTML;
    button.dataset.busy = 'true';
    button.disabled = true;
    if (busyLabel) button.textContent = busyLabel;

    try {
      return await task();
    } finally {
      delete button.dataset.busy;
      button.disabled = false;
      button.innerHTML = original;
      window.lucide?.createIcons();
    }
  }

  function reportError(error) {
    if (error?.code === SESSION_EXPIRED) {
      return window.zirimDialog
        .notify(error.message, { title: 'Sessão expirada', tone: 'warning', confirmLabel: 'Entrar novamente' })
        .then(() => { window.location.href = '/login'; });
    }
    return window.zirimDialog.notify(error?.message || 'Erro inesperado.', {
      title: 'Não foi possível concluir',
      tone: 'danger',
    });
  }

  window.zirimHttp = { postJson, withBusy, reportError, SESSION_EXPIRED };
})();
