#!/usr/bin/env bash
# Первая публикация сайта на GitHub Pages. Запуск: bash deploy.sh
# Требует: gh auth login (уже сделан). Повторный запуск безопасен.
set -euo pipefail
cd "$(dirname "$0")"

OWNER=$(gh api user -q .login)
REPO="godovshchina-site"

if ! gh repo view "$OWNER/$REPO" >/dev/null 2>&1; then
  gh repo create "$REPO" --public --description "Годовщина — страховка ипотеки без переплаты"
fi
git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$OWNER/$REPO.git"
git push -u origin main

# Включить Pages с ветки main (если уже включено — вернёт 409, это нормально)
gh api -X POST "repos/$OWNER/$REPO/pages" -f build_type=legacy -f 'source[branch]=main' -f 'source[path]=/' >/dev/null 2>&1 || true

echo
echo "Репозиторий: https://github.com/$OWNER/$REPO"
echo "Сайт:        https://$OWNER.github.io/$REPO/   (готов через 1–2 минуты)"
echo "Домен:       polis-godovshchina.ru — после покупки и DNS подхватится из CNAME"
