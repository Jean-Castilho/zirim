/**
 * Script da página auth/verify-contact.ejs (migrado do <script> inline da View).
 */
(() => {
    (() => {
      const contactType = document.querySelector('.verify-contact-container')?.dataset.contactType || 'email';
      const contactInput = document.getElementById('verify-contact-value');
      const requestButton = document.getElementById('request-contact-otp');
      const codeArea = document.getElementById('verify-contact-code-area');
      const codeInput = document.getElementById('verify-contact-code');
      const confirmButton = document.getElementById('confirm-contact-otp');
      const message = document.getElementById('verify-contact-message');
      const csrfToken = document.getElementById('verify-contact-csrf').value;
      const phoneInput = contactType === 'phone'
        ? window.intlTelInput(contactInput, {
            initialCountry: 'br',
            separateDialCode: true,
            strictMode: true,
            formatOnDisplay: true,
            utilsScript: 'https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/23.0.10/js/utils.js',
          })
        : null;
      let pendingPhone = '';

      const post = async (url, data) => {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
            'x-csrf-token': csrfToken,
          },
          body: new URLSearchParams(data).toString(),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Não foi possível concluir a solicitação.');
        return result;
      };

      requestButton.addEventListener('click', async () => {
        requestButton.disabled = true;
        message.textContent = 'Enviando código...';
        try {
          let endpoint = '/email/send-otp';
          let payload = {};
          if (contactType === 'phone') {
            if (!phoneInput.isValidNumber()) throw new Error('Informe um número de telefone válido.');
            pendingPhone = phoneInput.getNumber();
            endpoint = '/phone/send-otp';
            payload = { phone: pendingPhone };
          }

          const result = await post(endpoint, payload);
          message.textContent = result.message;
          contactInput.disabled = contactType === 'phone';
          codeArea.hidden = false;
          requestButton.textContent = 'Reenviar código';
          codeInput.focus();
        } catch (error) {
          message.textContent = error.message;
        } finally {
          requestButton.disabled = false;
        }
      });

      confirmButton.addEventListener('click', async () => {
        confirmButton.disabled = true;
        message.textContent = 'Validando código...';
        try {
          const endpoint = contactType === 'phone' ? '/phone/verify-otp' : '/verify-otp';
          const payload = contactType === 'phone'
            ? { phone: pendingPhone, otp: codeInput.value.trim() }
            : { email: contactInput.value.trim(), otp: codeInput.value.trim() };
          const result = await post(endpoint, payload);
          message.textContent = result.message;
          window.location.assign('/profile');
        } catch (error) {
          message.textContent = error.message;
        } finally {
          confirmButton.disabled = false;
        }
      });
    })();
})();
