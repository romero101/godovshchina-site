# -*- coding: utf-8 -*-
"""Генератор банковских страниц «Страховка ипотеки в <банке>» + сводная /banki/.
Запуск: python3 tools/gen_banks.py  (из корня сайта). Перезаписывает страницы банков и banki/index.html.
Данные по банкам — ниже, в BANKS. Коды банков — из выдачи партнёра Полис812.
"""
import base64, json, os, re, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATE_ISO, DATE_RU = "2026-09-05", "5 сентября 2026"
PARTNER, YM = "212866", "112294423"
COLORS = "%7B%22primary%22%3A%22%230B7A5B%22%2C%22secondary%22%3A%22%2314946F%22%2C%22accent%22%3A%22%2314213D%22%2C%22accentHover%22%3A%22%232A3B63%22%2C%22calculatorBlock1%22%3A%22%23F4F6F9%22%2C%22calculatorBlock2%22%3A%22%23D9F0E7%22%2C%22secondaryLight%22%3A%22%23FFFFFF%22%2C%22accentHoverLight%22%3A%22%239094a2%22%2C%22accentActive%22%3A%22%23121e37%22%2C%22calculatorBlock%22%3A%22%23F4F6F9%22%2C%22optionColor%22%3A%7B%22name%22%3A%22%D0%A7%D0%B5%D1%80%D0%BD%D1%8B%D0%B9%22%2C%22val%22%3A%22%23303030%22%7D%2C%22backgroundColor%22%3A%22%23F7F8FA%22%7D"
FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='12' fill='%230B7A5B'/%3E%3Ctext x='32' y='44' text-anchor='middle' font-family='Arial,sans-serif' font-weight='700' font-size='36' fill='white'%3EГ%3C/text%3E%3C/svg%3E"
FONTS = "https://fonts.googleapis.com/css2?family=Manrope:wght@700;800&amp;family=IBM+Plex+Sans:wght@400;500;700&amp;family=IBM+Plex+Mono:wght@400;500&amp;display=swap"
CSS_V, JS_V, MET_V = "9", "10", "2"

