/**
 * Script da página auth/login.ejs (migrado do <script> inline da View).
 */
(() => {
        document.getElementById('loginForm').addEventListener('submit', async function (e) {
          e.preventDefault();

          const form = e.target;
          const btn = form.querySelector('.btn-primary');
          const formData = new URLSearchParams(new FormData(form));

          btn.disabled = true;
          btn.innerHTML = 'Entrando...';

          try {
            const response = await fetch('/login', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
              },
              body: formData.toString()
            });

            const contentType = response.headers.get("content-type");
            let result = await response.json();

            if (response.ok) {
                showNotification('Login realizado com sucesso!', 'success');
            
              if (result.user && result.user.email && !result.user.email.verified) {
                window.location.href = '/verify-otp';
              } else {
                window.location.href = '/profile'; // Ou para a página inicial '/'
              }
            } else {
              btn.disabled = false;
              btn.innerHTML = 'Entrar';
              showNotification(result.message || 'Erro ao realizar login', 'error');
            }
          } catch (error) {
            console.error('Erro de rede:', error);
            showNotification('Erro de conexão ao tentar fazer login.', 'error');
          }
        });
    
})();
