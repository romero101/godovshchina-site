/* Калькулятор «полис или надбавка» для ипотеки Сбербанка.
   Оценки премий откалиброваны по реальным расчётам партнёрских платформ
   (Pampadu, Polis812) от 04.09.2026: Сбербанк, остаток 3 000 000 ₽,
   мужчина 27 лет — от 3 900 ₽ (жизнь + квартира), мужчина 40 лет — от 6 600 ₽.
   Остальные возраста — интерполяция; точную цену показывает партнёрский калькулятор. */

// ЕДИНСТВЕННОЕ МЕСТО, ГДЕ МЕНЯЕТСЯ ПАРТНЁРСКАЯ ССЫЛКА.

const RATE_PROPERTY = 0.0005; // страховка квартиры: ~1 500 ₽ на 3 000 000 ₽
const CAPTIVE_MARKUP = 1.5;   // полис у банка дороже страховой из списка на 30–60 % → берём 50 %

function lifeRate(age, sex) {
  // годовая ставка страхования жизни, доля от остатка; якоря: 27 → 0,08 %, 40 → 0,17 %
  const pts = [[22, 0.0007], [27, 0.0008], [32, 0.0011], [36, 0.0014], [40, 0.0017], [45, 0.0025], [50, 0.0035], [55, 0.005], [60, 0.007]];
  let r;
  if (age <= pts[0][0]) r = pts[0][1];
  else if (age >= pts[pts.length - 1][0]) r = pts[pts.length - 1][1];
  else {
    for (let i = 0; i < pts.length - 1; i++) {
      const [a0, r0] = pts[i], [a1, r1] = pts[i + 1];
      if (age >= a0 && age <= a1) { r = r0 + (r1 - r0) * (age - a0) / (a1 - a0); break; }
    }
  }
  return sex === "f" ? r * 0.75 : r;
}

const fmt = n => Math.round(n).toLocaleString("ru-RU") + " ₽";
const digits = s => Number(String(s).replace(/\D/g, "")) || 0;

function readBalance() {
  return Math.max(0, digits(document.getElementById("balance").value));
}

function calc() {
  const balance = readBalance();
  const age = Math.min(70, Math.max(18, Number(document.getElementById("age").value) || 35));
  const sex = document.querySelector("#sex [aria-pressed=true]").dataset.v;
  const uplift = Number(document.getElementById("uplift").value); // проценты к ставке

  const declineCost = balance * uplift / 100;
  const independent = balance * (lifeRate(age, sex) + RATE_PROPERTY);
  const captive = independent * CAPTIVE_MARKUP;
  const max = Math.max(declineCost, independent, captive, 1);

  const set = (id, v) => {
    const el = document.getElementById(id);
    el.querySelector(".v").textContent = fmt(v);
    el.querySelector(".fill").style.width = (v / max * 100).toFixed(1) + "%";
    el.classList.remove("best", "worst");
  };
  set("r-decline", declineCost);
  set("r-captive", captive);
  set("r-indep", independent);

  const big = document.getElementById("big");
  const verdict = document.getElementById("verdict");
  const k = document.getElementById("big-k");

  if (independent <= declineCost) {
    document.getElementById("r-indep").classList.add("best");
    document.getElementById("r-decline").classList.add("worst");
    big.className = "big";
    k.textContent = "Ваша экономия в год";
    big.textContent = fmt(declineCost - independent);
    verdict.textContent = "Полис выгоднее отказа — но не в банке. Против полиса банка экономия ещё около " +
      fmt(captive - independent) + " в год, за 10 лет ипотеки — порядка " + fmt((captive - independent) * 10) + ".";
  } else {
    document.getElementById("r-decline").classList.add("best");
    document.getElementById("r-captive").classList.add("worst");
    big.className = "big skip";
    k.textContent = "Отказ дешевле полиса на";
    big.textContent = fmt(independent - declineCost);
    verdict.textContent = "В вашем случае надбавка к ставке обходится дешевле даже самого недорогого полиса. Проверьте точную цену — для некоторых возрастов страховые дают ниже нашей оценки.";
  }
}

function formatBalanceField(el) {
  const n = digits(el.value);
  el.value = n ? n.toLocaleString("ru-RU") : "";
}