# slug, name, gen (кого/чего), loc (в ком/чём), polis_id, uplift_default, uplift_options[(value,label)],
# uplift_text (фраза для текста), upload (как передать полис), cabinet (короткое имя канала), notes (особенности, список)
BANKS = [
    dict(slug="vtb", name="ВТБ", gen="ВТБ", loc="в ВТБ", pid="2", up="1",
         opts=[("1", "+1 % — стандартная надбавка ВТБ"), ("2", "+2 % — если отказались и от жизни, и от титула")],
         uptext="ставка выше на 1 п.п.; за отказ от титульного страхования — ещё на 1 п.п.",
         upload="Полис и чек загрузите в приложении ВТБ Онлайн в разделе вашей ипотеки (страхование) или отправьте в чат поддержки; принимают и в офисе. Проверка обычно занимает до трёх рабочих дней.",
         cabinet="ВТБ Онлайн",
         notes=["За отказ от страхования жизни и от титула надбавки суммируются: по 1 п.п. за каждое.",
                "В первые 14 дней после покупки дорогой полис банка можно расторгнуть и купить дешевле у аккредитованной компании."]),
    dict(slug="alfa-bank", name="Альфа-Банк", gen="Альфа-Банка", loc="в Альфа-Банке", pid="9", up="1",
         opts=[("1", "+1 % — по большинству программ"), ("2", "+2 % — по части программ"), ("3", "+3 % — максимум, встречается в договорах")],
         uptext="ставка выше на 1–3 п.п. в зависимости от программы; точная цифра — в вашем договоре",
         upload="Электронного полиса достаточно: загрузите PDF полиса и чек в Альфа-Онлайн в разделе ипотеки (страхование) или отправьте в чат. Обычно проверяют за 1–3 рабочих дня.",
         cabinet="Альфа-Онлайн",
         notes=["Разброс надбавки у Альфа-Банка самый широкий на рынке — смотрите пункт договора о процентной ставке.",
                "Полис любой аккредитованной компании банк обязан принять, если он соответствует требованиям к покрытию."]),
    dict(slug="sovcombank", name="Совкомбанк", gen="Совкомбанка", loc="в Совкомбанке", pid="34", up="1",
         opts=[("1", "+1 % — ориентир по договорам Совкомбанка"), ("1.5", "+1,5 %"), ("2", "+2 % — если так в вашем договоре")],
         uptext="банк повышает ставку по договору, чаще всего на 1 п.п.; проверьте свой договор",
         upload="Полис и чек передайте через приложение «Халва — Совкомбанк» (раздел ипотеки) или в отделение. Страховая компания должна иметь рейтинг не ниже ruA-.",
         cabinet="приложение Халва — Совкомбанк",
         notes=["Требование к страховой: кредитный рейтинг не ниже ruA- — все компании в выдаче партнёра ему соответствуют.",
                "Аккредитованные, по данным партнёра: Совкомбанк Страхование, АльфаСтрахование, РЕСО-Гарантия, ВСК, Ренессанс, Согласие и другие."]),
    dict(slug="rosselhozbank", name="Россельхозбанк", gen="Россельхозбанка", loc="в Россельхозбанке", pid="30", up="1",
         opts=[("1", "+1 % — по большинству программ"), ("2", "+2 %"), ("3.5", "+3,5 % — по отдельным программам")],
         uptext="ставка выше на 1–2 п.п. по большинству программ, по отдельным — до 3,5 п.п.",
         upload="Страховая компания сама банк не уведомляет: полис и чек нужно передать в отделение РСХБ или через дистанционный канал банка. Электронный полис принимают.",
         cabinet="отделение или личный кабинет РСХБ",
         notes=["По сельской ипотеке надбавка за отказ от добровольного страхования отдельная и небольшая — смотрите условия программы.",
                "Передать полис в банк — обязанность заёмщика, страховая этого не делает."]),
    dict(slug="t-bank", name="Т-Банк", gen="Т-Банка", loc="в Т-Банке", pid="73", up="1",
         opts=[("1", "+1 % — ориентир по договорам Т-Банка"), ("1.5", "+1,5 %"), ("2", "+2 % — если так в вашем договоре")],
         uptext="без полиса ставка выше — точную надбавку смотрите в договоре, ориентир 1 п.п.",
         upload="Всё в приложении Т-Банка: напишите в чат и прикрепите PDF полиса и чек. Подключить или заменить страховку можно в любой момент.",
         cabinet="чат в приложении Т-Банка",
         notes=["Т-Банк принимает документы только дистанционно — офисов нет, всё через чат приложения.",
                "Полис из выдачи партнёра оформляется онлайн и приходит на e-mail — его же и отправляете в чат."]),
    dict(slug="dom-rf", name="Банк ДОМ.РФ", gen="Банка ДОМ.РФ", loc="в Банке ДОМ.РФ", pid="16", up="0.7",
         opts=[("0.7", "+0,7 % — стандартная надбавка ДОМ.РФ"), ("1", "+1 % — если так в вашем договоре")],
         uptext="ставка выше на 0,7 п.п. — одна из самых низких надбавок на рынке",
         upload="Загрузите полис и чек в личном кабинете ипотеки Банка ДОМ.РФ (раздел страхования) — это самый быстрый путь; принимают и в офисе.",
         cabinet="личный кабинет ипотеки ДОМ.РФ",
         notes=["Из-за низкой надбавки для заёмщиков старше 45–50 лет отказ от страхования жизни у ДОМ.РФ бывает выгоднее полиса — проверьте в калькуляторе.",
                "Отказ от титульного страхования на ставку не влияет."]),
    dict(slug="gazprombank", name="Газпромбанк", gen="Газпромбанка", loc="в Газпромбанке", pid="4", up="1",
         opts=[("1", "+1 % — стандартная надбавка Газпромбанка"), ("1.5", "+1,5 % — если так в вашем договоре")],
         uptext="ставка выше на 1 п.п.",
         upload="Сканы полиса и чека отправьте на e-mail банка, указанный в договоре, или через ГПБ Мобайл, а потом позвоните и убедитесь, что данные внесли. Страховая сумма у Газпромбанка — остаток долга плюс проценты за год.",
         cabinet="e-mail банка или ГПБ Мобайл",
         notes=["Страховая сумма должна равняться остатку долга плюс годовые проценты — партнёрская форма учитывает это по коду банка.",
                "Франшиза в полисе не допускается; выгодоприобретатель — Газпромбанк."]),
    dict(slug="psb", name="ПСБ", gen="ПСБ", loc="в ПСБ", pid="28", up="2",
         opts=[("2", "+2 % — стандартная надбавка ПСБ"), ("1", "+1 % — если так в вашем договоре")],
         uptext="ставка выше на 2 п.п. — одна из самых высоких надбавок",
         upload="Полис и чек передайте через ПСБ Мобайл, на e-mail банка или в офис. Страховая должна иметь рейтинг не ниже ruA- (Эксперт РА) или A-(RU) (АКРА).",
         cabinet="ПСБ Мобайл",
         notes=["С надбавкой 2 п.п. полис выгоднее отказа почти в любом возрасте — экономия видна в калькуляторе.",
                "Требование к рейтингу страховой — не ниже ruA-/A-(RU); в выдаче партнёра такие компании отмечены как аккредитованные."]),
    dict(slug="uralsib", name="Уралсиб", gen="Уралсиба", loc="в Уралсибе", pid="12", up="1",
         opts=[("1", "+1 % — ориентир по договорам Уралсиба"), ("1.5", "+1,5 %"), ("2", "+2 % — если так в вашем договоре")],
         uptext="без полиса ставка выше — размер надбавки закреплён в договоре, ориентир 1 п.п.",
         upload="Продлённый полис и чек передайте в отделение Уралсиба или через личный кабинет; порядок описан в разделе «Ипотечное страхование» на сайте банка.",
         cabinet="отделение или личный кабинет Уралсиба",
         notes=["Уралсиб принимает полисы аккредитованных компаний; перед оплатой убедитесь, что страховая в списке банка.",
                "Продлевать полис нужно до окончания предыдущего — иначе банк вправе применить повышенную ставку."]),
    dict(slug="mkb", name="МКБ", gen="МКБ", loc="в МКБ", pid="39", up="1",
         opts=[("1", "+1 % — ориентир по договорам МКБ"), ("1.5", "+1,5 %"), ("2", "+2 % — если так в вашем договоре")],
         uptext="без полиса ставка выше — размер надбавки закреплён в договоре, ориентир 1 п.п.",
         upload="Полис и чек загрузите в приложении МКБ Онлайн или передайте в офис банка. Электронный полис принимают.",
         cabinet="МКБ Онлайн",
         notes=["Страховая сумма — не меньше остатка долга на дату продления; остаток берите из приложения банка.",
                "Полис любой аккредитованной МКБ компании банк обязан принять."]),
]

