/**
 * Página auth/login.ejs.
 * Login via fetch: a página só muda (navegação completa) quando o login é
 * efetuado com sucesso. Em qualquer falha o usuário permanece na tela, sem recarregar.
 */
(() => {
  const form = document.getElementById('loginForm');
  if (!form || form.dataset.bound) return;
  form.dataset.bound = 'true';

  const button = form.querySelector('.btn-primary');
  const passwordInput = form.querySelector('#password');
  const IDLE_LABEL = button?.textContent.trim() || 'Entrar';
  let submitting = false;

  const setLoading = (loading) => {
    submitting = loading;
    button.disabled = loading;
    button.textContent = loading ? 'Entrando...' : IDLE_LABEL;
  };

  const fail = (message) => {
    setLoading(false);
    if (passwordInput) {
      passwordInput.value = '';
      passwordInput.focus();
    }
    showNotification(message, 'error');
  };

  const parseJson = async (response) => {
    try {
      return await response.json();
    } catch {
      return null;
    }
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (submitting) return;

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        credentials: 'same-origin',
        body: new URLSearchParams(new FormData(form)).toString(),
      });

      const result = await parseJson(response);

      if (!response.ok || !result || result.success === false) {
        return fail(result?.message || 'E-mail ou senha inválidos.');
      }

      showNotification('Login realizado com sucesso!', 'success');
      const needsVerification = result.user?.email && !result.user.email.verified;
      const target = needsVerification ? '/verify-otp' : '/profile';
      // Mantém o botão bloqueado até a navegação para evitar envio duplo
      window.setTimeout(() => window.location.assign(target), 400);
    } catch (error) {
      console.error('Erro de rede:', error);
      fail('Erro de conexão ao tentar fazer login.');
    }
  });
})();
