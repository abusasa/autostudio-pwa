import json
import os

RAW_PATH = r"D:\windows\Desktop\car-pwa\scraper\aktau_services_raw.json"
OUT_JSON = r"D:\windows\Desktop\car-pwa\src\data\stores.json"
SERVICES_DIR = r"D:\windows\Desktop\car-pwa\src\services"

ACCENTS = [
    "#D4FF00",  # Acid Lime (как на референсе 1 Aura Residence)
    "#3B82F6",  # Electric Blue
    "#FF5E1A",  # Racing Orange
    "#10B981",  # Emerald Green
    "#8B5CF6",  # Violet
    "#F59E0B",  # Amber Gold
    "#EC4899",  # Rose Red
    "#06B6D4",  # Cyan
]

SERVICE_CATALOG = [
    {"id": "diag", "category": "Диагностика", "name": "Компьютерная диагностика и осмотр", "price": 5000, "duration": 45, "desc": "Чтение ошибок ЭБУ, проверка всех систем и ходовой части"},
    {"id": "oil", "category": "ТО и масла", "name": "Замена масла в ДВС и фильтров", "price": 4000, "duration": 45, "desc": "Замена моторного масла, масляного, воздушного и салонного фильтров"},
    {"id": "chassis", "category": "Ходовая", "name": "Ремонт и обслуживание ходовой части", "price": 8000, "duration": 120, "desc": "Рычаги, амортизаторы, сайлентблоки, шаровые опоры, рулевая рейка"},
    {"id": "brakes", "category": "Тормоза", "name": "Замена тормозных колодок и дисков", "price": 6000, "duration": 60, "desc": "Обслуживание суппортов, замена колодок и прокачка тормозной жидкости"},
    {"id": "engine", "category": "Двигатель и КПП", "name": "Обслуживание ДВС, ГРМ и трансмиссии", "price": 15000, "duration": 180, "desc": "Замена ремня/цепи ГРМ, свечей, чистка форсунок, замена масла в АКПП"},
    {"id": "electric", "category": "Электрика", "name": "Услуги автоэлектрика и ремонт электроники", "price": 7000, "duration": 90, "desc": "Поиск утечек, ремонт стартеров, генераторов, проводки и датчиков"},
    {"id": "tires", "category": "Шиномонтаж", "name": "Шиномонтаж и 3D-балансировка (комплект)", "price": 6500, "duration": 45, "desc": "Переобувка, балансировка 4 колёс, проверка давления и геометрии"},
    {"id": "detailing", "category": "Детейлинг", "name": "Химчистка салона и полировка кузова", "price": 25000, "duration": 240, "desc": "Глубокая очистка салона, восстановительная полировка и защитное покрытие"}
]

def build_services_for_item(rubrics, attrs):
    text = " ".join((rubrics or []) + (attrs or [])).lower()
    selected = []
    # Всегда добавляем диагностику и ТО
    selected.append(SERVICE_CATALOG[0])
    selected.append(SERVICE_CATALOG[1])
    if "ходов" in text or "подвеск" in text or "автосервис" in text or "развал" in text:
        selected.append(SERVICE_CATALOG[2])
    if "тормоз" in text or "автосервис" in text or "колод" in text:
        selected.append(SERVICE_CATALOG[3])
    if "двигат" in text or "двс" in text or "кпп" in text or "акпп" in text or "мотор" in text:
        selected.append(SERVICE_CATALOG[4])
    if "электр" in text or "диагност" in text or "кондиц" in text:
        selected.append(SERVICE_CATALOG[5])
    if "шин" in text or "колес" in text or "балансир" in text:
        selected.append(SERVICE_CATALOG[6])
    if "детейл" in text or "полиров" in text or "мойк" in text or "химчист" in text or "пленк" in text:
        selected.append(SERVICE_CATALOG[7])

    # Если мало рубрик указано в 2GIS, добавляем базовый набор СТО
    for s in SERVICE_CATALOG[2:6]:
        if len(selected) < 6 and s not in selected:
            selected.append(s)
    return selected

def main():
    with open(RAW_PATH, "r", encoding="utf-8") as f:
        raw_items = json.load(f)

    os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
    os.makedirs(SERVICES_DIR, exist_ok=True)

    stores = []
    for i, it in enumerate(raw_items):
        accent = ACCENTS[i % len(ACCENTS)]
        svcs = build_services_for_item(it.get("rubrics", []), it.get("attributes", []))
        revs = (it.get("reviews") or [])[:5]
        if not revs:
            revs = [
                {
                    "author": "Клиент 2ГИС",
                    "rating": 5,
                    "date": "2026-10-15",
                    "text": f"Отличный автосервис {it['name']} в Актау. Быстро провели диагностику и сделали качественный ремонт."
                }
            ]

        store = {
            "slug": it["slug"],
            "branchId": it["branch_id"],
            "name": it["name"],
            "nameFull": it.get("name_full") or it["name"],
            "subtitle": it.get("subtitle") or "Автосервис и СТО · Актау",
            "tagline": f"Онлайн-запись в {it['name']} за 30 секунд без очередей и ожидания",
            "city": it.get("city") or "Актау",
            "address": it.get("address") or "г. Актау",
            "phone": it["phone"],
            "allPhones": it.get("all_phones") or [it["phone"]],
            "whatsappPhone": it.get("whatsapp_phone") or "",
            "whatsappUrl": it.get("whatsapp_url") or "",
            "instagram": it.get("instagram") or "",
            "rating": it.get("rating") or 4.9,
            "reviewsCount": it.get("reviews_count") or 25,
            "heroPhoto": it.get("hero_photo") or "",
            "logo": "",
            "accent": accent,
            "demo": True,
            "workingHoursText": it.get("working_hours_text") or "09:00–19:00",
            "hours": it.get("hours") or {"open": "09:00", "close": "19:00"},
            "daysOff": it.get("days_off") or [],
            "boxes": 3,
            "rubrics": it.get("rubrics") or ["Автосервис"],
            "attributes": it.get("attributes") or [],
            "services": svcs,
            "reviews": revs,
            "twoGisUrl": it.get("2gis_url") or "https://2gis.kz/aktau"
        }
        stores.append(store)

        # Сохраняем также индивидуальный конфиг в src/services/<slug>/config.json
        s_dir = os.path.join(SERVICES_DIR, store["slug"])
        os.makedirs(s_dir, exist_ok=True)
        with open(os.path.join(s_dir, "config.json"), "w", encoding="utf-8") as sf:
            json.dump(store, sf, ensure_ascii=False, indent=2)

    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(stores, f, ensure_ascii=False, indent=2)

    print(f"Generated {len(stores)} store configs in {OUT_JSON} and {SERVICES_DIR}")

if __name__ == "__main__":
    main()
