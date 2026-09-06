# Автопрогон тест-кейсов (Playwright)

Покрывает автоматизируемую часть `docs/test-cases.md` на трёх окружениях: Android Chrome 360 px, iPhone Safari (WebKit), ПК Chrome 1366×768.
Партнёр Полис812 в тестах кнопок подменяется быстрой заглушкой: проверяется адрес перехода и параметры, а не его страница.

```bash
cd tests/e2e && npm init -y >/dev/null && npm i playwright && npx playwright install chromium webkit
node run.mjs            # результат в консоли и results.json
```

Ручные кейсы (реальные устройства, приложение Яндекс, блокировщики, календарь телефона) — по чек-листу в артефакте «Тест-кейсы Годовщины».
