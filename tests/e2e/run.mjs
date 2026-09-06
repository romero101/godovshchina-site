// Автопрогон тест-кейсов polis-godovshchina.ru. Результат: results.json + печать в консоль.
import { chromium, webkit, devices } from "playwright";
import fs from "node:fs";

const SITE = "https://polis-godovshchina.ru";
const SBER = SITE + "/strahovka-ipoteki-sberbank/";
const R = []; // {env, id, ok, note}
const rec = (env, id, ok, note = "") => { R.push({ env, id, ok, note }); console.log(`${ok === null ? "—" : ok ? "✓" : "✗"} [${env}] ${id} ${note}`); };

// Счётчик вызовов ym до загрузки страницы
const ymStub = `window.__ym=[];window.ym=function(){window.__ym.push([].slice.call(arguments).slice(1))};`;

const ENVS = [
  { key: "A", name: "Android Chrome 360", browser: "chromium", ctx: { ...devices["Galaxy S9+"] } },
  { key: "D", name: "iPhone Safari", browser: "webkit", ctx: { ...devices["iPhone 13"] } },
  { key: "F", name: "Win Chrome 1366", browser: "chromium", ctx: { viewport: { width: 1366, height: 768 } } },
];

async function withPage(env, opts, fn) {
  const b = env.browser === "webkit" ? await webkit.launch() : await chromium.launch();
  const ctx = await b.newContext({ ...env.ctx, ...opts.ctx, locale: "ru-RU", timezoneId: "Europe/Moscow", ignoreHTTPSErrors: true });
  // Партнёр отвечает 8–25 с: в тестах кнопок подменяем его быстрой заглушкой, проверяем только адрес перехода
  if (!opts.realPartner && !opts.route) await ctx.route(/polis812\.ru/, r => r.fulfill({ status: 200, contentType: "text/html", body: "<title>partner stub</title>ok" }));
  const page = await ctx.newPage();
  if (!opts.noStub) await page.addInitScript(ymStub);
  if (opts.init) await page.addInitScript(opts.init);
  if (opts.route) await ctx.route(opts.route.pattern, opts.route.handler);
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 160)); });
  try { await fn(page, ctx, errors); } catch (e) { rec(env.key, opts.id || "?", false, "исключение: " + e.message.slice(0, 200)); }
  await ctx.close(); await b.close();
}

const decodeParams = u => { try { const p = new URL(u).searchParams.get("params"); return Buffer.from(decodeURIComponent(p), "base64").toString("utf8"); } catch { return ""; } };

async function fillCalc(page, { balance = "2500000", age = "40", sex = "m" } = {}) {
  await page.fill("#balance", balance); await page.dispatchEvent("#balance", "input");
  await page.fill("#age", age); await page.dispatchEvent("#age", "input");
  await page.click(`#sex button[data-v="${sex}"]`);
}