def b64(s):  # как у партнёра: base64 от строки параметров
    return base64.b64encode(s.encode("utf-8")).decode("ascii")

def wl_params(pid):
    return b64(f"bank_id={pid}&debt=3000000&object_type=flat&sex=male")

def wl_link(b):
    title = urllib.parse.quote(f"Сравните цены аккредитованных страховых для ипотеки {b['gen']}")
    sub = urllib.parse.quote(f"Цена — по тарифу страховой, без наценки. Полис принимает {b['name']}")
    return (f"https://polis812.ru/mortgage/wl/?params={wl_params(b['pid'])}&whiteLabel=true&type=mortgage&title={title}"
            f"&subtitle={sub}&showCompanies=false&theme=custom&colors={COLORS}&partner={PARTNER}&partnerYmId={YM}")

def wl_script(b):
    return (f'<script data-params="{wl_params(b["pid"])}" data-white-label="true" data-type="mortgage" '
            f'data-title="Сравните цены аккредитованных страховых для ипотеки {b["gen"]}" '
            f'data-subtitle="Цена — по тарифу страховой, без наценки. Полис принимает {b["name"]}" '
            f'data-show-companies="false" data-theme="custom" data-colors="{COLORS}" data-partner="{PARTNER}" '
            f'data-partner-ym-id="{YM}" type="application/javascript" src="https://polis812.ru/wl/loader.js"></script>')

def pct(v):
    return v.replace(".", ",")

def head(title, desc, path, ld_blocks, noindex=False):
    url = f"https://polis-godovshchina.ru{path}"
    ld = "\n".join(f'<script type="application/ld+json">\n{json.dumps(x, ensure_ascii=False)}\n</script>' for x in ld_blocks)
    return f'''<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{url}">
{'<meta name="robots" content="noindex">' if noindex else ''}
<meta property="og:type" content="website">
<meta property="og:locale" content="ru_RU">
<meta property="og:url" content="{url}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:site_name" content="Годовщина">
<meta property="og:image" content="https://polis-godovshchina.ru/assets/img/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://polis812.ru">
<link rel="stylesheet" href="{FONTS}">
<link rel="stylesheet" href="/assets/style.css?v={CSS_V}">
<link rel="icon" href="{FAVICON}">
<meta name="yandex-verification" content="91ee931dc425b640">
{ld}
</head>
<body>
'''

def header(active=""):
    return '''<header class="site-head">
  <div class="wrap">
    <a class="brand" href="/">Годов<span>щина</span></a>
    <nav class="site-nav" aria-label="Разделы">
      <a href="/strahovka-ipoteki-sberbank/">Сбербанк</a>
      <a href="/banki/">Все банки</a>
      <a href="/strahovanie-zhizni-ipoteka-sberbank/">Страхование жизни</a>
      <a href="/ostatok-dolga/">Остаток долга</a>
    </nav>
  </div>
</header>
'''

FOOTER = '''<footer class="site-foot">
  <div class="wrap">
    <p>Годовщина — независимый сервис для заёмщиков. Мы не страховая компания и не банк: расчёт цен и оформление полисов выполняют аккредитованные страховые компании через партнёрскую платформу; за оформленный полис сервис получает вознаграждение от страховой, для вас цена не меняется.</p>
    <p><a href="/privacy/">Политика конфиденциальности</a>. Информация не является офертой; условия по вашему кредитному договору уточняйте в банке.</p>
  </div>
</footer>
<script src="/assets/calc.js?v=%s"></script>
<script src="/assets/metrika.js?v=%s"></script>
</body>
</html>
''' % (JS_V, MET_V)

