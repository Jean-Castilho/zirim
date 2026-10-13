/**
 * Script da página auth/reset-password.ejs (migrado do <script> inline da View).
 */
(() => {
      const forgotPasswordForm = document.getElementById('forgot-password-form');
      forgotPasswordForm?.addEventListener('submit', async (event) => {
          event.preventDefault();
          const button = forgotPasswordForm.querySelector('button[type="submit"]');
          button.disabled = true;
          try {
              const response = await fetch(forgotPasswordForm.action, {
                  method: 'POST',
                  body: new URLSearchParams(new FormData(forgotPasswordForm)),
                  headers: { 'Accept': 'application/json' }
              });
              const result = await response.json();
              const feedback = document.getElementById('feedback-msg');
              feedback.textContent = result.message || 'Não foi possível enviar a solicitação.';
              feedback.classList.toggle('text-green-400', response.ok);
              feedback.classList.toggle('text-red-400', !response.ok);
          } catch {
              document.getElementById('feedback-msg').textContent = 'Não foi possível enviar a solicitação. Tente novamente.';
          } finally {
              button.disabled = false;
          }
      });

      const newPasswordForm = document.getElementById('new-password-form');
      newPasswordForm?.addEventListener('submit', async (event) => {
          event.preventDefault();
          const feedback = document.getElementById('feedback-msg');
          const button = newPasswordForm.querySelector('button[type="submit"]');
          const formData = new URLSearchParams(new FormData(newPasswordForm));
          button.disabled = true;
          try {
              const response = await fetch(newPasswordForm.action, {
                  method: 'POST',
                  body: formData,
                  headers: { 'Accept': 'application/json' }
              });
              const result = await response.json();
              feedback.textContent = result.message || 'Não foi possível redefinir a senha.';
              if (response.ok) setTimeout(() => window.location.assign(result.redirect), 1000);
          } catch {
              feedback.textContent = 'Não foi possível redefinir a senha. Tente novamente.';
          } finally {
              button.disabled = false;
          }
      });
})();
