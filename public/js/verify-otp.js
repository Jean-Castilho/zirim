/**
 * Script da página auth/verify-otp.ejs (migrado do <script> inline da View).
 */
(() => {
        document.getElementById('verifyOtpForm').addEventListener('submit', async function(e) {
          e.preventDefault();
        
          const form = e.target;
          const formData = new URLSearchParams(new FormData(form));
          try {
            const response = await fetch('/verify-otp', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
              },
              body: formData.toString()
            });
          
            const result = await response.json();
          
            if (response.ok) {
              window.showNotification?.(result.message || 'Email verificado!', 'success');
            
              setTimeout(() => {
                  window.location.href = result.redirect || '/login';
              }, 1000);
            } else {
              window.showNotification?.(result.message || 'Erro no código OTP', 'error');
            }
          } catch (error) {
            window.showNotification?.('Erro de conexão.', 'error');
          }
        });

    
})();
