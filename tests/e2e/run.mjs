// Автопрогон тест-кейсов polis-godovshchina.ru (docs/test-cases.html, версия 4).
//
//   MODE=release  (по умолчанию) все авто-кейсы с меткой «релиз» на трёх окружениях. Гоняется до push
//                 на локальной сборке: SITE=http://127.0.0.1:8766 (tools/release.sh поднимает сервер сам).
//   MODE=smoke    после выкладки, живой сайт, окружение A: версии скриптов, кнопка партнёра, форма, обход sitemap, отказ партнёра.
//   MODE=monthly  раз в месяц: PageSpeed, скорость и цены Полис812, калибровка калькулятора.
//   ENVS=A,D,F и CASES=3.1,4.4 — фильтры. Код выхода 1, если упал хоть один критический кейс.
//
// Партнёр Полис812 в кейсах кнопок подменяется быстрой заглушкой: проверяется адрес перехода и параметры, а не его страница
// (его страница отвечает 8–25 с и сделала бы прогон нестабильным). Настоящий партнёр проверяется в monthly (2.9, 3.6).
import { chromium, webkit, devices } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const LIVE_HOST = "https://polis-godovshchina.ru";
const SITE = (process.env.SITE || LIVE_HOST).replace(/\/$/, "");
const IS_LIVE = SITE === LIVE_HOST;
const MODE = process.env.MODE || "release";
const ONLY_ENVS = process.env.ENVS ? process.env.ENVS.split(",") : null;
const ONLY_CASES = process.env.CASES ? process.env.CASES.split(",") : null;
const SBER = SITE + "/strahovka-ipoteki-sberbank/";
const CRITICAL = ["1.4", "3.1", "3.2", "4.4", "9.1", "10.1", "11.1", "11.2", "11.3"];
const KNOWN_BANKS = new Set(["1", "2", "3", "4", "6", "7", "9", "12", "16", "28", "30", "31", "34", "39", "73"]);
const LANDINGS = ["/strahovka-ipoteki-vtb/", "/strahovka-ipoteki-sberbank/", "/akkreditovannye-strahovye-vtb/", "/strahovka-ipoteki-alfa-bank/", "/strahovka-ipoteki-dom-rf/", "/prodlit-strahovku-ipoteki/", "/kalkulyator-strahovaniya-ipoteki/", "/strahovka-ipoteki-sogaz/", "/strahovka-ipoteki-vsk/", "/strahovka-ipoteki-rosgosstrah/"];

// Ожидаемые версии ассетов — из локального репозитория (после выкладки живой сайт должен отдавать те же)
const refHtml = fs.readFileSync(path.join(REPO, "strahovka-ipoteki-sberbank/index.html"), "utf8");
const EXPECT = Object.fromEntries(["calc.js", "style.css", "metrika.js"].map(f => [f, (refHtml.match(new RegExp(f.replace(".", "\\.") + "\\?v=(\\d+)")) || [])[1]]));
let COMMIT = "?"; try { COMMIT = execSync("git rev-parse --short HEAD", { cwd: REPO }).toString().trim(); } catch {}

const R = [];
const rec = (env, id, ok, note = "") => { R.push({ env, id, ok, note }); console.log(`${ok === null ? "—" : ok ? "✓" : "✗"} [${env}] ${id} ${note}`); };
const want = id => !ONLY_CASES || ONLY_CASES.includes(id);
const ymStub = `window.__ym=[];window.ym=function(){window.__ym.push([].slice.call(arguments).slice(1))};`;
const decodeParams = u => { try { const p = new URL(u).searchParams.get("params"); return Buffer.from(decodeURIComponent(p), "base64").toString("utf8"); } catch { return ""; } };
const num = s => Number(String(s).replace(/\D/g, "")) || 0;

const ALL_ENVS = [
  { key: "A", name: "Android Chrome 360", browser: "chromium", ctx: { ...devices["Galaxy S9+"] } },
  { key: "D", name: "iPhone Safari", browser: "webkit", ctx: { ...devices["iPhone 13"] } },
  { key: "F", name: "Win Chrome 1366", browser: "chromium", ctx: { viewport: { width: 1366, height: 768 } } },
];
const ENVS = ALL_ENVS.filter(e => (ONLY_ENVS ? ONLY_ENVS.includes(e.key) : MODE === "release"  ? true : e.key === "A"));

async function withPage(env, opts, fn) {
  const b = env.browser === "webkit" ? await webkit.launch() : await chromium.launch();
  const ctx = await b.newContext({ ...env.ctx, ...opts.ctx, locale: "ru-RU", timezoneId: "Europe/Moscow", ignoreHTTPSErrors: true });
  if (!opts.realPartner) await ctx.route(/polis812\.ru/, r => r.fulfill({ status: 200, contentType: "text/html", body: "<title>partner stub</title>ok" }));
  for (const rt of opts.routes || []) await ctx.route(rt.pattern, rt.handler);
  const page = await ctx.newPage();
  if (!opts.noStub) await page.addInitScript(ymStub);
  if (opts.init) await page.addInitScript(opts.init);
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 160)); });
  try { await fn(page, ctx, errors); } catch (e) { rec(env.key, opts.id || "?", false, "исключение: " + e.message.slice(0, 200)); }
  await ctx.close(); await b.close();
}
async function fillCalc(page, { balance = "2500000", age = "40", sex = "m" } = {}) {
  await page.fill("#balance", balance); await page.dispatchEvent("#balance", "input");
  await page.fill("#age", age); await page.dispatchEvent("#age", "input");
  await page.click(`#sex button[data-v="${sex}"]`);
}
const RELEASE = MODE === "release" || MODE === "smoke";
const SMOKE_CASES = ["1.2", "3.1", "4.4", "8.1", "10.1"];
const on = id => want(id) && (MODE !== "smoke" || SMOKE_CASES.includes(id)) && (MODE !== "monthly" || ["1.1", "2.9", "3.6"].includes(id));

