/* Калькулятор «полис или надбавка» для ипотеки Сбербанка.
   Оценки премий откалиброваны по реальным расчётам партнёрских платформ
   (Pampadu, Polis812) от 04.09.2026: Сбербанк, остаток 3 000 000 ₽,
   мужчина 27 лет — от 3 900 ₽ (жизнь + имущество), мужчина 40 лет — от 6 600 ₽.
   Остальные возраста — интерполяция; точную цену показывает партнёрский калькулятор. */

// ЕДИНСТВЕННОЕ МЕСТО, ГДЕ МЕНЯЕТСЯ ПАРТНЁРСКАЯ ССЫЛКА.
// Вставьте ссылку из кабинета Pampadu («Вебмастеру → Витрины и виджеты»)
// или Polis812 («Инструменты → Конструктор ссылок»).
const PARTNER_URL = "https://polis812.ru/mortgage?params=YmFua19pZD0xJm9iamVjdF90eXBlPWZsYXQmZmlsdGVyPWFsbCZ1c2VyX2Zyb209bGlua2Vy&partnerId=212866&utm_source=godovshchina&utm_medium=site&utm_term=mortgage&utm_campaign=sber";

const RATE_PROPERTY = 0.0005; // конструктив: ~1 500 ₽ на 3 000 000 ₽
const CAPTIVE_MARKUP = 1.5;   // полис у банка дороже независимой СК на 30–60 % → берём 50 %

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

function calc() {
  const balance = Math.max(0, Number(document.getElementById("balance").value) || 0);
  const age = Math.min(70, Math.max(18, Number(document.getElementById("age").value) || 35));
  const sex = document.querySelector("#sex [aria-pressed=true]").dataset.v;
  const uplift = Number(document.getElementById("uplift").value); // п.п.

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
  set("b-decline", declineCost);
  set("b-captive", captive);
  set("b-indep", independent);

  const verdict = document.getElementById("verdict");
  const saving = document.getElementById("saving");
  const cheapest = Math.min(declineCost, independent);
  if (independent <= declineCost) {
    document.getElementById("b-indep").classList.add("best");
    document.getElementById("b-decline").classList.add("worst");
    verdict.className = "verdict buy";
    verdict.textContent = "Полис выгоднее отказа — но не у банка.";
    saving.innerHTML = "Против отказа от страховки вы экономите <span class=\"num\">" + fmt(declineCost - independent) +
      "</span> в год, против полиса банка — около <span class=\"num\">" + fmt(captive - independent) +
      "</span>. За 10 лет ипотеки разница с банком — порядка <span class=\"num\">" + fmt((captive - independent) * 10) + "</span>.";
  } else {
    document.getElementById("b-decline").classList.add("best");
    document.getElementById("b-captive").classList.add("worst");
    verdict.className = "verdict skip";
    verdict.textContent = "В вашем случае отказ от страхования жизни дешевле полиса.";
    saving.innerHTML = "Надбавка к ставке обойдётся в <span class=\"num\">" + fmt(declineCost) +
      "</span> в год — это меньше, чем даже самый дешёвый полис (<span class=\"num\">" + fmt(independent) +
      "</span>). Проверьте точную цену: у некоторых страховых для вашего возраста она может оказаться ниже.";
  }
  void cheapest;
}

document.addEventListener("DOMContentLoaded", () => {
  // партнёрская ссылка проставляется на любой странице, калькулятор — только там, где он есть
  document.querySelectorAll("a[data-partner]").forEach(a => { a.href = PARTNER_URL; });
  if (!document.getElementById("calc")) return;
  ["balance", "age", "uplift"].forEach(id => document.getElementById(id).addEventListener("input", calc));
  document.querySelectorAll("#sex button").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll("#sex button").forEach(x => x.setAttribute("aria-pressed", "false"));
    b.setAttribute("aria-pressed", "true");
    calc();
  }));
  calc();
});
