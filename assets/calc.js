/* Калькулятор «полис или надбавка» для ипотеки Сбербанка.
   Оценки премий откалиброваны по реальным расчётам партнёрских платформ
   (Pampadu, Polis812) от 04.09.2026: Сбербанк, остаток 3 000 000 ₽,
   мужчина 27 лет — от 3 900 ₽ (жизнь + квартира), мужчина 40 лет — от 6 600 ₽.
   Остальные возраста — интерполяция; точную цену показывает партнёрский калькулятор. */

// ЕДИНСТВЕННОЕ МЕСТО, ГДЕ МЕНЯЕТСЯ ПАРТНЁРСКАЯ ССЫЛКА.
const PARTNER_URL = "https://polis812.ru/mortgage?params=YmFua19pZD0xJm9iamVjdF90eXBlPWZsYXQmZmlsdGVyPWFsbCZ1c2VyX2Zyb209bGlua2Vy&partnerId=212866&utm_source=godovshchina&utm_medium=site&utm_term=mortgage&utm_campaign=sber";

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
    verdict.innerHTML = "Полис выгоднее отказа — но не в банке. Против полиса банка экономия ещё около <span class=\"num\">" +
      fmt(captive - independent) + "</span> в год, за 10 лет ипотеки — порядка <span class=\"num\">" + fmt((captive - independent) * 10) + "</span>.";
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
  document.querySelectorAll("a[data-partner]").forEach(a => { a.href = PARTNER_URL; });
  if (!document.getElementById("calc")) return;

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