def reminder_block(bank_name):
    return f'''  <div class="callout tool" id="remind">
    <p><strong>Напоминание о годовщине.</strong> Полис нужно оплатить и передать в банк до окончания прошлого — а проверка идёт до трёх рабочих дней. Поставьте напоминание в календарь за две недели.</p>
    <form class="remind" id="remind-form" data-bank="{bank_name}">
      <label>Когда заканчивается текущий полис <input type="date" id="remind-date" required></label>
      <button type="submit" class="cta inline">Добавить в календарь (.ics)</button>
    </form>
    <p class="note">Файл откроется в Календаре iPhone, Google Календаре или Outlook. Ничего никуда не отправляется — файл создаётся у вас в браузере.</p>
  </div>
'''

def bank_page(b, i):
    name, gen, loc = b["name"], b["gen"], b["loc"]
    path = f"/strahovka-ipoteki-{b['slug']}/"
    title = f"Страховка ипотеки {loc[2:] if loc.startswith('в ') else loc} {name if False else ''}".strip()
    title = f"Страховка ипотеки {loc}: полис или надбавка к ставке, где дешевле — 2026"
    desc = f"Страхование ипотеки {gen}: при отказе от страховки жизни {b['uptext']}. Калькулятор «полис или надбавка», цены аккредитованных страховых и как передать полис в банк."
    opts = "\n".join(f'            <option value="{v}"{" selected" if v == b["up"] else ""}>{lab}</option>' for v, lab in b["opts"])
    others = [x for x in BANKS if x["slug"] != b["slug"]]
    rel = others[i % len(others):][:2] + others[:2]
    rel = [x for j, x in enumerate(rel) if x["slug"] not in [y["slug"] for y in rel[:j]]][:2]
    faq = [
        (f"Обязательно ли страховать жизнь по ипотеке {gen}?", f"Нет. По закону об ипотеке обязательно только страхование самой квартиры. Страхование жизни добровольное, но при отказе {b['uptext']}. Для большинства заёмщиков до 45–50 лет полис у аккредитованной страховой дешевле надбавки."),
        (f"Можно ли купить страховку не у страховой компании банка?", f"Да. Заёмщик вправе оформить полис в любой компании, аккредитованной {gen}, и банк обязан его принять. У независимых компаний то же покрытие обычно стоит на 30–60 % дешевле, чем у страховщика банка."),
        (f"Как передать полис {loc}?", b["upload"]),
        ("Что будет, если не продлить страховку вовремя?", "Банк вправе применить повышенную ставку и начислить неустойку по договору. Новый полис должен начать действовать не позже даты окончания старого, поэтому считайте цену за 2–4 недели до годовщины и ставьте напоминание."),
    ]
    ld_faq = {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faq]}
    faq_html = "\n".join(f"    <details><summary>{q}</summary><p>{a}</p></details>" for q, a in faq)
    notes_html = "\n".join(f"    <li>{n}</li>" for n in b["notes"])
    rel_html = "\n".join(f'    <a href="/strahovka-ipoteki-{x["slug"]}/">Страховка ипотеки {x["loc"]}<small>Надбавка, цены, куда передать полис</small></a>' for x in rel)
    up_default = pct(b["up"])
    body = f'''{header()}
<main>
<section class="hero">
  <div class="wrap grid">
    <div>
      <div class="eyebrow">Ипотека {gen} · обновлено <time datetime="{DATE_ISO}">{DATE_RU}</time></div>
      <h1 style="margin-top:10px">Страховка ипотеки {loc}: полис или надбавка к ставке?</h1>
      <p class="lede" style="margin-top:12px">Если отказаться от страховки жизни, {b['uptext']}. Полис у страховщика банка обычно дороже, чем у компаний из его же списка, на 30–60 %. Посчитайте, что выгоднее именно вам.</p>
      <div class="facts">
        <div class="fact"><b>+{up_default} %</b> к ставке за отказ</div>
        <div class="fact">полис <b>от 3 900 ₽</b> в год</div>
        <div class="fact">аккредитованные <b>{name}</b> страховые</div>
      </div>
    </div>

    <form class="calc" id="calc" onsubmit="return false" aria-labelledby="calc-title">
      <h2 id="calc-title">Посчитайте свой случай</h2>
      <p class="sub">Три цифры и ответ — за минуту, без регистрации.</p>
      <div class="row">
        <label class="full">Остаток по кредиту, ₽
          <input type="text" id="balance" value="3000000" inputmode="numeric" autocomplete="off">
          <input type="range" id="balance-range" min="300000" max="15000000" step="50000" value="3000000" aria-label="Остаток по кредиту">
        </label>
        <label>Возраст заёмщика
          <input type="number" id="age" value="35" min="18" max="70" inputmode="numeric">
        </label>
        <div class="field"><span class="lbl" id="sex-lbl">Пол</span>
          <div class="seg" id="sex" role="group" aria-labelledby="sex-lbl">
            <button type="button" data-v="m" aria-pressed="true">Мужской</button>
            <button type="button" data-v="f" aria-pressed="false">Женский</button>
          </div>
        </div>
        <label class="full">Надбавка к ставке, если отказаться от страховки жизни
          <select id="uplift">
{opts}
          </select>
        </label>
      </div>
      <noscript><p class="note">Калькулятору нужен JavaScript. Без него смотрите пример ниже или переходите к точным ценам по кнопке.</p></noscript>
      <div class="result" aria-live="polite" aria-atomic="true">
        <p class="k" id="big-k">Ваша экономия в год</p>
        <p class="big" id="big">0 ₽</p>
        <p class="verdict" id="verdict"></p>
        <div class="rows">
          <div class="rw" id="r-decline"><span>Отказаться от страховки</span><span class="v">0 ₽</span><div class="track"><div class="fill"></div></div></div>
          <div class="rw" id="r-captive"><span>Полис у страховщика банка</span><span class="v">0 ₽</span><div class="track"><div class="fill"></div></div></div>
          <div class="rw" id="r-indep"><span>Полис у страховой из списка банка</span><span class="v">0 ₽</span><div class="track"><div class="fill"></div></div></div>
        </div>
        <a class="cta" data-partner href="#oformit">Показать точные цены страховых →</a>
        <p class="trust"><span class="ad">Реклама</span>Цены и оформление — на сайте партнёра Полис812 (ООО «СВЦ ПОЛИС812»), форма ниже на этой странице. Цена — по тарифу страховой, без наценки сайта; показываются компании, аккредитованные {gen}.</p>
      </div>
      <details class="how">
        <summary>Как мы считаем</summary>
        <p>Оценка, не оферта. Тарифы страховых откалиброваны по реальным расчётам на 4 сентября 2026 г. (остаток 3 000 000 ₽, мужчина 27 лет — от 3 900 ₽, 40 лет — от 6 600 ₽ за жизнь и квартиру); для {gen} требования к покрытию могут немного менять цену. Полис страховщика банка принят за +50 % к цене независимой компании. Точную цену покажет расчёт по кнопке.</p>
      </details>
    </form>
  </div>
</section>

<section class="wrap narrow oformit" id="oformit">
  <h2>Точные цены аккредитованных страховых {gen} — за минуту</h2>
  <p>Три поля — и вы на списке цен страховых, чьи полисы принимает {name}, с выбором, оплатой и полисом на e-mail. Список откроется на сайте партнёра Полис812 в новой вкладке; данные с формы никуда, кроме партнёра, не уходят.</p>
  <form class="calc pform" id="pform" data-bank-id="{b['pid']}" aria-labelledby="pform-title">
    <h2 id="pform-title">Показать цены для моей ипотеки</h2>
    <p class="sub">{name}, квартира. Остаток и пол уже взяты из калькулятора выше.</p>
    <div class="row">
      <label class="full">Остаток по кредиту, ₽
        <input type="text" id="p-balance" inputmode="numeric" autocomplete="off" value="3 000 000">
      </label>
      <label>Дата рождения заёмщика
        <input type="date" id="p-dob" min="1940-01-01" max="2008-12-31" required>
      </label>
      <div class="field"><span class="lbl" id="p-sex-lbl">Пол</span>
        <div class="seg" id="p-sex" role="group" aria-labelledby="p-sex-lbl">
          <button type="button" data-v="m" aria-pressed="true">Мужской</button>
          <button type="button" data-v="f" aria-pressed="false">Женский</button>
        </div>
      </div>
    </div>
    <button type="submit" class="cta" id="p-submit">Показать цены страховых →</button>
    <p class="trust"><span class="ad">Реклама</span>ООО «СВЦ ПОЛИС812», ИНН 7807384453 (платформа Полис812). Цена — по тарифу страховой, без наценки сайта; вознаграждение сайту платит страховая, для вас цена не меняется.</p>
    <p class="note" id="p-err" hidden>Укажите дату рождения — от неё зависит цена страхования жизни.</p>
  </form>
  <details class="how" id="wl-inline">
    <summary>Или посчитать прямо здесь, не открывая новую вкладку</summary>
    <p>Окно партнёра весит несколько мегабайт и иногда открывается 5–10 секунд — поэтому мы не грузим его заранее.</p>
    <p><button type="button" class="cta inline" id="wl-open">Открыть окно расчёта на этой странице</button></p>
    <div class="widget-frame" id="wl-frame" hidden><p class="note" id="wl-wait" style="padding:14px">Окно партнёра загружается…</p></div>
    <p class="note">Не загрузилось — <a href="{wl_link(b)}" data-widget-link rel="nofollow sponsored noopener" target="_blank">откройте его в новой вкладке</a>.</p>
  </details>
  <template id="wl-loader">{wl_script(b)}</template>
</section>

<section class="wrap narrow">
  <div class="callout" id="summary">
    <p><strong>Коротко.</strong> Страховка ипотеки {loc} состоит из двух частей: страхование квартиры обязательно по закону, страхование жизни заёмщика — добровольно, но при отказе {b['uptext']}. Заёмщик вправе купить полис в любой страховой из списка аккредитованных {gen}, и банк обязан его принять; у таких компаний то же покрытие обычно на 30–60 % дешевле, чем у страховщика банка. Ориентир цены полиса «жизнь + квартира» при остатке 3 млн ₽ — от 3 900 ₽ в год для заёмщика 27 лет и от 6 600 ₽ для 40 лет (рыночные расчёты на 4 сентября 2026 г.). После оплаты полис и чек нужно передать в банк: {b['upload'][0].lower() + b['upload'][1:]}</p>
  </div>

  <h2>Как это работает</h2>
  <div class="steps">
    <div class="step"><div class="k">ШАГ 1</div><h3>Посчитайте</h3><p>Остаток долга берите из приложения банка на дату продления — от него зависит цена. Не знаете точный — <a href="/ostatok-dolga/">посчитайте по графику</a>.</p></div>
    <div class="step"><div class="k">ШАГ 2</div><h3>Сравните аккредитованных</h3><p>В выдаче партнёра по коду {gen} показываются только компании, чьи полисы банк принимает.</p></div>
    <div class="step"><div class="k">ШАГ 3</div><h3>Передайте полис в банк</h3><p>{b['cabinet'][0].upper() + b['cabinet'][1:]} — полис и чек. Страховая сама банк не уведомляет.</p></div>
  </div>

  <h2>Что обязательно, а что нет</h2>
  <div class="tblwrap"><table>
    <thead><tr><th>Вид страхования</th><th>По закону</th><th>На практике {loc}</th><th class="n">Доля в цене</th></tr></thead>
    <tbody>
      <tr><td>Квартира (конструктив)</td><td>обязательно</td><td>без полиса кредит не выдадут и не продлят</td><td class="n">≈ 20–30 %</td></tr>
      <tr><td>Жизнь и здоровье заёмщика</td><td>добровольно</td><td>{b['uptext'][0].upper() + b['uptext'][1:]}</td><td class="n">≈ 70–80 %</td></tr>
      <tr><td>Титул (право собственности)</td><td>добровольно</td><td>обычно только первые 3 года на вторичке</td><td class="n">отдельно</td></tr>
    </tbody>
  </table></div>

  <h2>Как передать полис {loc}</h2>
  <p>{b['upload']}</p>
  <ul>
{notes_html}
    <li>Проверьте три вещи до оплаты: страховая в списке аккредитованных {gen}; страховая сумма не меньше остатка долга; выгодоприобретатель — {name}.</li>
    <li>Дата начала нового полиса — не позже даты окончания старого. Иначе банк вправе применить повышенную ставку.</li>
  </ul>

{reminder_block(name)}

  <h2 id="faq">Вопросы</h2>
  <div class="faq">
{faq_html}
  </div>

  <h2>Читайте также</h2>
  <div class="related">
    <a href="/banki/">Все банки: надбавки и куда передать полис<small>Сводная таблица по 11 банкам</small></a>
{rel_html}
    <a href="/strahovanie-zhizni-ipoteka-sberbank/">Страхование жизни для ипотеки<small>Отказаться или купить дешевле: расчёт по возрасту</small></a>
  </div>
</section>
</main>

{FOOTER}'''
    return path, head(title, desc, path, [ld_faq]) + body

