/**
 * Diálogos do sistema, no lugar de alert() e confirm() do navegador.
 *   await zirimDialog.notify('mensagem', { title, tone: 'info' | 'success' | 'warning' | 'danger' })
 *   const ok = await zirimDialog.confirm('mensagem', { title, tone, confirmLabel, cancelLabel })
 * Ambos retornam Promises: quem precisa agir depois (ex.: recarregar a página) usa `await`.
 */
(() => {
  const TONES = ['info', 'success', 'warning', 'danger'];

  const DEFAULT_TITLE = {
    info: 'Aviso',
    success: 'Tudo certo',
    warning: 'Atenção',
    danger: 'Confirme a ação',
  };

  const ICON = {
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.5h.01"/>',
    success: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.3 2.3 4.7-5"/>',
    warning: '<path d="M12 4 2.5 19.5h19L12 4z"/><path d="M12 10v4"/><path d="M12 16.8h.01"/>',
    danger: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
  };

  let current = null;

  const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
  };

  function open({ mode, message, title, tone, confirmLabel, cancelLabel }) {
    current?.finish(false);

    const safeTone = TONES.includes(tone) ? tone : 'info';
    const isConfirm = mode === 'confirm';
    const previousFocus = document.activeElement;

    return new Promise((resolve) => {
      const backdrop = document.createElement('div');
      backdrop.className = 'zdlg-backdrop';
      backdrop.innerHTML = `
        <div class="zdlg zdlg--${safeTone}" role="${isConfirm ? 'alertdialog' : 'dialog'}" aria-modal="true" aria-labelledby="zdlg-title" aria-describedby="zdlg-message">
          <div class="zdlg-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[safeTone]}</svg>
          </div>
          <h3 class="zdlg-title" id="zdlg-title">${escapeHtml(title || DEFAULT_TITLE[safeTone])}</h3>
          <p class="zdlg-message" id="zdlg-message">${escapeHtml(message)}</p>
          <div class="zdlg-actions">
            ${isConfirm ? `<button type="button" class="zdlg-btn zdlg-btn--ghost" data-zdlg="cancel">${escapeHtml(cancelLabel || 'Cancelar')}</button>` : ''}
            <button type="button" class="zdlg-btn zdlg-btn--primary" data-zdlg="ok">${escapeHtml(confirmLabel || (isConfirm ? 'Confirmar' : 'Entendi'))}</button>
          </div>
        </div>`;
      document.body.appendChild(backdrop);

      const buttons = [...backdrop.querySelectorAll('button')];

      const finish = (result) => {
        if (current?.finish === finish) current = null;
        document.removeEventListener('keydown', onKeydown, true);
        backdrop.remove();
        if (previousFocus instanceof HTMLElement && document.contains(previousFocus)) previousFocus.focus();
        resolve(result);
      };

      const onKeydown = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          finish(!isConfirm);
        } else if (event.key === 'Tab') {
          // Mantém o foco dentro do diálogo enquanto ele estiver aberto.
          event.preventDefault();
          const index = buttons.indexOf(document.activeElement);
          const next = event.shiftKey
            ? (index <= 0 ? buttons.length - 1 : index - 1)
            : (index + 1) % buttons.length;
          buttons[next].focus();
        }
      };

      backdrop.addEventListener('click', (event) => {
        const button = event.target.closest('[data-zdlg]');
        if (button) finish(button.dataset.zdlg === 'ok');
        else if (event.target === backdrop) finish(!isConfirm);
      });
      document.addEventListener('keydown', onKeydown, true);

      current = { finish };

      // Em confirmação perigosa, o foco começa em "Cancelar" para evitar Enter acidental.
      const focusTarget = isConfirm && safeTone === 'danger'
        ? backdrop.querySelector('[data-zdlg="cancel"]')
        : backdrop.querySelector('[data-zdlg="ok"]');
      focusTarget?.focus();
    });
  }

  window.zirimDialog = {
    notify: (message, options = {}) => open({ ...options, mode: 'alert', message }),
    confirm: (message, options = {}) => open({ ...options, mode: 'confirm', message, tone: options.tone || 'warning' }),
  };
})();
