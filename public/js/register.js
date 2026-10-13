/**
 * Script da página auth/register.ejs (migrado do <script> inline da View).
 */
(() => {
        // Inicialização do intl-tel-input
        const phoneInput = document.querySelector("#phone");
        const iti = window.intlTelInput(phoneInput, {
          initialCountry: "br",
          separateDialCode: true,
          strictMode: true,
          autoPlaceholder: "polite",
          formatOnDisplay: true,
          utilsScript: "https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/23.0.10/js/utils.js",
        });

        // Formata automaticamente o número para o padrão nacional do país selecionado
        phoneInput.addEventListener('blur', () => {
          if (window.intlTelInputUtils && phoneInput.value.trim()) {
            const formatted = iti.getNumber(window.intlTelInputUtils.numberFormat.NATIONAL);
            if (formatted) phoneInput.value = formatted;
          }
        });
        phoneInput.addEventListener('countrychange', () => {
          phoneInput.value = '';
        });

        document.getElementById('registerForm').addEventListener('submit', async function(e) {
          e.preventDefault();
        
          const form = e.target;
          const formData = new URLSearchParams(new FormData(form));

          // Validação e formatação do telefone
          if (!iti.isValidNumber()) {
            const errorMsg = 'Por favor, insira um número de telefone válido.';
            if (typeof showNotification === 'function') {
              showNotification(errorMsg, 'error');
            } else { alert(errorMsg); }
            return;
          }
          // Substitui o valor do telefone pelo formato internacional (ex: +55...)
          formData.set('phone', iti.getNumber());

          if (formData.get('password') !== formData.get('confirmPassword')) {
            if (typeof showNotification === 'function') {
              showNotification('As senhas não coincidem.', 'error');
            } else {
              alert('As senhas não coincidem.');
            }
            return;
          }
        
          try {
            const response = await fetch('/register', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
              },
              body: formData.toString()
            });
          
            const result = await response.json();
          
            if (response.ok) {
              if (typeof showNotification === 'function') {
                  showNotification('Registro realizado com sucesso!', 'success');
              } else {
                  alert('Registro realizado com sucesso!');
              }
              setTimeout(() => {
                  window.location.href = '/'; // Redireciona apenas em caso de sucesso absoluto
              }, 1000);
            } else {
              console.error('Erro no registro:', result);
              // NÃO redireciona e NÃO permite login implícito
              if (typeof showNotification === 'function') {
                  showNotification(result.message || 'Erro ao realizar registro', 'error');
              } else {
                  alert(result.message || 'Erro ao realizar registro');
              }
            }
          } catch (error) {
            console.error('Erro de rede:', error);
            if (typeof showNotification === 'function') {
                showNotification('Erro de conexão ao tentar fazer registro.', 'error');
            } else {
                alert('Erro de conexão ao tentar fazer registro.');
            }
          }
        });
    
})();