console.log(`Прогон: режим ${MODE}, сайт ${SITE} (${IS_LIVE ? "живой" : "локальная сборка"}), коммит ${COMMIT}, окружения ${ENVS.map(e => e.key).join(",")}, ожидаемые версии ${JSON.stringify(EXPECT)}`);

for (const env of ENVS) {
  const E = env.key;
  // ---------- 1. Загрузка ----------
  if (RELEASE && ["1.2", "1.3", "1.4", "1.5", "1.6"].some(on)) await withPage(env, { id: "1.x" }, async (page, ctx, errors) => {
    const t0 = Date.now();
    const resp = await page.goto(SBER, { waitUntil: "load" });
    const loadMs = Date.now() - t0;
    if (on("1.2")) {
      const bad = [];
      for (const p of ["/strahovka-ipoteki-sberbank/", "/strahovka-ipoteki-vtb/", "/kalkulyator-strahovaniya-ipoteki/"]) {
        if (p !== "/strahovka-ipoteki-sberbank/") await page.goto(SITE + p, { waitUntil: "load" });
        await page.waitForTimeout(800);
        const v = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll("script[src],link[rel=stylesheet][href]")].map(e => (e.src || e.href)).filter(s => /\/assets\//.test(s)).map(s => { const m = s.match(/assets\/([^?]+)\?v=(\d+)/); return m ? [m[1], m[2]] : ["?", "?"]; })));
        for (const f of Object.keys(EXPECT)) if (v[f] !== EXPECT[f]) bad.push(`${p} ${f} v${v[f]} вместо v${EXPECT[f]}`);
        const mixed = IS_LIVE && await page.evaluate(() => [...document.querySelectorAll("img,script,link")].some(e => /^http:\/\//.test(e.src || e.href || "")));
        if (mixed) bad.push(p + " смешанное содержимое");
      }
      const errs = errors.filter(e => !/mc\.yandex|metrika|net::ERR|partner stub/.test(e));
      rec(E, "1.2", bad.length === 0 && errs.length === 0, (bad.length ? bad.join("; ") : `версии ${Object.entries(EXPECT).map(([k, v]) => k + " v" + v).join(", ")} на 3 страницах`) + `; ошибок консоли ${errs.length}${errs.length ? ": " + errs[0] : ""}; загрузка ${loadMs} мс`);
    }
    if (on("1.3")) {
      await page.goto(SBER, { waitUntil: "load" });
      const note1 = await page.locator(".cookie-note").count();
      if (note1) { await page.click(".cookie-note button"); await page.reload({ waitUntil: "load" }); await page.waitForTimeout(400); }
      const note2 = await page.locator(".cookie-note").count();
      const ctx2 = await ctx.browser().newContext({ ...env.ctx, ignoreHTTPSErrors: true }); const p2 = await ctx2.newPage(); await p2.goto(SBER, { waitUntil: "load" }); const note3 = await p2.locator(".cookie-note").count(); const calcOk = await p2.evaluate(() => { const n = document.querySelector(".cookie-note"); if (!n) return true; const b = n.getBoundingClientRect(); const btn = n.querySelector("button")?.getBoundingClientRect(); return b.height <= innerHeight * 0.25 && !!btn && btn.width >= 40 && btn.height >= 28; }); await ctx2.close();
      rec(E, "1.3", note1 === 1 && note2 === 0 && note3 === 1 && calcOk, `плашка: первый заход ${note1}, после «Понятно» ${note2}, новая сессия ${note3}; плашка не выше четверти экрана и кнопка «Понятно» нажимаема: ${calcOk}`);
    }
    if (on("1.4")) {
      const r4 = await page.goto(SBER + "?utm_source=yandex&utm_medium=cpc&utm_campaign=search_banks&utm_content=1&utm_term=test", { waitUntil: "load" });
      await fillCalc(page);
      const s = await page.evaluate(() => ({ ov: document.documentElement.scrollWidth - innerWidth, price: document.getElementById("r-indep")?.textContent.replace(/\D/g, ""), init: (window.__ym || []).some(a => a[0] === "init") }));
      rec(E, "1.4", r4.ok() && s.ov <= 1 && num(s.price) > 0, `страница ${r4.status()}, переполнение ${s.ov}px, калькулятор считает (${s.price}), Метрика init ${s.init}; источник визита в Метрике — руками разово`);
    }
    if (on("1.5")) {
      if (!IS_LIVE) rec(E, "1.5", null, "только на живом сайте");
      else { const r5 = await page.request.get(SITE + "/strahovka-ipoteki-vtb", { maxRedirects: 0 }).catch(() => null); const r5b = await page.request.get(SITE + "/Strahovka-Ipoteki-Vtb/", { maxRedirects: 0 }).catch(() => null);
        rec(E, "1.5", r5 && r5.status() === 301 && /vtb\/$/.test(r5.headers()["location"] || "") && r5b && [301, 404].includes(r5b.status()), `без слеша: ${r5 && r5.status()} → ${r5 && r5.headers()["location"]}; с большой буквы: ${r5b && r5b.status()}`); }
    }
    if (on("1.6")) {
      if (!IS_LIVE) rec(E, "1.6", null, "только на живом сайте");
      else { const r6 = await page.goto(SITE + "/abc/", { waitUntil: "load" }); const l = await page.evaluate(() => ({ home: !!document.querySelector('a[href="/"]'), calc: !!document.querySelector('a[href*="kalkulyator"], a[href*="sberbank"]') }));
        rec(E, "1.6", r6.status() === 404 && l.home && l.calc, `статус ${r6.status()}, ссылки на главную ${l.home}, на калькулятор ${l.calc}`); }
    }
  });
  if (RELEASE && on("1.8")) await withPage(env, { id: "1.8", ctx: { colorScheme: "dark" }, init: `document.addEventListener('DOMContentLoaded',()=>{document.documentElement.style.fontSize='150%'})` }, async (page) => {
    await page.goto(SBER, { waitUntil: "load" }); await page.waitForTimeout(300);
    const m = await page.evaluate(() => { const ov = document.documentElement.scrollWidth - innerWidth; const over = [...document.querySelectorAll("#calc input, #calc button, #calc select, #calc a.cta")].find(x => x.getBoundingClientRect().right > innerWidth + 1); return { fs: getComputedStyle(document.documentElement).fontSize, ov, over: over ? (over.id || over.className) : "" }; });
    rec(E, "1.8", m.ov <= 1 && !m.over, `шрифт ${m.fs}, переполнение ${m.ov}px, элемент за экраном: ${m.over || "нет"}`);
  });
  if (RELEASE && on("1.9") && E !== "F") await withPage(env, { id: "1.9", ctx: { viewport: { width: env.ctx.viewport.height, height: env.ctx.viewport.width } } }, async (page) => {
    await page.goto(SBER, { waitUntil: "load" });
    const m = await page.evaluate(() => ({ ov: document.documentElement.scrollWidth - innerWidth, btn: !!document.querySelector("#calc .cta") }));
    rec(E, "1.9", m.ov <= 1 && m.btn, `ландшафт, переполнение ${m.ov}px, кнопка есть ${m.btn}`);
  });

  // ---------- 2. Калькулятор ----------
  if (RELEASE && ["2.1", "2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "2.8"].some(on)) await withPage(env, { id: "2.x" }, async (page) => {
    await page.goto(SBER, { waitUntil: "load" });
    const read = async () => page.evaluate(() => ({ bal: document.getElementById("balance").value, range: document.getElementById("balance-range")?.value, indep: document.getElementById("r-indep")?.textContent.trim(), verdict: document.getElementById("verdict")?.textContent.trim().slice(0, 80) }));
    const setBal = async v => { await page.fill("#balance", v); await page.dispatchEvent("#balance", "input"); await page.dispatchEvent("#balance", "blur"); };
    const setAge = async v => { await page.fill("#age", v); await page.dispatchEvent("#age", "input"); };
    const base = await read();
    if (on("2.1")) { await setBal("2500000"); const a = await read(); rec(E, "2.1", num(a.bal) === 2500000 && /^2.500.000$/.test(a.bal) && (!a.range || a.range === "2500000") && a.indep !== base.indep, `поле «${a.bal}», ползунок ${a.range}, цена ${base.indep} → ${a.indep}`); }
    if (on("2.2")) { await setBal("2 500 000 руб"); const b = await read(); rec(E, "2.2", num(b.bal) === 2500000, `принято как «${b.bal}»`); }
    if (on("2.3")) { const before = await read(); if (before.range !== undefined) { await page.evaluate(() => { const r = document.getElementById("balance-range"); r.value = "4000000"; r.dispatchEvent(new Event("input", { bubbles: true })); }); const c = await read(); rec(E, "2.3", num(c.bal) === 4000000 && c.indep !== before.indep, `после ползунка поле «${c.bal}», цена ${c.indep}`); } else rec(E, "2.3", null, "ползунка нет"); }
    await setBal("3000000");
    if (on("2.4")) { const prices = []; for (const age of ["18", "35", "70"]) { await setAge(age); prices.push(num((await read()).indep)); } await setAge("17"); const p17 = num((await read()).indep); await setAge(""); const pEmpty = (await read()).indep; rec(E, "2.4", prices[0] < prices[1] && prices[1] < prices[2] && !/NaN/.test(pEmpty), `18/35/70 → ${prices.join("/")}; 17 → ${p17}; пусто → «${pEmpty}»`); }
    await setAge("40");
    if (on("2.5")) { await page.click('#sex button[data-v="m"]'); const pm = num((await read()).indep); await page.click('#sex button[data-v="f"]'); const pf = num((await read()).indep); const pressed = await page.getAttribute('#sex button[data-v="f"]', "aria-pressed"); rec(E, "2.5", pf < pm && pressed === "true", `мужчина ${pm}, женщина ${pf}, aria-pressed=${pressed}`); }
    if (on("2.6")) { const opts = await page.$$eval("#uplift option", o => o.map(x => x.value)); await page.selectOption("#uplift", opts[0]); const v1 = (await read()).verdict; await page.selectOption("#uplift", opts[opts.length - 1]); const v2 = (await read()).verdict; rec(E, "2.6", v1.length > 10 && v2.length > 10, `${opts[0]} → «${v1.slice(0, 40)}…»; ${opts[opts.length - 1]} → «${v2.slice(0, 40)}…»`); }
    if (on("2.7")) { const bad = []; for (const v of ["100000", "50000000", "0"]) { await setBal(v); const r = await read(); if (/NaN|Infinity|∞/.test(JSON.stringify(r))) bad.push(v); } rec(E, "2.7", bad.length === 0, bad.length ? "NaN/Infinity при " + bad.join(", ") : "100 000, 50 000 000, 0 — без NaN и Infinity"); }
    if (on("2.8") && E === "F") { await page.goto(SBER, { waitUntil: "load" }); await page.click("#balance"); const before = page.url(); await page.keyboard.press("Enter"); await page.waitForTimeout(300); const tabbed = await page.evaluate(() => [...document.querySelectorAll("#calc input, #calc select, #calc button, #calc a.cta")].every(e => e.tabIndex >= 0 && !e.disabled)); rec(E, "2.8", page.url() === before && tabbed, `Enter не перезагрузил страницу: ${page.url() === before}; всё доступно с клавиатуры: ${tabbed}`); }
  });

  // ---------- 3/4. Кнопка и форма ----------
  if (RELEASE && ["3.1", "3.4", "3.5", "4.1", "4.2", "4.3", "4.4", "4.6", "4.7", "4.8", "4.10"].some(on)) await withPage(env, { id: "3.x" }, async (page, ctx) => {
    await page.goto(SBER, { waitUntil: "load" });
    await fillCalc(page);
    if (["3.1", "3.4", "3.5"].some(on)) {
      const [popup] = await Promise.all([ctx.waitForEvent("page", { timeout: 8000 }).catch(() => null), page.click("#calc a.cta[data-partner]")]);
      await page.waitForTimeout(500);
      const u = popup ? popup.url() : ""; const q = decodeParams(u);
      const stayed = page.url().startsWith(SITE);
      if (on("3.1")) rec(E, "3.1", !!popup && /polis812\.ru\/mortgage/.test(u) && /partnerId=212866/.test(u) && /bank_id=1&debt=2500000&object_type=flat&sex=male&dob=\d\d\.\d\d\.1986/.test(q) && stayed, `новая вкладка: ${!!popup}; ${q || u.slice(0, 80)}; текущая осталась на сайте: ${stayed}`);
      if (popup) await popup.close();
      if (on("3.5")) { const goals = await page.evaluate(() => (window.__ym || []).filter(a => a[0] === "reachGoal").map(a => a[1])); rec(E, "3.5", goals.filter(g => g === "partner_click").length === 1, `reachGoal: ${goals.join(", ") || "нет"}`); }
      if (on("3.4")) { const pre = await page.evaluate(() => ({ bal: document.getElementById("p-balance").value, dob: document.getElementById("p-dob").value })); rec(E, "3.4", num(pre.bal) === 2500000 && /^1986-/.test(pre.dob), `форма: остаток «${pre.bal}», дата ${pre.dob}`); }
    }
    if (on("4.1")) { await page.evaluate(() => sessionStorage.clear()); await page.goto(SBER, { waitUntil: "load" }); const f1 = await page.evaluate(() => ({ bal: document.getElementById("p-balance").value, dob: document.getElementById("p-dob").value, age: document.getElementById("age").value })); const yr = new Date().getFullYear() - Number(f1.age); rec(E, "4.1", num(f1.bal) === 3000000 && new RegExp("^" + yr + "-").test(f1.dob), `остаток «${f1.bal}», дата ${f1.dob} при возрасте ${f1.age}`); }
    if (on("4.2")) { await page.fill("#p-dob", "1986-03-15"); await page.dispatchEvent("#p-dob", "input"); await page.fill("#age", "33"); await page.dispatchEvent("#age", "input"); const d = await page.inputValue("#p-dob"); rec(E, "4.2", d === "1986-03-15", `дата после смены возраста: ${d}`); }
    if (on("4.3")) { await page.evaluate(() => { const d = document.getElementById("p-dob"); d.value = ""; d.dispatchEvent(new Event("input", { bubbles: true })); }); let opened = false; const h = () => { opened = true; }; ctx.on("page", h); await page.evaluate(() => document.getElementById("pform").requestSubmit()); await page.waitForTimeout(800); ctx.off("page", h); const s = await page.evaluate(() => ({ err: !document.getElementById("p-err").hidden, focus: document.activeElement?.id, invalid: !document.getElementById("p-dob").checkValidity() })); rec(E, "4.3", !opened && (s.err || s.invalid), `подсказка ${s.err || s.invalid}, фокус ${s.focus}, вкладка не открылась: ${!opened}`); }
    if (["4.4", "4.7", "4.8", "4.10", "4.6"].some(on)) {
      await page.waitForTimeout(1700);
      await page.fill("#p-dob", "1986-03-15"); await page.dispatchEvent("#p-dob", "input"); await page.fill("#p-balance", "2500000"); await page.dispatchEvent("#p-balance", "input"); await page.click('#p-sex button[data-v="f"]');
      if (on("4.4")) { const [p44] = await Promise.all([ctx.waitForEvent("page", { timeout: 8000 }).catch(() => null), page.click("#p-submit")]); await page.waitForTimeout(400); const q = p44 ? decodeParams(p44.url()) : ""; rec(E, "4.4", !!p44 && /bank_id=1&debt=2500000&object_type=flat&sex=female&dob=15\.03\.1986/.test(q) && page.url().startsWith(SITE), `${q || "вкладка не открылась"}; текущая осталась на сайте: ${page.url().startsWith(SITE)}`); if (p44) await p44.close(); }
      if (on("4.7")) { await page.waitForTimeout(1700); const [p47] = await Promise.all([ctx.waitForEvent("page", { timeout: 8000 }).catch(() => null), page.click("#p-submit")]); const dis = await page.evaluate(() => document.getElementById("p-submit").disabled); rec(E, "4.7", !!p47 && !dis, `второй клик открыл партнёра: ${!!p47}; кнопка активна: ${!dis}`); if (p47) await p47.close(); }
      if (on("4.6")) { await page.fill("#p-balance", "50000"); await page.dispatchEvent("#p-balance", "blur"); const l1 = await page.inputValue("#p-balance"); await page.fill("#p-balance", "99000000"); await page.dispatchEvent("#p-balance", "blur"); const l2 = await page.inputValue("#p-balance"); rec(E, "4.6", num(l1) === 100000 && num(l2) === 50000000, `50 000 → «${l1}», 99 000 000 → «${l2}»`); }
      if (on("4.8")) { const t = new Date(); const d18 = `${t.getFullYear() - 18}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; const res = []; for (const d of ["1988-02-29", d18]) { await page.waitForTimeout(1700); await page.fill("#p-dob", d); await page.dispatchEvent("#p-dob", "input"); const [pp] = await Promise.all([ctx.waitForEvent("page", { timeout: 6000 }).catch(() => null), page.click("#p-submit")]); res.push(d + " → " + (pp ? (decodeParams(pp.url()).match(/dob=[\d.]+/) || ["?"])[0] : "нет вкладки")); if (pp) await pp.close(); } rec(E, "4.8", res.every(s => /→ dob=/.test(s)), res.join("; ")); }
      if (on("4.10") && E === "F") { await page.waitForTimeout(1700); await page.fill("#p-dob", "1986-03-15"); await page.dispatchEvent("#p-dob", "input"); await page.click("#p-balance"); const before = page.url(); const [pe] = await Promise.all([ctx.waitForEvent("page", { timeout: 6000 }).catch(() => null), page.keyboard.press("Enter")]); rec(E, "4.10", !!pe && page.url() === before, `Enter открыл партнёра: ${!!pe}; страница не перезагрузилась: ${page.url() === before}`); if (pe) await pe.close(); }
    }
  });
  if (RELEASE && on("3.2")) await withPage(env, { id: "3.2", init: `window.open=function(){return null};` }, async (page) => {
    await page.goto(SBER, { waitUntil: "load" }); await fillCalc(page);
    await Promise.all([page.waitForURL(/polis812\.ru/, { timeout: 8000 }).catch(() => null), page.click("#calc a.cta[data-partner]")]);
    const u = page.url(); const q = decodeParams(u);
    rec(E, "3.2", /polis812\.ru\/mortgage/.test(u) && /debt=2500000/.test(q), /polis812/.test(u) ? `та же вкладка → партнёр, ${q}` : `остались на ${u}`);
  });
  if (RELEASE && on("4.5")) await withPage(env, { id: "4.5" }, async (page, ctx) => {
    await page.goto(SITE + "/kalkulyator-strahovaniya-ipoteki/", { waitUntil: "load" });
    await page.selectOption("#p-bank", "16"); await page.fill("#p-dob", "1986-03-15"); await page.dispatchEvent("#p-dob", "input");
    const [pp] = await Promise.all([ctx.waitForEvent("page", { timeout: 8000 }).catch(() => null), page.click("#p-submit")]);
    const q = pp ? decodeParams(pp.url()) : ""; rec(E, "4.5", /bank_id=16&/.test(q), q || "вкладка не открылась"); if (pp) await pp.close();
  });

  // ---------- 5. Окно партнёра ----------
  if (RELEASE && ["5.1", "5.3", "5.4"].some(on)) await withPage(env, { id: "5.x", noStub: true }, async (page) => {
    await page.goto(SBER, { waitUntil: "load" });
    let loaderReq = false; page.on("request", r => { if (/polis812\.ru\/wl\/loader\.js/.test(r.url())) loaderReq = true; });
    await page.evaluate(() => document.querySelector("details:has(#wl-open)")?.setAttribute("open", ""));
    await page.click("#wl-open"); await page.waitForTimeout(1500);
    const st = await page.evaluate(() => ({ hidden: document.getElementById("wl-frame").hidden, txt: document.getElementById("wl-open").textContent.trim(), right: Math.round(document.getElementById("wl-frame").getBoundingClientRect().right - innerWidth) }));
    if (on("5.1")) rec(E, "5.1", !st.hidden && /Загружа/.test(st.txt) && loaderReq, `рамка показана ${!st.hidden}, кнопка «${st.txt}», loader.js запрошен ${loaderReq}; само окно партнёра — руками раз в месяц`);
    if (on("5.3")) { const f = await page.evaluate(() => ({ wl: !!document.querySelector("a[data-widget-link]"), pampadu: !!document.querySelector("a[data-partner-alt]") })); rec(E, "5.3", f.wl && f.pampadu, `запасные ссылки: Полис812 ${f.wl}, Пампаду ${f.pampadu}`); }
    if (on("5.4") && E !== "F") rec(E, "5.4", st.right <= 1, `рамка выходит за экран на ${st.right}px`);
  });

  // ---------- 6. Напоминание ----------
  if (RELEASE && ["6.1", "6.3", "6.4"].some(on)) await withPage(env, { id: "6.x", ctx: { acceptDownloads: true } }, async (page) => {
    await page.goto(SITE + "/strahovka-ipoteki-vtb/", { waitUntil: "load" });
    const end = new Date(); end.setMonth(end.getMonth() + 6); const iso = end.toISOString().slice(0, 10);
    const rem = new Date(end); rem.setDate(rem.getDate() - 14); const remYmd = rem.toISOString().slice(0, 10).replace(/-/g, "");
    await page.fill("#remind-date", iso);
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 8000 }).catch(() => null), page.click('#remind-form button[type="submit"]')]);
    let body = ""; if (dl) { const p = await dl.path(); body = fs.readFileSync(p, "utf8"); }
    const okIcs = /BEGIN:VCALENDAR/.test(body) && body.includes("DTSTART;VALUE=DATE:" + remYmd) && /VALARM/.test(body) && /[А-Яа-я]/.test(body) && !/\?\?\?/.test(body);
    if (on("6.1")) rec(E, "6.1", !!dl && /\.ics$/.test(dl.suggestedFilename()) && okIcs, dl ? `файл ${dl.suggestedFilename()}, событие ${remYmd} (за 14 дней до ${iso}), VALARM и русский текст: ${okIcs}` : "скачивание не началось");
    if (on("6.3")) { await page.fill("#remind-date", "2020-01-01"); let dl2 = null; await Promise.all([page.waitForEvent("download", { timeout: 2500 }).then(d => { dl2 = d; }).catch(() => null), page.click('#remind-form button[type="submit"]')]); const hint = await page.evaluate(() => document.getElementById("remind-date").validationMessage); rec(E, "6.3", dl2 === null && !!hint, dl2 ? "файл создан для даты в прошлом" : `файл не создан, подсказка: «${hint}»`); }
    if (on("6.4")) { const goals = await page.evaluate(() => (window.__ym || []).filter(a => a[0] === "reachGoal" && a[1] === "reminder_ics").length); rec(E, "6.4", goals === 1, `reminder_ics засчитан ${goals} раз (валидный клик один)`); }
  });

  // ---------- 7. Остаток долга ----------
  if (RELEASE && ["7.1", "7.2", "7.3"].some(on)) await withPage(env, { id: "7.x" }, async (page) => {
    await page.goto(SITE + "/ostatok-dolga/", { waitUntil: "load" });
    const set = (id, v) => page.evaluate(([id, v]) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("blur", { bubbles: true })); }, [id, v]);
    const y = new Date(); const start = `${y.getFullYear() - 1}-${String(y.getMonth() + 1).padStart(2, "0")}-01`;
    await set("an-sum", "3000000"); await set("an-rate", "10"); await set("an-years", "20"); await set("an-start", start);
    const r1 = await page.evaluate(() => ({ pay: document.getElementById("an-pay")?.textContent, big: document.getElementById("an-big")?.textContent }));
    if (on("7.1")) rec(E, "7.1", num(r1.pay) > 28000 && num(r1.pay) < 30000 && num(r1.big) > 0 && num(r1.big) < 3000000, `платёж ${r1.pay}, остаток ${r1.big}`);
    if (on("7.2")) { await set("an-rate", "10.5"); const b = await page.evaluate(() => document.getElementById("an-pay")?.textContent); rec(E, "7.2", num(b) > 0, `«10.5» → ${b}`); }
    if (on("7.3")) { await set("an-rate", "0"); await set("an-years", "0"); await set("an-date", "2000-01-01"); const bad = await page.evaluate(() => /NaN|Infinity|∞/.test(document.getElementById("annuity").innerText)); rec(E, "7.3", !bad, bad ? "есть NaN или Infinity" : "нет NaN и Infinity"); }
  });

  // ---------- 8. Навигация ----------
  if (RELEASE && on("8.1")) await withPage(env, { id: "8.1" }, async (page) => {
    const xml = await (await page.request.get(SITE + "/sitemap.xml")).text();
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].replace(LIVE_HOST, SITE));
    const bad = [], links = new Set(), noPath = [], withForm = new Set(), pageLinks = {};
    for (const u of urls) {
      const r = await page.request.get(u); const html = r.ok() ? await r.text() : "";
      const p = u.replace(SITE, "") || "/";
      if (!r.ok()) { bad.push(`${p} ${r.status()}`); continue; }
      for (const f of Object.keys(EXPECT)) { const m = html.match(new RegExp(f.replace(".", "\\.") + "\\?v=(\\d+)")); if (m && m[1] !== EXPECT[f]) bad.push(`${p} ${f} v${m[1]}`); }
      const bank = (html.match(/id="pform"[^>]*data-bank-id="(\d+)"/) || [])[1];
      const hasForm = /id="pform"/.test(html), hasSelect = /id="p-bank"/.test(html), hasLink = /data-partner|polis812\.ru|pampadu\.ru/.test(html);
      if (hasForm && !hasSelect && !KNOWN_BANKS.has(bank)) bad.push(`${p} неизвестный bank_id=${bank}`);
      if (hasForm) withForm.add(p);
      pageLinks[p] = [...html.matchAll(/href="(\/[^"#?]*)"/g)].map(m => m[1]);
      if (!hasForm && !hasLink) noPath.push(p);
      for (const l of pageLinks[p]) links.add(l);
    }
    for (const p of noPath) if (!pageLinks[p].some(l => withForm.has(l))) bad.push(`${p} нет пути к партнёру даже через ссылку`);
    for (const l of links) { const r = await page.request.get(SITE + l).catch(() => null); if (!r || r.status() >= 400) bad.push(`ссылка ${l}: ${r ? r.status() : "ошибка"}`); }
    let ovPages = [];
    if (E === "A") for (const u of urls) { await page.goto(u, { waitUntil: "load" }); const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth); if (ov > 1) ovPages.push(u.replace(SITE, "") + ":" + ov + "px"); }
    rec(E, "8.1", bad.length === 0 && ovPages.length === 0, `${urls.length} страниц из sitemap, ${links.size} внутренних ссылок; проблем: ${bad.length ? bad.slice(0, 6).join("; ") : "нет"}${E === "A" ? `; горизонтальная прокрутка на 360px: ${ovPages.length ? ovPages.join(", ") : "нет"}` : ""}`);
  });
  if (RELEASE && ["8.3", "8.5", "8.7"].some(on)) await withPage(env, { id: "8.x" }, async (page) => {
    await page.goto(SBER, { waitUntil: "load" });
    if (on("8.3")) { const nav = await page.evaluate(() => { const n = document.querySelector(".site-nav"); const r = n?.getBoundingClientRect(); const links = n ? [...n.querySelectorAll("a")] : []; const note = document.querySelector(".cookie-note")?.getBoundingClientRect(); const covered = note && r ? !(note.top >= r.bottom || note.bottom <= r.top) : false; return { visible: r ? r.height > 0 : false, total: links.length, small: links.filter(a => a.getBoundingClientRect().height < 28).length, covered }; }); rec(E, "8.3", nav.visible && nav.total >= 3 && nav.small === 0 && !nav.covered, `меню видно ${nav.visible}, ссылок ${nav.total}, слишком мелких ${nav.small}, перекрыто плашкой ${nav.covered}`); }
    if (on("8.5")) { const foot = await page.evaluate(() => ({ op: /ИП Роман/.test(document.body.innerText) && /ИНН/.test(document.body.innerText), pol: !!document.querySelector('footer a[href*="privacy"]') })); const pr = await page.goto(SITE + "/privacy/", { waitUntil: "load" }); const pt = await page.evaluate(() => ({ m: /Метрик/.test(document.body.innerText), p: /Полис812|партн/i.test(document.body.innerText) })); rec(E, "8.5", foot.op && foot.pol && pr.ok() && pt.m && pt.p, `оператор ${foot.op}, ссылка ${foot.pol}, политика ${pr.status()}, Метрика ${pt.m}, партнёр ${pt.p}`); }
    if (on("8.7")) { await page.goto(SBER, { waitUntil: "load" }); await fillCalc(page, { balance: "1200000", age: "29", sex: "f" }); await page.goto(SITE + "/banki/", { waitUntil: "load" }); await page.goBack({ waitUntil: "load" }); await page.waitForTimeout(300); const b = await page.evaluate(() => ({ bal: document.getElementById("balance").value.replace(/\D/g, ""), age: document.getElementById("age").value, pbal: document.getElementById("p-balance").value.replace(/\D/g, ""), sex: document.querySelector("#sex button[aria-pressed='true']")?.dataset.v })); rec(E, "8.7", b.bal === "1200000" && b.age === "29" && b.pbal === "1200000" && b.sex === "f", `после «назад»: остаток ${b.bal}, возраст ${b.age}, пол ${b.sex}, форма ${b.pbal}`); }
  });

  // ---------- 9.1 Посадочные Директа ----------
  if (RELEASE && on("9.1")) await withPage(env, { id: "9.1" }, async (page) => {
    const bad = [];
    for (const l of LANDINGS) { const t0 = Date.now(); const r = await page.request.get(SITE + l + "?utm_source=yandex&utm_medium=cpc&utm_campaign=search_banks&utm_content=1&utm_term=t"); const ms = Date.now() - t0; const html = r.ok() ? await r.text() : ""; if (!r.ok() || !/id="pform"/.test(html)) bad.push(`${l} ${r.status()} form:${/id="pform"/.test(html)} ${ms}мс`); }
    rec(E, "9.1", bad.length === 0, bad.length ? bad.join("; ") : `${LANDINGS.length} посадочных: 200, форма партнёра есть (список фиксированный; после API Директа — из объявлений)`);
  });

  // ---------- 10. Отказы ----------
  if (RELEASE && on("10.1")) await withPage(env, { id: "10.1", realPartner: true, routes: [{ pattern: /polis812\.ru/, handler: r => r.abort() }] }, async (page, ctx) => {
    await page.goto(SBER, { waitUntil: "load" }); await fillCalc(page);
    const [pp] = await Promise.all([ctx.waitForEvent("page", { timeout: 6000 }).catch(() => null), page.click("#p-submit")]);
    await page.waitForTimeout(800);
    const st = await page.evaluate(() => ({ dis: document.getElementById("p-submit").disabled, pampadu: !!document.querySelector("a[data-partner-alt]"), spinner: /Считаем цены/.test(document.body.innerText), onSite: location.href.indexOf("polis812") < 0 }));
    rec(E, "10.1", !st.dis && st.pampadu && !st.spinner && st.onSite, `партнёр недоступен: вкладка ${!!pp}, кнопка активна ${!st.dis}, Пампаду ${st.pampadu}, зависания нет ${!st.spinner}, сайт на месте ${st.onSite}`);
    if (pp) await pp.close();
  });
  if (RELEASE && on("10.2")) await withPage(env, { id: "10.2", noStub: true, routes: [{ pattern: /mc\.yandex\.ru|yandex\.ru\/metrika/, handler: r => r.abort() }] }, async (page, ctx) => {
    await page.goto(SBER, { waitUntil: "load" }); await fillCalc(page);
    const price = await page.evaluate(() => document.getElementById("r-indep")?.textContent.replace(/\D/g, ""));
    const [pp] = await Promise.all([ctx.waitForEvent("page", { timeout: 6000 }).catch(() => null), page.click("#calc a.cta[data-partner]")]);
    rec(E, "10.2", num(price) > 0 && !!pp, `Метрика заблокирована: калькулятор считает (${price}), партнёр открывается ${!!pp}`); if (pp) await pp.close();
  });
  if (RELEASE && on("10.3")) await withPage(env, { id: "10.3", ctx: { javaScriptEnabled: false } }, async (page) => {
    await page.goto(SBER, { waitUntil: "load" });
    const s = await page.evaluate(() => ({ text: document.body.innerText.length, partner: !!document.querySelector('a[href*="polis812.ru"], a[data-partner]') }));
    rec(E, "10.3", s.text > 2000 && s.partner, `без JS: текста ${s.text} символов, ссылка на партнёра ${s.partner}`);
  });
  if (RELEASE && on("10.4")) await withPage(env, { id: "10.4" }, async (page, ctx) => {
    await page.goto(SBER, { waitUntil: "load" }); await fillCalc(page);
    const pages = []; ctx.on("page", p => pages.push(p));
    await page.click("#p-submit", { clickCount: 2 }); await page.click("#p-submit"); await page.waitForTimeout(2500);
    const goals = await page.evaluate(() => (window.__ym || []).filter(a => a[0] === "reachGoal" && a[1] === "partner_click").length);
    rec(E, "10.4", pages.length === 1 && goals === 1, `три быстрых клика → вкладок ${pages.length}, целей partner_click ${goals}`);
    for (const p of pages) await p.close().catch(() => {});
  });

  // ---------- 11. Бэкенд ----------
  if (RELEASE && on("11.1") && E === "A") {
    const r = await fetch("https://api.polis-godovshchina.ru/quote.php", { method: "POST", headers: { "Content-Type": "application/json", Origin: LIVE_HOST }, body: JSON.stringify({ bank_id: "1", debt: 3000000, object_type: "flat", sex: "male", dob: "1986-05-15" }), signal: AbortSignal.timeout(5000) }).then(async r => ({ status: r.status, json: await r.json().catch(() => null) })).catch(e => ({ err: e.message }));
    if (r.err) { rec(E, "11.1", null, "бэкенд не развёрнут: " + r.err.slice(0, 60)); ["11.2", "11.3"].forEach(id => rec(E, id, null, "ждёт развёртывания бэкенда")); }
    else rec(E, "11.1", r.status === 200 && r.json && r.json.ok && r.json.offers?.length > 0, `статус ${r.status}, ok=${r.json?.ok}, предложений ${r.json?.offers?.length ?? 0}`);
  }

  // ---------- Ежемесячно ----------
  if (MODE === "monthly" && on("1.1")) {
    for (const p of ["/strahovka-ipoteki-sberbank/", "/kalkulyator-strahovaniya-ipoteki/"]) {
      const r = await fetch("https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=" + encodeURIComponent(LIVE_HOST + p) + "&strategy=mobile&category=performance", { signal: AbortSignal.timeout(120000) }).then(r => r.json()).catch(e => ({ error: { message: e.message } }));
      const a = r.lighthouseResult?.audits; const lcp = a?.["largest-contentful-paint"]?.numericValue, cls = a?.["cumulative-layout-shift"]?.numericValue, perf = r.lighthouseResult?.categories?.performance?.score;
      rec(E, "1.1", lcp == null ? null : lcp <= 2500 && cls <= 0.1, lcp == null ? "PageSpeed недоступен: " + (r.error?.message || "?").slice(0, 80) : `${p}: LCP ${Math.round(lcp)} мс, CLS ${cls.toFixed(3)}, performance ${Math.round(perf * 100)}`);
    }
  }
  if (MODE === "monthly" && ["2.9", "3.6"].some(on)) await withPage(env, { id: "2.9/3.6", realPartner: true }, async (page, ctx) => {
    await page.goto(SBER, { waitUntil: "load" }); await fillCalc(page);
    const est = await page.evaluate(() => Number(document.getElementById("r-indep").textContent.replace(/\D/g, "")));
    const url = await page.evaluate(() => GDV.partnerUrl("1", 2500000, "m", GDV.dobFromAge(40)));
    const p2 = await ctx.newPage(); const t0 = Date.now(); let prices = [], secs = null;
    await p2.goto(url, { waitUntil: "commit", timeout: 60000 }).catch(() => {});
    for (let i = 0; i < 45; i++) { await p2.waitForTimeout(1000); const txt = await p2.evaluate(() => document.body.innerText).catch(() => ""); prices = [...new Set((txt.match(/(\d[\d\s]{2,})\s?₽/g) || []).map(s => Number(s.replace(/\D/g, ""))))].filter(n => n >= 1000 && n < 200000); if (prices.length >= 3) { secs = (Date.now() - t0) / 1000; break; } }
    const min = prices.length ? Math.min(...prices) : null;
    if (on("3.6")) rec(E, "3.6", secs != null && secs <= 10, secs == null ? "цены партнёра не появились за 45 с" : `цены Полис812 через ${secs.toFixed(1)} с (${prices.length} предложений)`);
    if (on("2.9")) rec(E, "2.9", min != null && est > 0 && Math.abs(est - min) / min <= 0.25, min == null ? "нет цен партнёра для сравнения" : `калькулятор ${est} ₽, минимум у партнёра ${min} ₽, расхождение ${Math.round(Math.abs(est - min) / min * 100)} %`);
    await p2.close();
  });
}

// ---------- Итог ----------
const byId = {};
for (const r of R) (byId[r.id] = byId[r.id] || []).push(r);
const ENVN = { A: "Android Chrome 360", D: "iPhone Safari", F: "ПК Chrome 1366" };
const now = Date.now(), cases = {}, matrix = {};
for (const [id, rs] of Object.entries(byId)) {
  const fails = rs.filter(r => r.ok === false), passes = rs.filter(r => r.ok === true), skips = rs.filter(r => r.ok === null);
  if (fails.length) cases[id] = { s: "fail", n: `Авто ${new Date().toLocaleDateString("ru-RU")} (${MODE}${IS_LIVE ? ", живой" : ", локально"}): не прошёл на ${fails.map(f => ENVN[f.env]).join(", ")}. ${fails[0].note.slice(0, 180)}`, t: now };
  else if (passes.length) cases[id] = { s: "pass", n: `Авто ${new Date().toLocaleDateString("ru-RU")} (${MODE}${IS_LIVE ? ", живой" : ", локально"}): ${passes.map(p => ENVN[p.env]).join(", ")}. ${passes[0].note.slice(0, 160)}`, t: now };
  else if (skips.length) cases[id] = { s: "", n: `Авто: ${skips[0].note.slice(0, 160)}`, t: now };
  if (id === "3.1") for (const r of rs) if (r.ok !== null) matrix[r.env + "|3.1"] = r.ok ? "pass" : "fail";
}
const pass = R.filter(r => r.ok === true).length, fail = R.filter(r => r.ok === false).length, skip = R.filter(r => r.ok === null).length;
const critIds = [...new Set(R.filter(r => CRITICAL.includes(r.id) && r.ok !== null).map(r => r.id))];
const critFailed = critIds.filter(id => byId[id].some(r => r.ok === false));
const lastRun = { at: now, mode: MODE, site: IS_LIVE ? "live" : "local", commit: COMMIT, pass, fail, skip, critPass: critIds.length - critFailed.length, critTotal: critIds.length };
fs.writeFileSync(path.join(HERE, "results.json"), JSON.stringify(R, null, 1));
fs.writeFileSync(path.join(HERE, "db-results.json"), JSON.stringify({ cases, matrix, lastRun }));
console.log(`\nИТОГО (${MODE}, ${IS_LIVE ? "живой сайт" : "локальная сборка"}, ${COMMIT}): прошло ${pass}, не прошло ${fail}, без проверки ${skip}`);
console.log(`Критические кейсы прошли: ${lastRun.critPass} из ${lastRun.critTotal}${critFailed.length ? " — УПАЛИ: " + critFailed.join(", ") : ""}`);
process.exit(critFailed.length ? 1 : 0);