for (const env of ENVS) {
  const E = env.key;
  // ---------- 1. Загрузка ----------
  await withPage(env, { id: "1.x" }, async (page, ctx, errors) => {
    const t0 = Date.now();
    const resp = await page.goto(SBER, { waitUntil: "load" });
    const loadMs = Date.now() - t0;
    const calcVisible = await page.evaluate(() => { const r = document.getElementById("calc")?.getBoundingClientRect(); return r ? r.top < innerHeight : false; });
    rec(E, "1.1", resp.ok() && loadMs < 2500 && calcVisible, `load ${loadMs} мс, калькулятор в первом экране: ${calcVisible}`);
    const scripts = await page.evaluate(() => [...document.scripts].map(s => s.src).filter(s => /calc|metrika/.test(s)).map(s => s.split("/assets/")[1]));
    const okScripts = scripts.includes("calc.js?v=15") && scripts.includes("metrika.js?v=3");
    await page.waitForTimeout(1500);
    const errs = errors.filter(e => !/mc\.yandex|metrika|net::ERR/.test(e));
    rec(E, "1.2", okScripts && errs.length === 0, `скрипты ${scripts.join(", ")}; ошибок ${errs.length}${errs.length ? ": " + errs[0] : ""}`);
    rec(E, "1.7", okScripts, "версии скриптов актуальные (calc v15, metrika v3)");
    // cookie
    const note1 = await page.locator(".cookie-note").count();
    if (note1) { await page.click(".cookie-note button"); await page.reload({ waitUntil: "load" }); await page.waitForTimeout(500); }
    const note2 = await page.locator(".cookie-note").count();
    rec(E, "1.3", note1 === 1 && note2 === 0, `плашка при первом заходе: ${note1}, после «Понятно» и перезагрузки: ${note2}`);
    // utm
    const r4 = await page.goto(SBER + "?utm_source=yandex&utm_medium=cpc&utm_campaign=search_banks&utm_content=1&utm_term=test", { waitUntil: "load" });
    const calcOk = await page.evaluate(() => !!document.getElementById("calc") && document.documentElement.scrollWidth <= innerWidth + 1);
    const ymHit = await page.evaluate(() => (window.__ym || []).some(a => a[0] === "init"));
    rec(E, "1.4", r4.ok() && calcOk, `страница 200, калькулятор есть, без горизонтальной прокрутки; Метрика init: ${ymHit} (источник визита проверяется в Метрике вручную)`);
    // redirects
    const r5 = await page.request.get(SITE + "/strahovka-ipoteki-vtb", { maxRedirects: 0 }).catch(e => null);
    const r5b = await page.request.get(SITE + "/Strahovka-Ipoteki-Vtb/", { maxRedirects: 0 }).catch(e => null);
    rec(E, "1.5", r5 && r5.status() === 301 && /vtb\/$/.test(r5.headers()["location"] || "") && r5b && (r5b.status() === 404 || r5b.status() === 301), `без слеша: ${r5 && r5.status()} → ${r5 && r5.headers()["location"]}; с большой буквы: ${r5b && r5b.status()}`);
    const r6 = await page.goto(SITE + "/abc/", { waitUntil: "load" });
    const links404 = await page.evaluate(() => ({ home: !!document.querySelector('a[href="/"]'), calc: !!document.querySelector('a[href*="kalkulyator"], a[href*="sberbank"]') }));
    rec(E, "1.6", r6.status() === 404 && links404.home && links404.calc, `статус ${r6.status()}, ссылки на главную: ${links404.home}, на калькулятор: ${links404.calc}`);
  });
  // 1.8 тёмная тема + крупный шрифт, 1.9 ландшафт (только мобильные)
  await withPage(env, { id: "1.8", ctx: { colorScheme: "dark" }, init: `document.addEventListener('DOMContentLoaded',()=>{document.documentElement.style.fontSize='150%'})` }, async (page) => {
    await page.goto(SBER, { waitUntil: "load" }); await page.waitForTimeout(400);
    const m = await page.evaluate(() => { const fs = getComputedStyle(document.documentElement).fontSize; const ov = document.documentElement.scrollWidth - innerWidth; const btn = document.querySelector("#calc .cta"); const r = btn?.getBoundingClientRect(); return { fs, ov, btnW: r ? Math.round(r.width) : 0, vw: innerWidth, overlap: (() => { const a = document.querySelectorAll("#calc input, #calc button, #calc select"); for (const x of a) { const rr = x.getBoundingClientRect(); if (rr.right > innerWidth + 1) return x.id || x.className; } return ""; })() }; });
    rec(E, "1.8", m.ov <= 1 && !m.overlap, `шрифт ${m.fs}, переполнение ${m.ov}px, элемент за экраном: ${m.overlap || "нет"}`);
  });
  if (E !== "F") await withPage(env, { id: "1.9", ctx: { viewport: { width: env.ctx.viewport.height, height: env.ctx.viewport.width } } }, async (page) => {
    await page.goto(SBER, { waitUntil: "load" });
    const m = await page.evaluate(() => ({ ov: document.documentElement.scrollWidth - innerWidth, calc: !!document.getElementById("calc"), btn: !!document.querySelector("#calc .cta") }));
    rec(E, "1.9", m.ov <= 1 && m.calc && m.btn, `ландшафт ${env.ctx.viewport.height}×${env.ctx.viewport.width}, переполнение ${m.ov}px`);
  });

  // ---------- 2. Калькулятор ----------
  await withPage(env, { id: "2.x" }, async (page) => {
    await page.goto(SBER, { waitUntil: "load" });
    const read = async () => page.evaluate(() => ({ bal: document.getElementById("balance").value, range: document.getElementById("balance-range")?.value, big: document.getElementById("big")?.textContent.trim(), indep: document.getElementById("r-indep")?.textContent.trim(), verdict: document.getElementById("verdict")?.textContent.trim().slice(0, 80) }));
    const num = s => Number(String(s).replace(/\D/g, "")) || 0;
    const base = await read();
    await page.fill("#balance", "2500000"); await page.dispatchEvent("#balance", "input"); await page.dispatchEvent("#balance", "blur");
    const a = await read();
    rec(E, "2.1", num(a.bal) === 2500000 && /^2.500.000$/.test(a.bal) && (!a.range || a.range === "2500000") && a.indep !== base.indep, `поле «${a.bal}», ползунок ${a.range}, цена ${base.indep} → ${a.indep}`);
    await page.fill("#balance", "2 500 000 руб"); await page.dispatchEvent("#balance", "input"); await page.dispatchEvent("#balance", "blur");
    const b = await read();
    rec(E, "2.2", num(b.bal) === 2500000, `принято как «${b.bal}»`);
    if (b.range !== undefined) { await page.fill("#balance-range", "4000000").catch(() => {}); await page.evaluate(() => { const r = document.getElementById("balance-range"); r.value = "4000000"; r.dispatchEvent(new Event("input", { bubbles: true })); }); const c = await read(); rec(E, "2.3", num(c.bal) === 4000000 && c.indep !== b.indep, `после ползунка поле «${c.bal}», цена ${c.indep}`); } else rec(E, "2.3", null, "ползунка нет на странице");
    await page.fill("#balance", "3000000"); await page.dispatchEvent("#balance", "input");
    const prices = [];
    for (const age of ["18", "35", "70"]) { await page.fill("#age", age); await page.dispatchEvent("#age", "input"); prices.push(num((await read()).indep)); }
    await page.fill("#age", "17"); await page.dispatchEvent("#age", "input"); const p17 = num((await read()).indep);
    await page.fill("#age", ""); await page.dispatchEvent("#age", "input"); const pEmpty = (await read()).indep;
    rec(E, "2.4", prices[0] < prices[1] && prices[1] < prices[2] && !/NaN/.test(pEmpty), `18/35/70 → ${prices.join("/")}; 17 → ${p17}; пусто → «${pEmpty}»`);
    await page.fill("#age", "40"); await page.dispatchEvent("#age", "input");
    await page.click('#sex button[data-v="m"]'); const pm = num((await read()).indep);
    await page.click('#sex button[data-v="f"]'); const pf = num((await read()).indep);
    const pressed = await page.getAttribute('#sex button[data-v="f"]', "aria-pressed");
    rec(E, "2.5", pf < pm && pressed === "true", `мужчина ${pm}, женщина ${pf}, aria-pressed=${pressed}`);
    const opts = await page.$$eval("#uplift option", o => o.map(x => x.value));
    await page.selectOption("#uplift", opts[0]); const v1 = (await read()).verdict;
    await page.selectOption("#uplift", opts[opts.length - 1]); const v2 = (await read()).verdict;
    rec(E, "2.6", v1.length > 0 && v2.length > 0, `надбавка ${opts[0]} → «${v1}»; ${opts[opts.length - 1]} → «${v2}» (варианта 0 % на странице Сбера нет)`);
    const bad = [];
    for (const v of ["100000", "50000000", "0"]) { await page.fill("#balance", v); await page.dispatchEvent("#balance", "input"); await page.dispatchEvent("#balance", "blur"); const r = await read(); if (/NaN|Infinity|∞/.test(JSON.stringify(r))) bad.push(v + ":" + r.indep); }
    rec(E, "2.7", bad.length === 0, bad.length ? bad.join("; ") : "100 000, 50 000 000, 0 — без NaN и Infinity");
    if (E === "F") { await page.goto(SBER, { waitUntil: "load" }); await page.click("#balance"); const before = page.url(); await page.keyboard.press("Enter"); await page.waitForTimeout(300); const tabbed = await page.evaluate(() => { const els = [...document.querySelectorAll("#calc input, #calc select, #calc button, #calc a.cta")]; return els.every(e => e.tabIndex >= 0 && !e.disabled); }); rec(E, "2.8", page.url() === before && tabbed, `Enter в поле не перезагрузил страницу: ${page.url() === before}; все элементы доступны с клавиатуры: ${tabbed}`); }
  });

  // ---------- 3/4. Кнопка и форма ----------
  await withPage(env, { id: "3.x" }, async (page, ctx) => {
    await page.goto(SBER, { waitUntil: "load" });
    await fillCalc(page);
    const [popup] = await Promise.all([ctx.waitForEvent("page", { timeout: 8000 }).catch(() => null), page.click("#calc a.cta[data-partner]")]);
    const u = popup ? popup.url() : ""; const q = decodeParams(u);
    const ok31 = !!popup && /polis812\.ru\/mortgage/.test(u) && /partnerId=212866/.test(u) && /bank_id=1&debt=2500000&object_type=flat&sex=male&dob=\d\d\.\d\d\.1986/.test(q);
    rec(E, "3.1", ok31, `новая вкладка: ${!!popup}; ${q || u.slice(0, 80)}; url ok: ${/polis812\.ru\/mortgage\/companies/.test(u)}, partnerId: ${/partnerId=212866/.test(u)}, params ok: ${/bank_id=1&debt=2500000&object_type=flat&sex=male&dob=\d\d\.\d\d\.1986/.test(q)}`);
    if (popup) await popup.close();
    const goals = await page.evaluate(() => (window.__ym || []).filter(a => a[0] === "reachGoal").map(a => a[1]));
    rec(E, "3.5", goals.filter(g => g === "partner_click").length === 1, `reachGoal: ${goals.join(", ") || "нет"}`);
    const pre = await page.evaluate(() => ({ bal: document.getElementById("p-balance").value, dob: document.getElementById("p-dob").value }));
    rec(E, "3.4", pre.bal.replace(/\D/g, "") === "2500000" && /^1986-/.test(pre.dob), `форма: остаток «${pre.bal}», дата ${pre.dob}`);
    // 4.1 fresh page (новый контекст: калькулятор помнит ввод в сессии)
    await page.evaluate(() => sessionStorage.clear());
    await page.goto(SBER, { waitUntil: "load" });
    const f1 = await page.evaluate(() => ({ bal: document.getElementById("p-balance").value, dob: document.getElementById("p-dob").value, age: document.getElementById("age").value }));
    const yr = new Date().getFullYear() - Number(f1.age);
    rec(E, "4.1", f1.bal.replace(/\D/g, "") === "3000000" && new RegExp("^" + yr + "-").test(f1.dob), `остаток «${f1.bal}», дата ${f1.dob} при возрасте ${f1.age}`);
    // 4.2 manual dob survives age change
    await page.fill("#p-dob", "1986-03-15"); await page.dispatchEvent("#p-dob", "input");
    await page.fill("#age", "33"); await page.dispatchEvent("#age", "input");
    const d42 = await page.inputValue("#p-dob");
    rec(E, "4.2", d42 === "1986-03-15", `дата после смены возраста: ${d42}`);
    // 4.3 empty dob
    await page.evaluate(() => { const d = document.getElementById("p-dob"); d.value = ""; d.dispatchEvent(new Event("input", { bubbles: true })); });
    let opened43 = false; ctx.once("page", () => { opened43 = true; });
    await page.evaluate(() => { document.getElementById("pform").requestSubmit ? document.getElementById("pform").requestSubmit() : document.getElementById("p-submit").click(); });
    await page.waitForTimeout(800);
    const s43 = await page.evaluate(() => ({ err: !document.getElementById("p-err").hidden, focus: document.activeElement?.id, invalid: !document.getElementById("p-dob").checkValidity() }));
    rec(E, "4.3", !opened43 && (s43.err || s43.invalid), `подсказка: ${s43.err || s43.invalid}, фокус: ${s43.focus}, вкладка партнёра не открылась: ${!opened43}`);
    // 4.4 filled form
    await page.fill("#p-dob", "1986-03-15"); await page.dispatchEvent("#p-dob", "input");
    await page.fill("#p-balance", "2500000"); await page.dispatchEvent("#p-balance", "input");
    await page.click('#p-sex button[data-v="f"]');
    const [p44] = await Promise.all([ctx.waitForEvent("page", { timeout: 8000 }).catch(() => null), page.click("#p-submit")]);
    const q44 = p44 ? decodeParams(p44.url()) : "";
    rec(E, "4.4", !!p44 && /bank_id=1&debt=2500000&object_type=flat&sex=female&dob=15\.03\.1986/.test(q44), `${q44 || "вкладка не открылась"}`);
    if (p44) await p44.close();
    // 4.7 second click (после защиты от двойного клика, 1,5 с)
    await page.waitForTimeout(1700);
    const [p47] = await Promise.all([ctx.waitForEvent("page", { timeout: 8000 }).catch(() => null), page.click("#p-submit")]);
    const dis = await page.evaluate(() => document.getElementById("p-submit").disabled);
    rec(E, "4.7", !!p47 && !dis, `второй клик открыл партнёра: ${!!p47}; кнопка активна: ${!dis}`);
    if (p47) await p47.close();
    // 4.6 limits
    await page.fill("#p-balance", "50000"); await page.dispatchEvent("#p-balance", "blur"); const l1 = await page.inputValue("#p-balance");
    await page.fill("#p-balance", "99000000"); await page.dispatchEvent("#p-balance", "blur"); const l2 = await page.inputValue("#p-balance");
    rec(E, "4.6", l1.replace(/\D/g, "") === "100000" && l2.replace(/\D/g, "") === "50000000", `50 000 → «${l1}», 99 000 000 → «${l2}»`);
    // 4.8 edge dates
    const today = new Date(); const d18 = `${today.getFullYear() - 18}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const res48 = [];
    for (const d of ["1988-02-29", d18]) { await page.waitForTimeout(1700); await page.fill("#p-dob", d); await page.dispatchEvent("#p-dob", "input"); const [pp] = await Promise.all([ctx.waitForEvent("page", { timeout: 6000 }).catch(() => null), page.click("#p-submit")]); res48.push(d + " → " + (pp ? decodeParams(pp.url()).match(/dob=[\d.]+/)?.[0] : "нет вкладки")); if (pp) await pp.close(); }
    rec(E, "4.8", res48.every(s => /→ dob=/.test(s)), res48.join("; "));
    if (E === "F") { await page.waitForTimeout(1700); await page.fill("#p-dob", "1986-03-15"); await page.dispatchEvent("#p-dob", "input"); await page.click("#p-balance"); const before = page.url(); const [pe] = await Promise.all([ctx.waitForEvent("page", { timeout: 6000 }).catch(() => null), page.keyboard.press("Enter")]); rec(E, "4.10", !!pe && page.url() === before, `Enter открыл партнёра: ${!!pe}; страница не перезагрузилась: ${page.url() === before}`); if (pe) await pe.close(); }
  });
  // 3.2 popup blocked → same tab
  await withPage(env, { id: "3.2", init: `window.open=function(){return null};`, route: { pattern: /polis812\.ru/, handler: r => r.fulfill({ status: 200, contentType: "text/html", body: "<title>stub</title>partner" }) } }, async (page) => {
    await page.goto(SBER, { waitUntil: "load" }); await fillCalc(page);
    await Promise.all([page.waitForURL(/polis812\.ru/, { timeout: 8000 }).catch(() => null), page.click("#calc a.cta[data-partner]")]);
    const u = page.url(); const q = decodeParams(u);
    rec(E, "3.2", /polis812\.ru\/mortgage\/companies/.test(u) && /debt=2500000/.test(q), /polis812/.test(u) ? `та же вкладка → партнёр, ${q}` : `остались на ${u}`);
  });
  // 4.5 bank select on calc page
  await withPage(env, { id: "4.5" }, async (page, ctx) => {
    await page.goto(SITE + "/kalkulyator-strahovaniya-ipoteki/", { waitUntil: "load" });
    await page.selectOption("#p-bank", "16"); await page.fill("#p-dob", "1986-03-15"); await page.dispatchEvent("#p-dob", "input");
    const [pp] = await Promise.all([ctx.waitForEvent("page", { timeout: 8000 }).catch(() => null), page.click("#p-submit")]);
    const q = pp ? decodeParams(pp.url()) : "";
    rec(E, "4.5", /bank_id=16&/.test(q), q || "вкладка не открылась"); if (pp) await pp.close();
  });
  // 5.1 widget
  await withPage(env, { id: "5.1", noStub: true, realPartner: true }, async (page) => {
    await page.goto(SBER, { waitUntil: "load" });
    await page.evaluate(() => document.querySelector("details:has(#wl-open)")?.setAttribute("open", ""));
    await page.click("#wl-open");
    const t0 = Date.now();
    const ok = await page.waitForFunction(() => { const f = document.getElementById("wl-frame"); return f && !f.hidden && (f.querySelector("iframe") || f.querySelector("form, input, button, [class*=calc]")); }, null, { timeout: 15000 }).then(() => true).catch(() => false);
    const txt = await page.textContent("#wl-open");
    const frameInfo = await page.evaluate(() => { const f = document.getElementById("wl-frame"); return { hidden: f?.hidden, iframes: f ? f.querySelectorAll("iframe").length : -1, html: f ? f.innerHTML.length : -1 }; });
    rec(E, "5.1", ok, `окно за ${Date.now() - t0} мс: ${ok}; кнопка «${txt?.trim()}»; iframe: ${frameInfo.iframes}, html ${frameInfo.html} симв.`);
    const fallback = await page.evaluate(() => ({ wl: !!document.querySelector("a[data-widget-link]"), pampadu: !!document.querySelector("a[data-partner-alt]") }));
    rec(E, "5.3", fallback.wl && fallback.pampadu, `запасные ссылки: Полис812 ${fallback.wl}, Пампаду ${fallback.pampadu}`);
    if (E !== "F") { const m = await page.evaluate(() => { const f = document.getElementById("wl-frame"); const r = f?.getBoundingClientRect(); return r ? Math.round(r.right - innerWidth) : 0; }); rec(E, "5.4", m <= 1, `рамка выходит за экран на ${m}px`); }
  });
  // 6. ics
  await withPage(env, { id: "6.x", ctx: { acceptDownloads: true } }, async (page) => {
    await page.goto(SITE + "/strahovka-ipoteki-vtb/", { waitUntil: "load" });
    await page.fill("#remind-date", "2027-03-01");
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 8000 }).catch(() => null), page.click('#remind-form button[type="submit"]')]);
    let body = "";
    if (dl) { const p = await dl.path(); body = fs.readFileSync(p, "utf8"); }
    rec(E, "6.1", !!dl && /\.ics$/.test(dl.suggestedFilename()), dl ? `файл ${dl.suggestedFilename()}, ${body.length} байт` : "скачивание не началось (на WebKit-эмуляции download может не срабатывать)");
    const okIcs = /BEGIN:VCALENDAR/.test(body) && /DTSTART;VALUE=DATE:20270215/.test(body) && /VALARM/.test(body) && /[А-Яа-я]/.test(body) && !/\?\?\?/.test(body);
    rec(E, "6.2", body ? okIcs : null, body ? `событие 15.02.2027 (за 14 дней), VALARM, русский текст: ${okIcs}` : "нет файла для проверки; открытие в календаре телефона — вручную");
    await page.fill("#remind-date", "2020-01-01"); let dl2 = null; await Promise.all([page.waitForEvent("download", { timeout: 3000 }).then(d => { dl2 = d; }).catch(() => null), page.click('#remind-form button[type="submit"]')]);
    const hint = await page.evaluate(() => document.getElementById("remind-date").validationMessage);
    rec(E, "6.3", dl2 === null && !!hint, dl2 ? "файл создаётся для даты в прошлом" : `файл не создан, подсказка: «${hint}»`);
    const goals = await page.evaluate(() => (window.__ym || []).filter(a => a[0] === "reachGoal" && a[1] === "reminder_ics").length);
    rec(E, "6.4", goals === 1, `reminder_ics засчитан ${goals} раз (валидный клик один)`);
  });
  // 7. ostatok
  await withPage(env, { id: "7.x" }, async (page) => {
    await page.goto(SITE + "/ostatok-dolga/", { waitUntil: "load" });
    const set = async (id, v) => { await page.evaluate(([id, v]) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("blur", { bubbles: true })); }, [id, v]); };
    const y = new Date(); const start = `${y.getFullYear() - 1}-${String(y.getMonth() + 1).padStart(2, "0")}-01`;
    await set("an-sum", "3000000"); await set("an-rate", "10"); await set("an-years", "20"); await set("an-start", start);
    const r1 = await page.evaluate(() => ({ pay: document.getElementById("an-pay")?.textContent, big: document.getElementById("an-big")?.textContent }));
    const pay = Number((r1.pay || "").replace(/\D/g, "")), big = Number((r1.big || "").replace(/\D/g, ""));
    rec(E, "7.1", pay > 28000 && pay < 30000 && big > 0 && big < 3000000, `платёж ${r1.pay}, остаток ${r1.big}`);
    await set("an-rate", "10.5"); const b = await page.evaluate(() => document.getElementById("an-pay")?.textContent);
    const acceptsComma = await page.evaluate(() => { const e = document.getElementById("an-rate"); e.value = "10,5"; return e.value; });
    rec(E, "7.2", Number(String(b).replace(/\D/g, "")) > 0, `«10.5» → ${b}; поле числовое, запятую браузер ${acceptsComma ? "принял" : "отбросил (системная клавиатура телефона подставляет точку)"}`);
    await set("an-rate", "0"); await set("an-years", "0"); await set("an-date", "2000-01-01");
    const bad = await page.evaluate(() => /NaN|Infinity|∞/.test(document.getElementById("annuity").innerText));
    rec(E, "7.3", !bad, bad ? "есть NaN или Infinity" : "нет NaN и Infinity");
    const has = await page.evaluate(() => !!document.querySelector('#annuity a[href*="strahovka"], #annuity button'));
    rec(E, "7.4", null, has ? "кнопка переноса есть, перенос проверить вручную" : "кнопки переноса нет");
  });
  // 8. navigation (только на одном окружении крупные проверки)
  await withPage(env, { id: "8.x" }, async (page) => {
    if (E === "F") {
      const seen = new Set(), bad = [];
      const q = ["/", "/banki/", "/strahovka-ipoteki-vtb/", "/akkreditovannye-strahovye-vtb/", "/strahovka-ipoteki-sogaz/"];
      for (const path of q) { await page.goto(SITE + path, { waitUntil: "load" }); const links = await page.$$eval('a[href^="/"]', a => [...new Set(a.map(x => x.getAttribute("href")))]); for (const l of links) { const p = l.split("#")[0]; if (!p || seen.has(p)) continue; seen.add(p); const r = await page.request.get(SITE + p).catch(() => null); if (!r || !r.ok()) bad.push(p + ":" + (r ? r.status() : "err")); } }
      rec(E, "8.1", bad.length === 0, `проверено ${seen.size} внутренних ссылок, битых ${bad.length}${bad.length ? ": " + bad.slice(0, 5).join(", ") : ""}`);
    }
    const banks = [["vtb", "2"], ["alfa-bank", "9"], ["t-bank", "73"]]; const rr = [];
    for (const [slug, id] of banks) { await page.goto(SITE + "/strahovka-ipoteki-" + slug + "/", { waitUntil: "load" }); const b = await page.evaluate(() => document.getElementById("pform")?.dataset.bankId); rr.push(slug + "=" + b + (b === id ? "" : "≠" + id)); }
    rec(E, "8.2", rr.every(s => !/≠/.test(s)), rr.join(", "));
    await page.goto(SBER, { waitUntil: "load" });
    const nav = await page.evaluate(() => { const n = document.querySelector(".site-nav"); const r = n?.getBoundingClientRect(); const links = n ? [...n.querySelectorAll("a")].map(a => a.getBoundingClientRect()) : []; return { exists: !!n, visible: r ? r.height > 0 : false, small: links.filter(l => l.height < 32).length, total: links.length, burger: !!document.querySelector("button[aria-label*='еню'], .burger, .menu-toggle") }; });
    rec(E, "8.3", nav.exists && nav.visible, `меню всегда видно (без бургера): ${nav.visible}; ссылок ${nav.total}, ниже 32px высотой: ${nav.small}`);
    const pages = ["/strahovka-ipoteki-sberbank/", "/strahovka-ipoteki-sogaz/", "/banki/", "/akkreditovannye-strahovye-vtb/"]; const ov = [];
    for (const p of pages) { await page.goto(SITE + p, { waitUntil: "load" }); const o = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth); if (o > 1) ov.push(p + ":" + o + "px"); }
    rec(E, "8.4", ov.length === 0, ov.length ? "горизонтальная прокрутка: " + ov.join(", ") : "4 страницы без горизонтальной прокрутки");
    await page.goto(SBER, { waitUntil: "load" });
    const foot = await page.evaluate(() => ({ op: /ИП Роман/.test(document.body.innerText) && /ИНН/.test(document.body.innerText), pol: !!document.querySelector('footer a[href*="privacy"]') }));
    const pr = await page.goto(SITE + "/privacy/", { waitUntil: "load" });
    const polText = await page.evaluate(() => ({ m: /Метрик/.test(document.body.innerText), p: /Полис812|партн/i.test(document.body.innerText) }));
    rec(E, "8.5", foot.op && foot.pol && pr.ok() && polText.m && polText.p, `оператор: ${foot.op}, ссылка: ${foot.pol}, политика ${pr.status()}, Метрика: ${polText.m}, партнёр: ${polText.p}`);
    await page.goto(SBER, { waitUntil: "load" }); await fillCalc(page, { balance: "1200000", age: "29", sex: "f" });
    await page.goto(SITE + "/banki/", { waitUntil: "load" }); await page.goBack({ waitUntil: "load" });
    const back = await page.evaluate(() => ({ bal: document.getElementById("balance").value.replace(/\D/g, ""), age: document.getElementById("age").value }));
    rec(E, "8.7", back.bal === "1200000" && back.age === "29", `после «назад»: остаток ${back.bal}, возраст ${back.age} (браузер восстанавливает поля формы: ${back.bal === "1200000"})`);
  });
  // 9.1 landing pages from Direct
  await withPage(env, { id: "9.1" }, async (page) => {
    const lands = ["/strahovka-ipoteki-vtb/", "/strahovka-ipoteki-sberbank/", "/akkreditovannye-strahovye-vtb/", "/strahovka-ipoteki-alfa-bank/", "/strahovka-ipoteki-dom-rf/", "/prodlit-strahovku-ipoteki/", "/kalkulyator-strahovaniya-ipoteki/", "/strahovka-ipoteki-sogaz/", "/strahovka-ipoteki-vsk/", "/strahovka-ipoteki-rosgosstrah/"];
    const bad = [];
    for (const l of lands) { const t0 = Date.now(); const r = await page.goto(SITE + l + "?utm_source=yandex&utm_medium=cpc&utm_campaign=search_banks&utm_content=1&utm_term=t", { waitUntil: "load" }); const ms = Date.now() - t0; const has = await page.evaluate(() => !!document.getElementById("pform")); if (!r.ok() || !has || ms > 2500) bad.push(`${l} ${r.status()} ${ms}мс form:${has}`); }
    rec(E, "9.1", bad.length === 0, bad.length ? bad.join("; ") : "10 посадочных: 200, форма есть, загрузка до 2,5 с");
  });
  // 10. Отказы
  await withPage(env, { id: "10.1", route: { pattern: /polis812\.ru/, handler: r => r.abort() } }, async (page, ctx) => {
    await page.goto(SBER, { waitUntil: "load" }); await fillCalc(page);
    const [pp] = await Promise.all([ctx.waitForEvent("page", { timeout: 6000 }).catch(() => null), page.click("#p-submit")]);
    await page.waitForTimeout(1000);
    const st = await page.evaluate(() => ({ dis: document.getElementById("p-submit").disabled, pampadu: !!document.querySelector("a[data-partner-alt]"), spinner: /Считаем цены/.test(document.body.innerText) }));
    rec(E, "10.1", !st.dis && st.pampadu && !st.spinner, `партнёр недоступен: вкладка открылась ${!!pp}, кнопка активна ${!st.dis}, ссылка на Пампаду ${st.pampadu}, зависания нет ${!st.spinner}`);
    if (pp) await pp.close();
  });
  await withPage(env, { id: "10.2", noStub: true, route: { pattern: /mc\.yandex\.ru|yandex\.ru\/metrika/, handler: r => r.abort() } }, async (page, ctx) => {
    await page.goto(SBER, { waitUntil: "load" }); await fillCalc(page);
    const price = await page.evaluate(() => document.getElementById("r-indep")?.textContent);
    const [pp] = await Promise.all([ctx.waitForEvent("page", { timeout: 6000 }).catch(() => null), page.click("#calc a.cta[data-partner]")]);
    rec(E, "10.2", !!price && !!pp, `Метрика заблокирована: калькулятор считает (${price}), партнёр открывается ${!!pp}`); if (pp) await pp.close();
  });
  await withPage(env, { id: "10.3", ctx: { javaScriptEnabled: false } }, async (page) => {
    await page.goto(SBER, { waitUntil: "load" });
    const s = await page.evaluate(() => ({ text: document.body.innerText.length, partner: !!document.querySelector('a[href*="polis812.ru"], a[data-partner]'), calcText: /Показать/.test(document.body.innerText) }));
    rec(E, "10.3", s.text > 2000 && s.partner, `без JS: текста ${s.text} символов, ссылка на партнёра есть: ${s.partner}`);
  });
  await withPage(env, { id: "10.4" }, async (page, ctx) => {
    await page.goto(SBER, { waitUntil: "load" }); await fillCalc(page);
    const pages = []; ctx.on("page", p => pages.push(p));
    await page.click("#p-submit", { clickCount: 2 }); await page.click("#p-submit");
    await page.waitForTimeout(3000);
    const goals = await page.evaluate(() => (window.__ym || []).filter(a => a[0] === "reachGoal" && a[1] === "partner_click").length);
    rec(E, "10.4", pages.length === 1 && goals === 1, `два клика → вкладок ${pages.length}, целей partner_click ${goals}`);
    for (const p of pages) await p.close().catch(() => {});
  });
  // 11 backend
  if (E === "F") { const r = await fetch("https://api.polis-godovshchina.ru/quote.php", { method: "POST" }).then(r => r.status).catch(e => "нет хоста"); rec(E, "11.1", null, `бэкенд не развёрнут: ${r}`); }
}

fs.writeFileSync("results.json", JSON.stringify(R, null, 1));
const pass = R.filter(r => r.ok === true).length, fail = R.filter(r => r.ok === false).length, skip = R.filter(r => r.ok === null).length;
console.log(`\nИТОГО: прошло ${pass}, не прошло ${fail}, без проверки ${skip}`);
