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
  ym(METRIKA_ID, "init", { clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: true });

  document.addEventListener("click", function (ev) {
    const a = ev.target.closest && ev.target.closest("a[data-partner]");
    if (a) ym(METRIKA_ID, "reachGoal", "partner_click");
  }, true);
})();

// Уведомление о cookie: показываем один раз, закрытие запоминаем в localStorage.
(function(){
  try{ if(localStorage.getItem("cookie-ok")) return; }catch(e){}
  function show(){
    var n=document.createElement("div"); n.className="cookie-note"; n.setAttribute("role","status");
    n.innerHTML='<span>Сайт использует cookie Яндекс Метрики для обезличенной статистики. <a href="/privacy/">Подробнее</a></span><button type="button">Понятно</button>';
    n.querySelector("button").addEventListener("click",function(){ try{localStorage.setItem("cookie-ok","1");}catch(e){} n.remove(); });
    document.body.appendChild(n);
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",show); else show();
})();
