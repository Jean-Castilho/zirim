/**
 * Script da página admin/edit-home.ejs (migrado do <script> inline da View).
 */
(() => {
      const initializeHomeEditor = () => {
          if (!document.getElementById('bannerTitle')) return;
          const bannerTitleInput = document.getElementById('bannerTitle');
          const bannerDescriptionInput = document.getElementById('bannerDescription');
          const bannerExibirBotaoInput = document.getElementById('bannerExibirBotao');
          const bannerButtonTextInput = document.getElementById('bannerButtonText');
          const bannerImageInput = document.getElementById('bannerImage');

          const previewTitle = document.getElementById('previewTitle');
          const previewDescription = document.getElementById('previewDescription');
          const previewButton = document.getElementById('previewButton');
          const bannerHeroPreview = document.getElementById('bannerHeroPreview');
          if (bannerHeroPreview?.dataset.bgImage) {
              bannerHeroPreview.style.backgroundImage = `url('${bannerHeroPreview.dataset.bgImage}')`;
          }
          const noImageWarning = document.getElementById('noImageWarning');

          // Listener para atualização instantânea de títulos no design real
          if (bannerTitleInput && previewTitle) {
              bannerTitleInput.addEventListener('input', (e) => {
                  previewTitle.textContent = e.target.value.trim() || '';
              });
          }

          // Listener para atualização instantânea de descrições no design real
          if (bannerDescriptionInput && previewDescription) {
              bannerDescriptionInput.addEventListener('input', (e) => {
                  previewDescription.textContent = e.target.value.trim() || '';
              });
          }

          // Alterna visibilidade do botão no preview ao marcar/desmarcar o checkbox
          if (bannerExibirBotaoInput && previewButton) {
              bannerExibirBotaoInput.addEventListener('change', (e) => {
                  previewButton.style.display = e.target.checked ? 'inline-flex' : 'none';
              });
          }

          // Listener para atualização instantânea do texto do botão
          if (bannerButtonTextInput && previewButton) {
              bannerButtonTextInput.addEventListener('input', (e) => {
                  previewButton.textContent = e.target.value.trim() || 'Ver Coleção';
              });
          }

          if (bannerImageInput && bannerHeroPreview) {
              bannerImageInput.addEventListener('change', function (event) {
                  const file = event.target.files[0];
                  if (file) {
                      const reader = new FileReader();
                      reader.onload = function (e) {
                          bannerHeroPreview.style.backgroundImage = `url('${e.target.result}')`;
                          bannerHeroPreview.classList.remove('no-image');
                          if (noImageWarning) noImageWarning.style.display = 'none';
                      };
                      reader.readAsDataURL(file);
                  } else {
                      bannerHeroPreview.style.backgroundImage = '';
                      bannerHeroPreview.classList.add('no-image');
                      if (noImageWarning) noImageWarning.style.display = 'flex';
                  }
              });
          }

          // Interatividade e Live Preview para o Banner de Categoria
          const categoryTitleInput = document.getElementById('categoryTitle');
          const categoryPreviewTitle = document.getElementById('categoryPreviewTitle');
          const categoryLinkInput = document.getElementById('categoryLink');
          const categoryPreviewLinkBtn = document.getElementById('categoryPreviewLinkBtn');
          const categoryImageInput = document.getElementById('categoryImage');
          const categoryPreviewImg = document.getElementById('categoryPreviewImg');
          const noCategoryImageWarning = document.getElementById('noCategoryImageWarning');
          const defaultCategoryPlaceholder = 'https://images.unsplash.com/photo-1460353581641-37baddab0fa2?auto=format&fit=crop&w=400&q=80';

          if (categoryTitleInput && categoryPreviewTitle) {
              categoryTitleInput.addEventListener('input', (e) => {
                  categoryPreviewTitle.textContent = e.target.value.trim() || 'Nome da Categoria';
              });
          }

          if (categoryLinkInput && categoryPreviewLinkBtn) {
              categoryLinkInput.addEventListener('input', (e) => {
                  const linkVal = e.target.value.trim();
                  categoryPreviewLinkBtn.setAttribute('title', linkVal ? `Destino: ${linkVal}` : 'Explorar');
              });
          }

          if (categoryImageInput && categoryPreviewImg) {
              categoryImageInput.addEventListener('change', function (event) {
                  const file = event.target.files[0];
                  if (file) {
                      const reader = new FileReader();
                      reader.onload = function (e) {
                          categoryPreviewImg.src = e.target.result;
                          if (noCategoryImageWarning) noCategoryImageWarning.style.display = 'none';
                      };
                      reader.readAsDataURL(file);
                  } else {
                      categoryPreviewImg.src = defaultCategoryPlaceholder;
                      if (noCategoryImageWarning) noCategoryImageWarning.style.display = 'flex';
                  }
              });
          }

          // Integração com evento HX-Trigger para executar showNotification padrão
          document.body.addEventListener('showNotification', function (e) {
              const data = e.detail?.value || e.detail;
              if (typeof showNotification === 'function' && data) {
                  showNotification(data.message || data, data.type || 'success');
              }
              // Limpa o arquivo e campos após persistência concluída
              if (bannerImageInput) {
                  bannerImageInput.value = '';
              }
              if (categoryImageInput) {
                  categoryImageInput.value = '';
              }
              if (categoryTitleInput) {
                  categoryTitleInput.value = '';
              }
              if (categoryLinkInput) {
                  categoryLinkInput.value = '';
              }
              if (categoryPreviewTitle) {
                  categoryPreviewTitle.textContent = 'Nome da Categoria';
              }
              if (categoryPreviewImg) {
                  categoryPreviewImg.src = defaultCategoryPlaceholder;
              }
              if (noCategoryImageWarning) {
                  noCategoryImageWarning.style.display = 'flex';
              }
          });

          // Fallback resiliente: impede recarregamento mesmo se o HTMX não estiver ativo
          const formUpdateBanner = document.getElementById('formUpdateBanner');
          if (formUpdateBanner) {
              formUpdateBanner.addEventListener('submit', async function (e) {
                  if (window.htmx) return; // HTMX gerencia a requisição se estiver disponível

                  e.preventDefault();
                  const submitBtn = formUpdateBanner.querySelector('.btn-submit');
                  const spinner = submitBtn?.querySelector('.btn-spinner');
                  if (submitBtn) {
                      submitBtn.disabled = true;
                      if (spinner) spinner.style.display = 'inline-block';
                  }

                  try {
                      const formData = new FormData(formUpdateBanner);
                      const response = await fetch('/updateBannerHome', {
                          method: 'POST',
                          headers: { 'HX-Request': 'true' },
                          body: formData
                      });

                      if (response.ok) {
                          if (typeof showNotification === 'function') {
                              showNotification('Banner principal atualizado com sucesso!', 'success');
                              if (bannerImageInput) {
                                  bannerImageInput.value = '';
                              }
                          }
                      } else {
                          const errData = await response.json().catch(() => ({}));
                          const errMsg = errData.message || errData.error || 'Erro ao atualizar o banner.';
                          if (typeof showNotification === 'function') {
                              showNotification(errMsg, 'error');
                          }
                      }
                  } catch (err) {
                      console.error('Erro na requisição do banner:', err);
                  } finally {
                      if (submitBtn) {
                          submitBtn.disabled = false;
                          if (spinner) spinner.style.display = '';
                      }
                  }
              });
          }

          // Fallback resiliente para o formulário de categoria
          const formUpdateCategory = document.getElementById('formUpdateCategory');
          if (formUpdateCategory) {
              formUpdateCategory.addEventListener('submit', async function (e) {
                  if (window.htmx) return; // HTMX gerencia a requisição se estiver disponível

                  e.preventDefault();
                  const submitBtn = formUpdateCategory.querySelector('.btn-submit');
                  const spinner = submitBtn?.querySelector('.btn-spinner');
                  if (submitBtn) {
                      submitBtn.disabled = true;
                      if (spinner) spinner.style.display = 'inline-block';
                  }

                  try {
                      const formData = new FormData(formUpdateCategory);
                      const response = await fetch('/updateCategoryHome', {
                          method: 'POST',
                          headers: { 'HX-Request': 'true' },
                          body: formData
                      });

                      if (response.ok) {
                          if (typeof showNotification === 'function') {
                              showNotification('Categoria adicionada com sucesso!', 'success');
                          }
                          window.location.reload();
                      } else {
                          const errData = await response.json().catch(() => ({}));
                          const errMsg = errData.message || errData.error || 'Erro ao adicionar a categoria.';
                          if (typeof showNotification === 'function') {
                              showNotification(errMsg, 'error');
                          }
                      }
                  } catch (err) {
                      console.error('Erro na requisição da categoria:', err);
                  } finally {
                      if (submitBtn) {
                          submitBtn.disabled = false;
                          if (spinner) spinner.style.display = '';
                      }
                  }
              });
          }

          // Captura erros de resposta HTTP vindos do HTMX sem recarregar a tela
          document.body.addEventListener('htmx:responseError', function (event) {
              if (typeof showNotification === 'function') {
                  showNotification('Falha ao processar a requisição. Verifique os dados.', 'error');
              }
          });
      };

      window.onPageReady(initializeHomeEditor);
})();
