#!/usr/bin/env sh
# Recria o índice do Git com os nomes exatos dos arquivos atuais.
# Remove do repositório arquivos antigos/renomeados (inclusive só por maiúscula/minúscula).
# Uso (na raiz do projeto): sh scripts/limpar-git.sh
set -e
git config core.ignorecase false
git rm -r -q --cached .
git add -A
git status --short
echo "Revise acima e finalize com: git commit -m \"refactor: padroniza nomenclatura\" && git push"