document.addEventListener("DOMContentLoaded", () => {
  // партнёрская ссылка проставляется на любой странице, калькулятор — только там, где он есть
  // Основной путь — виджет оформления на странице калькулятора; Полис812 — запасной.
  const onCalcPage = !!document.getElementById("oformit");
  document.querySelectorAll("a[data-partner]").forEach(a => {
    a.href = onCalcPage ? "#oformit" : "/strahovka-ipoteki-sberbank/#oformit";
    a.removeAttribute("target");
  });
  if (!document.getElementById("calc")) return;

  // Кнопка «Показать точные цены» под калькулятором: сразу открываем выдачу партнёра
  // с уже введёнными остатком, полом и возрастом — без повторного ввода. Дату рождения
  // считаем из возраста (середина года), точную дату человек уточнит у партнёра при оформлении.
  const heroCta = document.querySelector("#calc a[data-partner], .hero a[data-partner], a.cta[data-partner]");
  if (heroCta && window.GDV && GDV.partnerUrl) heroCta.addEventListener("click", ev => {
    const age = Number(document.getElementById("age").value) || 35;
    const sexBtn = document.querySelector("#sex button[aria-pressed='true']");
    const sex = sexBtn && sexBtn.dataset.v === "f" ? "f" : "m";
    const dobISO = GDV.dobFromAge(age);
    const pdob = document.getElementById("p-dob"); if (pdob && !pdob.value) pdob.value = dobISO;
    const url = GDV.partnerUrl(GDV.bankId(), readBalance(), sex, dobISO);
    ev.preventDefault();
    try { if (typeof ym === "function") ym(112294423, "reachGoal", "partner_click"); } catch (e) {}
    const w = window.open(url, "_blank", "noopener");
    if (!w) location.href = url;
  });

  const balance = document.getElementById("balance");
  const range = document.getElementById("balance-range");
  formatBalanceField(balance);
  balance.addEventListener("input", () => { if (range) range.value = readBalance(); calc(); });
  balance.addEventListener("blur", () => formatBalanceField(balance));
  if (range) {
    range.value = readBalance();
    range.addEventListener("input", () => { balance.value = Number(range.value).toLocaleString("ru-RU"); calc(); });
  }
  ["age", "uplift"].forEach(id => document.getElementById(id).addEventListener("input", calc));
  document.querySelectorAll("#sex button").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll("#sex button").forEach(x => x.setAttribute("aria-pressed", "false"));
    b.setAttribute("aria-pressed", "true");
    calc();
  }));
  calc();
});

