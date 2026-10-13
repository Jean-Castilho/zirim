/**
 * Script da página admin/inventory/edit-product.ejs (migrado do <script> inline da View).
 */
(() => {
    let variationIndex = 0;

    const escapeAttr = (value) => String(value ?? '')
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');


    function addVariationBlock(data = {}) {
      const container = document.getElementById('variations-container');
      const variationBlock = document.createElement('div');
      variationBlock.classList.add('variation-card');
      variationBlock.dataset.index = variationIndex;

      variationBlock.innerHTML = `
        <div class="variation-header">
          <h4>Variação #${variationIndex + 1}</h4>
          <button type="button" class="btn-danger" data-action="remove-variation">Remover</button>
        </div>
        <div class="variation-fields">
          <div class="form-group">
            <label>Cores</label>
            <input type="text" name="variacoes[${variationIndex}][cores]" class="form-control" value="${escapeAttr((data.cores || []).join(', '))}" placeholder="Ex: Preto, Azul">
          </div>
          <div class="form-group">
            <label>SKU</label>
            <input type="text" name="variacoes[${variationIndex}][sku]" class="form-control" value="${escapeAttr(data.sku)}">
          </div>
          <div class="form-group">
            <label>Tamanhos</label>
            <input type="text" name="variacoes[${variationIndex}][tamanhos]" class="form-control" value="${escapeAttr((data.tamanhos || []).join(', '))}" placeholder="Ex: P, M, G">
          </div>
        </div>
        <div class="variation-fields variation-fields--two">
          <div class="form-group">
            <label>Preço (R$) *</label>
            <input type="number" step="0.01" name="variacoes[${variationIndex}][preco]" class="form-control" value="${escapeAttr(data.preco)}" required>
          </div>
          <div class="form-group">
            <label>Estoque *</label>
            <input type="number" name="variacoes[${variationIndex}][estoque]" class="form-control" value="${escapeAttr(data.estoque)}" required>
          </div>
        </div>
        <div class="form-group">
          <label>Imagens</label>
          <div class="image-upload-zone" data-action="pick-images">
            <span>Clique para selecionar novas imagens (substituirá as atuais se enviado)</span>
            <input type="file" id="file_${variationIndex}" name="variacoes[${variationIndex}][imagens]" multiple hidden data-variation-index="${variationIndex}">
          </div>
          <div id="preview-${variationIndex}" class="image-preview-container">
            ${(data.imagens || []).map(img => `<img src="/image/${encodeURIComponent(img)}" class="image-preview-item" alt="">`).join('')}
          </div>
        </div>
        <div class="form-group">
          <label><input type="checkbox" name="variacoes[${variationIndex}][ativo]" value="true" ${data.ativo !== false ? 'checked' : ''}> Ativo</label>
        </div>
      `;
      container.appendChild(variationBlock);
      variationIndex++;
    }

    function removeVariationBlock(button) {
      button.closest('.variation-card').remove();
      updateVariationIndexes();
    }

    function updateVariationIndexes() {
      const blocks = document.querySelectorAll('.variation-card');
      blocks.forEach((block, idx) => {
        block.dataset.index = idx;
        block.querySelector('h4').textContent = `Variação #${idx + 1}`;
        block.querySelectorAll('[name^="variacoes["]').forEach(input => {
          const property = input.name.match(/\[(\w+)\]$/)[1];
          input.name = `variacoes[${idx}][${property}]`;
        });
      });
      variationIndex = blocks.length;
    }

    function previewImages(input) {
      const container = input.closest('.variation-card')?.querySelector('.image-preview-container');
      if (!container) return;
      container.innerHTML = '';
      Array.from(input.files).forEach(file => {
        const reader = new FileReader();
        reader.onload = e => {
          const img = document.createElement('img');
          img.src = e.target.result;
          img.className = 'image-preview-item';
          container.appendChild(img);
        };
        reader.readAsDataURL(file);
      });
    }

    const initializeEditProductPage = () => {
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
        if (event.target.matches('input[type="file"]')) {
          previewImages(event.target);
        }
      });

      const initialData = JSON.parse(container.dataset.initial || '[]');
      if (initialData.length > 0) {
        initialData.forEach(v => addVariationBlock(v));
      } else {
        addVariationBlock();
      }
      addVariationButton.addEventListener('click', () => addVariationBlock());
    };

    window.onPageReady(initializeEditProductPage);
})();
