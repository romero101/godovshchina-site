// Генерирует docs/test-cases.md из единого источника docs/test-cases.html (массивы SECTIONS, ENVS, KEY).
// Запуск: node tools/gen_testcases.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(REPO, "docs/test-cases.html"), "utf8");
const m = html.match(/const SECTIONS = (\[[\s\S]*?\n\]);\nconst ENVS = (\[[\s\S]*?\n\]);\nconst KEY = (\[.*?\]);\nconst EXT_ONLY = (\[.*?\]);/);
if (!m) throw new Error("не нашёл массивы SECTIONS/ENVS/KEY/EXT_ONLY в docs/test-cases.html");
const SECTIONS = eval(m[1]), ENVS = eval(m[2]), KEY = eval(m[3]), EXT_ONLY = eval(m[4]);
const version = (html.match(/версия (\d+) от ([^·<]+)/) || ["", "?", "?"]);
const changelog = [...html.matchAll(/<li><b>(v\d+, [^<]+)<\/b>\s*([\s\S]*?)<\/li>/g)].map(x => "- **" + x[1] + "** " + x[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());

const MODE = { A: "авто", M: "руками", AM: "авто + руками" }, WHEN = { R: "релиз", M: "месяц", O: "разово" };
let n = 0, k = 0, a = 0;
let md = `# Тест-кейсы сайта polis-godovshchina.ru\n\nВерсия ${version[1]} от ${version[2].trim()}. Файл сгенерирован из \`docs/test-cases.html\` (единый источник: из него же публикуется чек-лист с чекбоксами «Тест-кейсы Годовщины»). Правки вносить в HTML, затем \`node tools/gen_testcases.mjs\`.\n\n`;
md += `Приоритет: **К** критично (выкладка запрещена, пока не зелёные), **В** важно, **Ж** желательно. Режим: **авто** гоняет \`tests/e2e/run.mjs\`, **руками** проходит Роман. Когда: **релиз** перед каждой выкладкой, **месяц** раз в месяц, **разово** один раз и после изменения соответствующей части.\n\n`;
md += `Тестовые данные: остаток 2 500 000 ₽, возраст 40, мужчина, дата рождения 15.03.1986, банк той страницы. Второй набор: 1 200 000 ₽, 29 лет, женщина.\n\nПрогон: \`tools/release.sh\` (локальная сборка → критические → push → дымовой прогон на живом), \`MODE=monthly node tests/e2e/run.mjs\` раз в месяц.\n\n`;
for (const s of SECTIONS) {
  md += `## ${s.n}. ${s.t}\n\n| № | Пр. | Режим | Когда | Действие | Ожидается |\n|---|---|---|---|---|---|\n`;
  for (const [id, mode, pr, when, act, exp, later] of s.cases) { n++; if (pr === "К") k++; if (mode !== "M") a++; md += `| ${id} | ${pr} | ${MODE[mode]}${later ? " (" + later + ")" : ""} | ${WHEN[when]} | ${act} | ${exp} |\n`; }
  md += "\n";
}
md += `Итого: ${n} кейсов, критичных ${k}, с автоматической частью ${a}.\n\n## Матрица окружений\n\nКлючевые кейсы: ${KEY.join(", ")}; расширенный ряд только ${EXT_ONLY.join(", ")}. Строки A, D, F закрывает автопрогон. Состав рядов пересматривается раз в месяц по отчёту Метрики «Технологии → Браузеры».\n`;
for (const e of ENVS) { if (e.tier) { md += `\n**${e.tier}**\n\n`; continue; } md += `- **${e[0]}.** ${e[1]}${e[2] ? " — " + e[2] : ""}\n`; }
md += `\n## История версий\n\n${changelog.join("\n")}\n`;
fs.writeFileSync(path.join(REPO, "docs/test-cases.md"), md);
console.log(`docs/test-cases.md: версия ${version[1]}, кейсов ${n}, критичных ${k}, авто ${a}`);