def banks_hub():
    path = "/banki/"
    title = "Страховка ипотеки по банкам: надбавка за отказ и куда передать полис — 2026"
    desc = "Сводная таблица по 11 банкам: на сколько выше ставка без страховки жизни, куда загружать полис другой страховой, ссылки на калькулятор «полис или надбавка» для каждого банка."
    rows = [f'      <tr><td><a href="/strahovka-ipoteki-sberbank/">Сбербанк</a></td><td>+1 п.п. (по части программ 1,5)</td><td>ДомКлик → «Загрузка полиса»</td></tr>']
    for b in BANKS:
        rows.append(f'      <tr><td><a href="/strahovka-ipoteki-{b["slug"]}/">{b["name"]}</a></td><td>{b["uptext"][0].upper() + b["uptext"][1:]}</td><td>{b["cabinet"][0].upper() + b["cabinet"][1:]}</td></tr>')
    cards = [f'    <a href="/strahovka-ipoteki-sberbank/">Сбербанк<small>Калькулятор и загрузка в ДомКлик</small></a>'] + [f'    <a href="/strahovka-ipoteki-{b["slug"]}/">{b["name"]}<small>+{pct(b["up"])} % за отказ · {b["cabinet"]}</small></a>' for b in BANKS]
    faq = [
        ("У какого банка самая маленькая надбавка за отказ от страховки жизни?", "Из крупных — у Банка ДОМ.РФ: 0,7 п.п. У Сбербанка, ВТБ и Газпромбанка — 1 п.п., у ПСБ — 2 п.п., у Альфа-Банка — от 1 до 3 п.п. в зависимости от программы."),
        ("Обязан ли банк принять полис другой страховой?", "Да, если компания аккредитована банком и полис соответствует требованиям к покрытию (страховая сумма, выгодоприобретатель, отсутствие франшизы). Требовать оформление только у своего страховщика банк не вправе."),
        ("Почему надбавка важнее цены полиса?", "Надбавка считается от всего остатка долга: при 3 млн ₽ и +1 п.п. это 30 000 ₽ в год, при +2 п.п. — 60 000 ₽. Полис жизни для заёмщика до 45 лет стоит 4–10 тыс. ₽. Чем выше надбавка банка, тем выгоднее полис."),
    ]
    ld = [{"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faq]},
          {"@context": "https://schema.org", "@type": "ItemList", "name": "Страховка ипотеки по банкам", "itemListElement": [{"@type": "ListItem", "position": 1, "url": "https://polis-godovshchina.ru/strahovka-ipoteki-sberbank/", "name": "Сбербанк"}] + [{"@type": "ListItem", "position": i + 2, "url": f"https://polis-godovshchina.ru/strahovka-ipoteki-{b['slug']}/", "name": b["name"]} for i, b in enumerate(BANKS)]}]
    body = f'''{header()}
<main class="wrap narrow">
  <section class="hero" style="background:none;padding-bottom:8px">
    <div class="eyebrow">11 банков · обновлено <time datetime="{DATE_ISO}">{DATE_RU}</time></div>
    <h1 style="margin-top:10px">Страховка ипотеки по банкам: надбавка за отказ и куда передать полис</h1>
    <p class="lede" style="margin-top:14px">Правило одно для всех: квартира — обязательно, жизнь — добровольно, но без полиса ставка выше. Различаются размер надбавки и то, куда нести полис. Выберите свой банк — калькулятор уже настроен под его условия.</p>
  </section>

  <div class="callout" id="summary" style="margin-top:20px">
    <p><strong>Коротко.</strong> Надбавка к ставке за отказ от страхования жизни у крупных банков в 2026 году: Банк ДОМ.РФ — 0,7 п.п.; Сбербанк, ВТБ, Газпромбанк — 1 п.п. (у Сбербанка по части программ 1,5); ПСБ — 2 п.п.; Альфа-Банк — от 1 до 3 п.п.; Россельхозбанк — 1–2 п.п., по отдельным программам до 3,5; Совкомбанк, Т-Банк, Уралсиб и МКБ закрепляют размер в договоре, ориентир 1 п.п. В любом банке заёмщик вправе купить полис у аккредитованной страховой, а не у страховщика банка, и передать его в банк сам: Сбербанк — через ДомКлик, ВТБ — ВТБ Онлайн, Альфа-Банк — Альфа-Онлайн, Т-Банк — чат приложения, Газпромбанк — e-mail банка, ДОМ.РФ — личный кабинет ипотеки.</p>
  </div>

  <h2>Сводная таблица</h2>
  <div class="tblwrap"><table>
    <thead><tr><th>Банк</th><th>Без страховки жизни</th><th>Куда передать полис</th></tr></thead>
    <tbody>
{chr(10).join(rows)}
    </tbody>
  </table></div>
  <p class="note">Надбавки — по договорам и публичным условиям банков на {DATE_RU}; точная цифра всегда в вашем кредитном договоре, в калькуляторе каждого банка её можно выбрать.</p>

  <h2>Калькуляторы по банкам</h2>
  <div class="related">
{chr(10).join(cards)}
  </div>

  <h2>Полезное для любого банка</h2>
  <div class="related">
    <a href="/ostatok-dolga/">Остаток долга на дату продления<small>Если под рукой нет приложения банка</small></a>
    <a href="/strahovanie-zhizni-ipoteka-sberbank/">Страхование жизни: отказаться или купить<small>Расчёт по возрасту</small></a>
    <a href="/kak-zagruzit-strahovku-v-domklik/">Как загрузить полис в ДомКлик<small>Пошагово, что делать, если не приняли</small></a>
  </div>

  <h2 id="faq">Вопросы</h2>
  <div class="faq">
{chr(10).join(f"    <details><summary>{q}</summary><p>{a}</p></details>" for q, a in faq)}
  </div>
</main>

{FOOTER}'''
    return path, head(title, desc, path, ld) + body

def ostatok_page():
    path = "/ostatok-dolga/"
    title = "Остаток долга по ипотеке на дату продления страховки: калькулятор — 2026"
    desc = "Посчитайте остаток основного долга по ипотеке на любую дату по сумме, ставке и сроку кредита. Нужен для страховой суммы при продлении полиса; учитывает аннуитетный график, без досрочных погашений."
    faq = [
        ("Зачем знать остаток долга для страховки?", "Страховая сумма в полисе ипотечного страхования равна остатку основного долга на дату продления (у некоторых банков — плюс проценты за год). Занизите — банк вернёт полис, завысите — переплатите за страховку."),
        ("Где взять точный остаток?", "В приложении банка или в графике платежей к договору. Этот калькулятор нужен, когда под рукой нет приложения: он считает по аннуитетной формуле и не знает о ваших досрочных погашениях."),
        ("Почему остаток уменьшается медленно?", "При аннуитете первые годы большая часть платежа уходит на проценты. При ставке 18 % и сроке 20 лет за первый год гасится лишь около 1 % долга — поэтому и цена страховки почти не падает."),
    ]
    ld = [{"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faq]}]
    body = f'''{header()}
<main class="wrap narrow">
  <section class="hero" style="background:none;padding-bottom:8px">
    <div class="eyebrow">Инструмент · обновлено <time datetime="{DATE_ISO}">{DATE_RU}</time></div>
    <h1 style="margin-top:10px">Остаток долга по ипотеке на дату продления страховки</h1>
    <p class="lede" style="margin-top:14px">Страховая сумма в полисе — это остаток основного долга. Если приложения банка под рукой нет, посчитайте по условиям договора: сумма, ставка, срок, дата первого платежа.</p>
  </section>

  <form class="calc" id="annuity" onsubmit="return false" aria-labelledby="ann-title" style="margin-top:20px">
    <h2 id="ann-title">Расчёт по аннуитетному графику</h2>
    <p class="sub">Без учёта досрочных погашений и изменений ставки.</p>
    <div class="row">
      <label>Сумма кредита, ₽ <input type="text" id="an-sum" value="5 000 000" inputmode="numeric" autocomplete="off"></label>
      <label>Ставка, % годовых <input type="number" id="an-rate" value="12" min="0.1" max="40" step="0.1" inputmode="decimal"></label>
      <label>Срок, лет <input type="number" id="an-years" value="20" min="1" max="30" inputmode="numeric"></label>
      <label>Дата первого платежа <input type="date" id="an-start" value="2023-10-15"></label>
      <label class="full">На какую дату посчитать остаток <input type="date" id="an-date"></label>
    </div>
    <div class="result" aria-live="polite" aria-atomic="true">
      <p class="k">Остаток основного долга</p>
      <p class="big" id="an-big">—</p>
      <p class="verdict" id="an-verdict"></p>
      <div class="rows">
        <div class="rw"><span>Ежемесячный платёж</span><span class="v" id="an-pay">—</span></div>
        <div class="rw"><span>Платежей сделано</span><span class="v" id="an-k">—</span></div>
        <div class="rw"><span>Выплачено процентов</span><span class="v" id="an-int">—</span></div>
      </div>
      <a class="cta" href="/banki/">Посчитать страховку для моего банка →</a>
    </div>
  </form>

  <div class="callout" id="summary">
    <p><strong>Коротко.</strong> Остаток долга по ипотеке на нужную дату считается по аннуитетной формуле: остаток после k платежей = S·(1+r)<sup>k</sup> − A·((1+r)<sup>k</sup> − 1)/r, где S — сумма кредита, r — месячная ставка (годовая/12), A — ежемесячный платёж. Именно эта сумма (у некоторых банков плюс проценты за год) идёт в полис как страховая сумма при продлении. Точный остаток всегда есть в приложении банка; калькулятор не учитывает досрочные погашения.</p>
  </div>

  <h2 id="faq">Вопросы</h2>
  <div class="faq">
{chr(10).join(f"    <details><summary>{q}</summary><p>{a}</p></details>" for q, a in faq)}
  </div>

  <h2>Читайте также</h2>
  <div class="related">
    <a href="/banki/">Страховка ипотеки по банкам<small>Надбавки и куда передать полис</small></a>
    <a href="/strahovka-ipoteki-sberbank/">Калькулятор для Сбербанка<small>Полис или надбавка к ставке</small></a>
    <a href="/strahovanie-zhizni-ipoteka-sberbank/">Страхование жизни для ипотеки<small>Расчёт по возрасту</small></a>
  </div>
</main>

{FOOTER}'''
    return path, head(title, desc, path, ld) + body

def write(path, html):
    d = os.path.join(ROOT, path.strip("/"))
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "index.html"), "w", encoding="utf-8") as f:
        f.write(html)
    print("written", path)

if __name__ == "__main__":
    paths = []
    for i, b in enumerate(BANKS):
        p, h = bank_page(b, i); write(p, h); paths.append(p)
    for fn in (banks_hub, ostatok_page):
        p, h = fn(); write(p, h); paths.append(p)
    # sitemap
    sm = os.path.join(ROOT, "sitemap.xml"); s = open(sm, encoding="utf-8").read()
    for p in paths:
        if p not in s:
            pr = "0.9" if "strahovka" in p else "0.8"
            s = s.replace("</urlset>", f'  <url><loc>https://polis-godovshchina.ru{p}</loc><lastmod>{DATE_ISO}</lastmod><changefreq>weekly</changefreq><priority>{pr}</priority></url>\n</urlset>')
    open(sm, "w", encoding="utf-8").write(s)
    print("sitemap urls:", s.count("<loc>"))
