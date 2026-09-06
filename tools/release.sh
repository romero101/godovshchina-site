#!/bin/bash
# Выкладка на живой сайт по правилу «критические кейсы — до push».
#   1. Локальная сборка на 127.0.0.1:8766 → MODE=release (все авто-кейсы «релиз», 3 окружения).
#   2. Упал хоть один критический → выкладка отменяется, код выхода 1.
#   3. git push origin main → ждём, пока GitHub Pages отдаст текущие версии ассетов.
#   4. MODE=smoke на живом сайте (окружение A): версии, кнопка, форма, обход sitemap, отказ партнёра.
# Использование: tools/release.sh            (пушит текущий main)
#                tools/release.sh --no-push   (только локальный прогон)
set -u
cd "$(dirname "$0")/.."
PORT=8766
if [ ! -d tests/e2e/node_modules/playwright ]; then echo "Нет Playwright: cd tests/e2e && npm i playwright && npx playwright install chromium webkit"; exit 2; fi
python3 -m http.server $PORT --bind 127.0.0.1 >/dev/null 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
sleep 1
echo "== Локальный прогон (release) =="
( cd tests/e2e && SITE=http://127.0.0.1:$PORT MODE=release node run.mjs ) || { echo; echo "КРИТИЧЕСКИЕ КЕЙСЫ НЕ ПРОШЛИ — выкладка отменена. Отчёт: tests/e2e/results-release.json"; exit 1; }
[ "${1:-}" = "--no-push" ] && { echo "Локальный прогон прошёл, push пропущен (--no-push)"; exit 0; }
if [ -n "$(git status --porcelain)" ]; then echo "Есть незакоммиченные изменения — сначала commit"; exit 1; fi
echo "== push =="
git push origin main || exit 1
H=$(md5 -q strahovka-ipoteki-sberbank/index.html)
echo "== ждём выкладку GitHub Pages (страница Сбера, md5 $H) =="
for i in $(seq 1 30); do
  L=$(curl -s "https://polis-godovshchina.ru/strahovka-ipoteki-sberbank/?r=$RANDOM" | md5 -q)
  [ "$L" = "$H" ] && break
  sleep 15
done
[ "$L" = "$H" ] || { echo "Живой сайт всё ещё отдаёт старую страницу — проверьте деплой"; exit 1; }
echo "== Дымовой прогон на живом сайте (smoke) =="
( cd tests/e2e && MODE=smoke node run.mjs ) || { echo "Дымовой прогон на живом сайте упал — смотрите tests/e2e/results-smoke.json"; exit 1; }
echo "Выкладка завершена. Результаты для чек-листа: tests/e2e/db-results-release.json и db-results-smoke.json"
