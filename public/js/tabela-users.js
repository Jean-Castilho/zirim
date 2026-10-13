/**
 * Script da página admin/users/tabela-users.ejs (migrado do <script> inline da View).
 */
(() => {
    const modalEl = document.getElementById('edit-user-modal');
    const btnSave = document.getElementById('btn-save-user');
    const editPhoneInput = document.getElementById('edit-user-phone');

    const itiEdit = window.intlTelInput ? window.intlTelInput(editPhoneInput, {
      initialCountry: "br",
      separateDialCode: true,
      strictMode: true,
      autoPlaceholder: "polite",
      formatOnDisplay: true,
      utilsScript: "https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/23.0.10/js/utils.js",
    }) : null;

    editPhoneInput.addEventListener('blur', () => {
      if (window.intlTelInputUtils && editPhoneInput.value.trim() && itiEdit) {
        const formatted = itiEdit.getNumber(window.intlTelInputUtils.numberFormat.NATIONAL);
        if (formatted) editPhoneInput.value = formatted;
      }
    });
    editPhoneInput.addEventListener('countrychange', () => {
      editPhoneInput.value = '';
    });

    function openEditUserModal(userId) {
      const row = document.getElementById(`user-row-${userId}`);
      if (!row) return;

      document.getElementById('edit-user-id').value = userId;
      document.getElementById('edit-user-name').value = row.dataset.name || '';
      document.getElementById('edit-user-email').value = row.dataset.email || '';

      const currentPhone = row.dataset.phone || '';
      if (itiEdit) {
        itiEdit.setNumber(currentPhone);
      } else {
        editPhoneInput.value = currentPhone;
      }
      document.getElementById('edit-user-role').value = row.dataset.role || 'user';
      document.getElementById('edit-user-status').value = row.dataset.active === 'true' ? 'true' : 'false';

      modalEl.style.display = 'flex';
      document.getElementById('edit-user-name').focus();
    }

    function closeEditUserModal() {
      modalEl.style.display = 'none';
    }

    modalEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeEditUserModal();
    });

    async function handleEditUserSubmit(e) {
      e.preventDefault();
      const userId = document.getElementById('edit-user-id').value;
      const name = document.getElementById('edit-user-name').value.trim();
      let phone = editPhoneInput.value.trim();
      const role = document.getElementById('edit-user-role').value;
      const isActive = document.getElementById('edit-user-status').value === 'true';

      if (itiEdit && phone) {
        if (!itiEdit.isValidNumber()) {
          const errorMsg = 'Por favor, insira um número de telefone válido.';
          if (typeof showNotification === 'function') {
            showNotification(errorMsg, 'error');
          } else {
            alert(errorMsg);
          }
          return;
        }
        phone = itiEdit.getNumber();
      }

      btnSave.disabled = true;
      btnSave.textContent = 'Salvando...';

      const csrfToken = document.getElementById('csrf-token')?.value;
      const headers = { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      };
      if (csrfToken) headers['x-csrf-token'] = csrfToken;

      try {
        const response = await fetch(`/users/edit/${userId}`, {
          method: 'post',
          headers,
          body: JSON.stringify({ name, phone, role, isActive })
        });

        const isJson = response.headers.get('content-type')?.includes('application/json');
        const data = isJson ? await response.json() : null;

        if (!response.ok) {
          const errorMsg = data?.error || data?.message || (
            response.status === 401 ? 'Sessão expirada. Faça login novamente.' :
            response.status === 403 ? 'Permissão negada para editar usuários.' :
            `Erro ao processar requisição (Status: ${response.status})`
          );
          throw new Error(errorMsg);
        }

        if (data?.error) {
          throw new Error(data.error || data.message || 'Falha ao atualizar usuário.');
        }

        // Atualiza linha na tabela sem recarregar a página
        const row = document.getElementById(`user-row-${userId}`);
        if (row) {
          row.dataset.name = name;
          row.dataset.phone = phone;
          row.dataset.role = role;
          row.dataset.active = String(isActive);

          row.querySelector('.col-name').textContent = name;
          row.querySelector('.col-phone').textContent = phone || 'N/A';
          row.querySelector('.col-role').innerHTML = `<span class="role-badge">${role}</span>`;
          row.querySelector('.col-status').innerHTML = `
            <span class="status-badge ${isActive ? 'status-active' : 'status-inactive'}">
              ${isActive ? 'Ativo' : 'Inativo'}
            </span>
          `;
        }

        closeEditUserModal();
        if (typeof showNotification === 'function') {
          showNotification('Usuário atualizado com sucesso!', 'success');
        } else if (typeof notificationShow === 'function') {
          notificationShow('Usuário atualizado com sucesso!', 'sucesso');
        } else if (typeof window.notificationShow === 'function') {
          window.notificationShow('Usuário atualizado com sucesso!', 'sucesso');
        }
      } catch (err) {
        const errorMessage = err.message || 'Erro ao atualizar usuário.';
        if (typeof showNotification === 'function') {
          showNotification(errorMessage, 'error');
        } else if (typeof notificationShow === 'function') {
          notificationShow(errorMessage, 'erro');
        } else if (typeof window.notificationShow === 'function') {
          window.notificationShow(errorMessage, 'erro');
        }
      } finally {
        btnSave.disabled = false;
        btnSave.textContent = 'Salvar Alterações';
      }
    }

    // ---- Eventos (substituem os handlers inline on* da View) ----
    document.querySelectorAll('[data-action="edit-user"]').forEach((button) => {
      button.addEventListener('click', () => openEditUserModal(button.dataset.userId));
    });
    document.querySelectorAll('[data-action="close-edit-user"]').forEach((button) => {
      button.addEventListener('click', closeEditUserModal);
    });
    modalEl.addEventListener('click', (event) => {
      if (event.target === modalEl) closeEditUserModal();
    });
    document.getElementById('form-edit-user').addEventListener('submit', handleEditUserSubmit);
})();
