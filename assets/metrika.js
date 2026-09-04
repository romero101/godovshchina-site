/* Яндекс Метрика. Впишите номер счётчика — и всё подключится само.
   Цель «partner_click» — клик по кнопке перехода к партнёрскому калькулятору
   (это измеритель проверки № 3: расчёт → переход). */
const METRIKA_ID = 112294423; // счётчик «Годовщина», metrika.yandex.ru

(function () {
  if (!METRIKA_ID) return;
  (function (m, e, t, r, i, k, a) {
    m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
    m[i].l = 1 * new Date();
    k = e.createElement(t); a = e.getElementsByTagName(t)[0];
    k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
  })(window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");
  ym(METRIKA_ID, "init", { clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: false });

  document.addEventListener("click", function (ev) {
    const a = ev.target.closest && ev.target.closest("a[data-partner]");
    if (a) ym(METRIKA_ID, "reachGoal", "partner_click");
  }, true);
})();
