/**
 * Script da página admin/inventory/add-product.ejs (migrado do <script> inline da View).
 */
(() => {
    let variationIndex = 0;

    const escapeAttr = (value) => String(value ?? '')
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');


    function addVariationBlock(sku = '', cores = '', tamanhos = '', preco = '', estoque = '', ativo = false) {
      const container = document.getElementById('variations-container');
      const variationBlock = document.createElement('div');
      variationBlock.classList.add('variation-block');
      variationBlock.dataset.index = variationIndex;

      variationBlock.innerHTML = `
        <div class="variation-header">
          <h4>Variação #${variationIndex + 1}</h4>
          <button type="button" class="btn btn-danger btn-remove-variation" data-action="remove-variation">Remover</button>
        </div>
        <div class="form-grid">
          <div class="form-group grid-group">
            <label for="variacoes[${variationIndex}][cores]" class="form-label">Cores Disponíveis</label>
            <input type="text" id="variacoes[${variationIndex}][cores]" name="variacoes[${variationIndex}][cores]" class="form-control" placeholder="Ex: Preto, Branco" value="${escapeAttr(cores)}">
            <small class="form-text-muted"></small>
          </div>

          <div class="form-group grid-group">
            <label for="variacoes[${variationIndex}][sku]" class="form-label">SKU</label>
            <input type="text" id="variacoes[${variationIndex}][sku]" name="variacoes[${variationIndex}][sku]" class="form-control" value="${escapeAttr(sku)}">
          </div>
        
          <div class="form-group grid-group">
            <label for="variacoes[${variationIndex}][tamanhos]" class="form-label">Tamanhos Disponíveis</label>
            <input type="text" id="variacoes[${variationIndex}][tamanhos]" name="variacoes[${variationIndex}][tamanhos]" class="form-control" placeholder="Ex: P, M, G" value="${escapeAttr(tamanhos)}">
            <small class="form-text-muted"></small>
          </div>
        </div>
        <div class="form-grid form-grid-spaced">
          <div class="form-group grid-group">
            <label for="variacoes[${variationIndex}][preco]" class="form-label">Preço (R$) *</label>
            <input type="number" id="variacoes[${variationIndex}][preco]" name="variacoes[${variationIndex}][preco]" step="0.01" min="0" required class="form-control" placeholder="0.00" value="${escapeAttr(preco)}">
          </div>
        
          <div class="form-group grid-group">
            <label for="variacoes[${variationIndex}][estoque]" class="form-label">Estoque Inicial *</label>
            <input type="number" id="variacoes[${variationIndex}][estoque]" name="variacoes[${variationIndex}][estoque]" min="0" required class="form-control" placeholder="0" value="${escapeAttr(estoque)}">
          </div>
        </div>
        <div class="form-group">

          <label class="form-label">Imagens da Variação (até 5)</label>
          <div class="image-upload-zone" data-action="pick-images">
            <div class="image-upload-icon">📸</div>
            <p class="image-upload-title">Clique para selecionar imagens</p>
            <p class="image-upload-subtitle">Até 5 imagens (JPG, PNG, WEBP)</p>
            <input type="file" id="variationImageFile_${variationIndex}" name="variacoes[${variationIndex}][imagens]" accept="image/*" multiple hidden data-variation-index="${variationIndex}">
          <div id="variation-image-preview-${variationIndex}" class="image-preview-container"></div>

            </div>
        </div>
        <div class="form-group grid-group checkbox-group">
          <input type="checkbox" id="variacoes[${variationIndex}][ativo]" name="variacoes[${variationIndex}][ativo]" value="true" ${ativo ? 'checked' : ''}>
          <label for="variacoes[${variationIndex}][ativo]" class="form-label">Ativo</label>
        </div>
        <hr>
      `;
      container.appendChild(variationBlock);
      variationIndex++;
      updateRemoveButtons();
    }

    function removeVariationBlock(button) {
      const blockToRemove = button.closest('.variation-block');
      blockToRemove.remove();
      updateVariationIndexes();
      updateRemoveButtons();
    }

    function updateVariationIndexes() {
      const variationBlocks = document.querySelectorAll('.variation-block');
      variationBlocks.forEach((block, newIndex) => {
        block.dataset.index = newIndex;
        block.querySelector('h4').textContent = `Variação #${newIndex + 1}`;

        // Atualiza name e id para variacoes
        block.querySelectorAll('[name^="variations["], [name^="variacoes["]').forEach(input => {
          const oldName = input.name;
          const propertyName = oldName.match(/\[(\w+)\]$/)[1];
          input.name = `variacoes[${newIndex}][${propertyName}]`;
          input.id = propertyName === 'imagens' ? `variationImageFile_${newIndex}` : `variacoes[${newIndex}][${propertyName}]`;

          // Se for o input de arquivo, atualiza o data-attribute
          if (propertyName === 'imagens') {
            input.dataset.variationIndex = newIndex;
          }
        });

        // Atualiza o id do container de preview
        const previewContainer = block.querySelector('.image-preview-container');
        if (previewContainer) {
          previewContainer.id = `variation-image-preview-${newIndex}`;
        }
      });
      variationIndex = variationBlocks.length;
    }

    function updateRemoveButtons() {
      const removeButtons = document.querySelectorAll('.btn-remove-variation');
      if (removeButtons.length === 1) {
        removeButtons[0].hidden = true;
      } else {
        removeButtons.forEach(btn => { btn.hidden = false; });
      }
    }

    function previewImages(input) {
      const varIndex = input.dataset.variationIndex;
      const previewContainer = document.getElementById(`variation-image-preview-${varIndex}`);

      previewContainer.innerHTML = '';

      if (input.files) {
        const filesToProcess = Array.from(input.files).slice(0, 5);

        if (input.files.length > 5) {
          alert("Você selecionou mais de 5 imagens. Apenas as 5 primeiras serão consideradas.");
        }

        filesToProcess.forEach((file) => {
          if (!file.type.startsWith('image/')) return;

          const reader = new FileReader();
          reader.onload = function (e) {
            const imgContainer = document.createElement('div');
            imgContainer.className = 'preview-image-wrapper';

            const img = document.createElement('img');
            img.src = e.target.result;
            img.className = 'preview-image';

            imgContainer.appendChild(img);
            previewContainer.appendChild(imgContainer);
          }
          reader.readAsDataURL(file);
        });
      }
    }

    const initializeAddProductPage = () => {
      const addVariationButton = document.getElementById('add-variation-btn');
      const container = document.getElementById('variations-container');
      if (!addVariationButton || !container) return;

      // Delegação de eventos (substitui os handlers inline gerados no template)
      container.addEventListener('click', (event) => {
        const remove = event.target.closest('[data-action="remove-variation"]');
        if (remove) return removeVariationBlock(remove);

        const zone = event.target.closest('[data-action="pick-images"]');
        if (zone && !event.target.matches('input[type="file"]')) {
          zone.querySelector('input[type="file"]')?.click();
        }
      });
      container.addEventListener('change', (event) => {
        if (event.target.matches('input[type="file"]')) previewImages(event.target);
      });

      addVariationButton.addEventListener('click', () => addVariationBlock());
      addVariationBlock(); // Adiciona bloco inicial
    };

    window.onPageReady(initializeAddProductPage);
})();