// --- Форма партнёра: своя мгновенная форма → выдача Полис812 в новой вкладке ---
// Общие помощники (доступны калькулятору выше): ссылка партнёра, дата рождения из возраста, банк страницы.
window.GDV = (function(){
  const PARTNER_ID = "212866", YM_ID = "112294423";
  const pad = n => String(n).padStart(2, "0");
  return {
    bankId() { const sel = document.getElementById("p-bank"); const f = document.getElementById("pform"); return (sel && sel.value) || (f && f.dataset.bankId) || "1"; },
    dobFromAge(age) { const d = new Date(); d.setMonth(d.getMonth() - 6); d.setFullYear(d.getFullYear() - age); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); },
    partnerUrl(bankId, debt, sex, dobISO) {
      const [y, m, d] = String(dobISO).split("-");
      const q = "bank_id=" + bankId + "&debt=" + debt + "&object_type=flat&sex=" + (sex === "f" ? "female" : "male") + "&dob=" + d + "." + m + "." + y + "&filter=all";
      const params = btoa(unescape(encodeURIComponent(q)));
      return "https://polis812.ru/mortgage/companies?params=" + encodeURIComponent(params) + "&partnerId=" + PARTNER_ID + "&partner=" + PARTNER_ID + "&partnerYmId=" + YM_ID + "&utm_source=godovshchina&utm_medium=site&utm_campaign=" + (location.pathname.replace(/\//g, "") || "main");
    }
  };
})();
(function(){
  const form = document.getElementById("pform");
  if (!form) return;
  const bal = document.getElementById("p-balance"), dob = document.getElementById("p-dob"), err = document.getElementById("p-err");
  const seg = document.getElementById("p-sex");
  let sex = "m";
  const fmt = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const num = s => parseInt(String(s).replace(/\D/g, ""), 10) || 0;
  // синхронизация с калькулятором выше: остаток, пол, дата рождения из возраста
  const mainBal = document.getElementById("balance"), mainSex = document.getElementById("sex"), mainAge = document.getElementById("age");
  if (mainBal) { bal.value = mainBal.value; mainBal.addEventListener("input", () => { bal.value = mainBal.value; }); }
  if (mainSex) mainSex.addEventListener("click", ev => { const b = ev.target.closest("button[data-v]"); if (!b) return; sex = b.dataset.v; seg.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x.dataset.v === sex)); });
  if (mainAge && dob) { const sync = () => { const a = Number(mainAge.value); if (a >= 18 && a <= 70 && !dob.dataset.touched) dob.value = GDV.dobFromAge(a); }; sync(); mainAge.addEventListener("input", sync); dob.addEventListener("input", () => { dob.dataset.touched = "1"; }); }
  seg.addEventListener("click", ev => { const b = ev.target.closest("button[data-v]"); if (!b) return; sex = b.dataset.v; seg.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x.dataset.v === sex)); });
  bal.addEventListener("blur", () => { const v = Math.min(50000000, Math.max(100000, num(bal.value))); bal.value = fmt(v); });

  // Бэкенд цен: проверяем доступность один раз при загрузке. Пока его нет — кнопка открывает партнёра мгновенно,
  // прямо в обработчике клика (иначе браузеры блокируют новую вкладку).
  const API = (location.hostname === "localhost" || location.hostname === "127.0.0.1") ? "http://127.0.0.1:8090/quote.php" : "https://api.polis-godovshchina.ru/quote.php";
  let apiOk = false;
  try {
    const c = new AbortController(); setTimeout(() => c.abort(), 2500);
    fetch(API, { method: "OPTIONS", signal: c.signal, mode: "cors" }).then(r => { apiOk = r.ok || r.status === 204 || r.status === 405; }).catch(() => { apiOk = false; });
  } catch (e) {}

  form.addEventListener("submit", ev => {
    ev.preventDefault();
    if (!dob.value) { err.hidden = false; dob.focus(); return; }
    err.hidden = true;
    const bankId = GDV.bankId();
    const url = GDV.partnerUrl(bankId, num(bal.value), sex, dob.value);
    try { if (typeof ym === "function") ym(112294423, "reachGoal", "partner_click"); } catch (e) {}
    if (!apiOk) { const w = window.open(url, "_blank", "noopener"); if (!w) location.href = url; return; }
    // Цены на нашей стороне через бэкенд (расчёт без персональных данных); если он не ответил за 3 с — ссылка к партнёру.
    const box = document.getElementById("offers") || (() => { const d = document.createElement("div"); d.id = "offers"; d.className = "offers"; form.insertAdjacentElement("afterend", d); return d; })();
    box.innerHTML = '<p class="note">Считаем цены страховых…</p>';
    const btn = document.getElementById("p-submit"); btn.disabled = true;
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 3000);
    fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal,
      body: JSON.stringify({ bank_id: bankId, debt: num(bal.value), object_type: "flat", sex: sex === "f" ? "female" : "male", dob: dob.value }) })
      .then(r => r.json())
      .then(data => {
        if (!data || !data.ok || !data.offers || !data.offers.length) throw new Error(data && data.error || "empty");
        renderOffers(box, data, url);
        try { if (typeof ym === "function") ym(112294423, "reachGoal", "offers_shown"); } catch (e) {}
      })
      .catch(() => { apiOk = false; const w = window.open(url, "_blank", "noopener"); box.innerHTML = w ? "" : '<p class="note">Цены считаются у партнёра: <a class="cta" href="' + url + '" rel="nofollow sponsored noopener" target="_blank">Открыть предложения страховых →</a></p>'; })
      .finally(() => { clearTimeout(timer); btn.disabled = false; });
  });
  function renderOffers(box, data, fallbackUrl) {
    const rub = n => Math.round(n).toLocaleString("ru-RU") + " ₽";
    const rows = data.offers.slice(0, 15).map((o, i) => `<tr${i === 0 ? ' class="best"' : ''}><td>${o.insurer}</td><td class="n">${rub(o.price)}</td><td><a class="buy" href="${o.buy_url}" data-partner-buy rel="nofollow sponsored noopener" target="_blank">Купить →</a></td></tr>`).join("");
    const ruDate = iso => { const [y, m, d] = String(iso).split("-"); const M = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"]; return m ? `${Number(d)} ${M[Number(m) - 1]} ${y}` : iso; };
    const head = data.estimate
      ? `<p class="k">Оценка цен «жизнь + квартира» — ${data.bank.name}</p><p class="note">${(data.note || "").replace(/\d{4}-\d{2}-\d{2}/, ruDate)}</p>`
      : `<p class="k">Цены страховых — ${data.bank.name}, на ${ruDate(data.asof)}</p>`;
    box.innerHTML = head + `<div class="tblwrap"><table><thead><tr><th>Страховая</th><th class="n">В год</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
      + `<p class="note">${data.estimate ? "Точная цена и оформление — у партнёра по кнопке «Купить»." : "Оформление и оплата — на сайте партнёра Полис812."} <a href="${data.partner_url || fallbackUrl}" rel="nofollow sponsored noopener" target="_blank">Все предложения у партнёра →</a></p>`;
    box.scrollIntoView({ behavior: "smooth", block: "start" });
    box.querySelectorAll("a[data-partner-buy]").forEach(a => a.addEventListener("click", () => { try { if (typeof ym === "function") ym(112294423, "reachGoal", "partner_buy"); } catch (e) {} }));
  }
  // окно партнёра — только по запросу
  const openBtn = document.getElementById("wl-open"), frame = document.getElementById("wl-frame"), tpl = document.getElementById("wl-loader");
  if (openBtn && frame && tpl) openBtn.addEventListener("click", () => {
    openBtn.disabled = true; openBtn.textContent = "Загружаем окно партнёра…"; frame.hidden = false;
    const src = tpl.content.querySelector("script");
    const sc = document.createElement("script");
    for (const a of src.attributes) sc.setAttribute(a.name, a.value);
    frame.appendChild(sc);
    // loader ждёт событие load страницы; оно уже прошло — дублируем его логику
    setTimeout(() => { if (!frame.querySelector("iframe")) { const ev = new Event("load"); window.dispatchEvent(ev); } }, 300);
    try { if (typeof ym === "function") ym(112294423, "reachGoal", "widget_open"); } catch (e) {}
    const t = setInterval(() => { const f = frame.querySelector("iframe"); if (f) { clearInterval(t); const w = document.getElementById("wl-wait"); if (w) w.remove(); openBtn.hidden = true; } }, 500);
  });
})();

// --- Напоминание о годовщине: файл .ics создаётся в браузере ---
(function(){
  const f = document.getElementById("remind-form");
  if (!f) return;
  f.addEventListener("submit", ev => {
    ev.preventDefault();
    const d = document.getElementById("remind-date").value; if (!d) return;
    const end = new Date(d + "T09:00:00");
    const remind = new Date(end); remind.setDate(remind.getDate() - 14);
    const ymd = x => x.toISOString().slice(0,10).replace(/-/g, "");
    const bank = f.dataset.bank || "банк";
    const ics = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//polis-godovshchina.ru//RU","BEGIN:VEVENT",
      "UID:" + Date.now() + "@polis-godovshchina.ru","DTSTAMP:" + new Date().toISOString().replace(/[-:]/g,"").slice(0,15) + "Z",
      "DTSTART;VALUE=DATE:" + ymd(remind),"DTEND;VALUE=DATE:" + ymd(remind),
      "SUMMARY:Продлить страховку ипотеки (" + bank + ") — полис заканчивается " + d.split("-").reverse().join("."),
      "DESCRIPTION:Посчитать цены аккредитованных страховых и передать полис в банк до окончания старого: " + location.origin + location.pathname,
      "URL:" + location.origin + location.pathname,
      "BEGIN:VALARM","TRIGGER:-PT0M","ACTION:DISPLAY","DESCRIPTION:Продлить страховку ипотеки","END:VALARM",
      "END:VEVENT","END:VCALENDAR"].join("\r\n");
    const blob = new Blob([ics], {type: "text/calendar;charset=utf-8"});
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "prodlenie-strahovki-ipoteki.ics";
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    try { if (typeof ym === "function") ym(112294423, "reachGoal", "reminder_ics"); } catch (e) {}
  });
})();

// --- Остаток долга по аннуитету ---
(function(){
  const f = document.getElementById("annuity");
  if (!f) return;
  const $ = id => document.getElementById(id);
  const num = s => parseInt(String(s).replace(/\D/g, ""), 10) || 0;
  const rub = n => Math.round(n).toLocaleString("ru-RU") + " ₽";
  if (!$("an-date").value) $("an-date").value = new Date().toISOString().slice(0,10);
  function calc(){
    const S = num($("an-sum").value), rate = Number($("an-rate").value), years = Number($("an-years").value);
    const start = new Date($("an-start").value), at = new Date($("an-date").value);
    if (!S || !rate || !years || isNaN(start) || isNaN(at)) return;
    const n = Math.round(years * 12), r = rate / 100 / 12;
    const A = S * r / (1 - Math.pow(1 + r, -n));
    let k = (at.getFullYear() - start.getFullYear()) * 12 + (at.getMonth() - start.getMonth()) + (at.getDate() >= start.getDate() ? 1 : 0);
    k = Math.max(0, Math.min(n, k));
    const pk = Math.pow(1 + r, k);
    const bal = S * pk - A * (pk - 1) / r;
    const paid = A * k, principalPaid = S - bal, interest = paid - principalPaid;
    $("an-big").textContent = rub(Math.max(0, bal));
    $("an-pay").textContent = rub(A); $("an-k").textContent = k + " из " + n; $("an-int").textContent = rub(Math.max(0, interest));
    $("an-verdict").textContent = k >= n ? "По графику кредит уже погашен." : "Эту сумму указывайте как страховую при продлении (Газпромбанк — плюс проценты за год: " + rub(Math.max(0, bal) * rate / 100) + ").";
  }
  $("an-sum").addEventListener("blur", () => { $("an-sum").value = num($("an-sum").value).toLocaleString("ru-RU"); calc(); });
  ["an-sum","an-rate","an-years","an-start","an-date"].forEach(id => $(id).addEventListener("input", calc));
  calc();
})();
