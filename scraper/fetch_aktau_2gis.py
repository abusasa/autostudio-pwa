import sys
import os
import urllib.request
import urllib.parse
import json
import re
import time

# Используем готовый парсер и нормализатор из репозитория VllSunday/2gis-parser
sys.path.insert(0, r"D:\windows\Desktop\car-pwa\2gis-parser\src")
from venues2gis.normalize import normalize_item, collect_contacts, format_schedule

FIRM_HREF = re.compile(r"/(?:firm|station|branches)/(?P<fid>\d+)", re.I)
REVIEW_KEY = "6e7e1929-4ea9-4a5d-8c05-d601860389bd"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}

def fetch_html(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=15) as resp:
        return resp.read().decode("utf-8", errors="ignore")

def parse_initial_state(html):
    marker = "var initialState = JSON.parse('"
    start = html.find(marker)
    if start == -1:
        return None
    start += len(marker)
    end = html.find("');", start)
    if end == -1:
        return None
    raw_escaped = html[start:end]
    raw = raw_escaped.encode("utf-8").decode("unicode_escape").encode("latin1").decode("utf-8", errors="ignore")
    return json.loads(raw)

def slugify(name, idx):
    translit = {
        'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z','и':'i','й':'y',
        'к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f',
        'х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'shch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya',
        'ә':'a','і':'i','ң':'n','ғ':'g','ү':'u','ұ':'u','қ':'q','ө':'o','һ':'h'
    }
    s = (name or "").lower()
    out = []
    for ch in s:
        if ch in translit:
            out.append(translit[ch])
        elif ch.isalnum():
            out.append(ch)
        else:
            out.append('-')
    slug = re.sub(r'-+', '-', ''.join(out)).strip('-')
    if not slug or len(slug) < 2:
        slug = f"sto-aktau-{idx}"
    return slug[:30].strip('-')

def fetch_reviews(branch_id):
    url = (
        f"https://public-api.reviews.2gis.com/2.0/branches/{branch_id}/reviews"
        f"?limit=6&is_advertiser=false&fields=meta.branch_rating,meta.branch_reviews_count,reviews.is_verified"
        f"&without_my_first_review=false&rated=true&sort_by=date_edited&key={REVIEW_KEY}&locale=ru_KZ"
    )
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            out = []
            for r in data.get("reviews", []):
                txt = (r.get("text") or "").strip()
                if txt and r.get("rating", 5) >= 4:
                    out.append({
                        "author": r.get("user", {}).get("name") or "Клиент 2ГИС",
                        "rating": r.get("rating", 5),
                        "date": (r.get("date_edited") or r.get("date_created") or "")[:10],
                        "text": txt[:280]
                    })
            return out[:4]
    except Exception:
        return []

def main():
    queries = ["автосервис", "СТО", "ремонт авто", "замена масла", "детейлинг", "шиномонтаж"]
    candidate_ids = []
    seen_ids = set()

    for q in queries:
        encoded_q = urllib.parse.quote(q)
        for page in range(1, 5):
            url = f"https://2gis.kz/aktau/search/{encoded_q}/page/{page}" if page > 1 else f"https://2gis.kz/aktau/search/{encoded_q}"
            try:
                html = fetch_html(url)
                found_on_page = 0
                for m in FIRM_HREF.finditer(html):
                    fid = m.group("fid")
                    if fid not in seen_ids:
                        seen_ids.add(fid)
                        candidate_ids.append((fid, q))
                        found_on_page += 1
                print(f"[{q} p.{page}] +{found_on_page} new IDs (total: {len(candidate_ids)})")
                if found_on_page == 0:
                    break
            except Exception as e:
                print(f"  [warn] {url}: {e}")
            time.sleep(0.2)

    print(f"\nTotal unique candidate auto services in Aktau: {len(candidate_ids)}")
    results = []
    used_slugs = set()

    for idx, (bid, query_used) in enumerate(candidate_ids, 1):
        firm_url = f"https://2gis.kz/aktau/firm/{bid}"
        try:
            html = fetch_html(firm_url)
            state = parse_initial_state(html)
            if not state:
                continue
            prof_map = state.get("data", {}).get("entity", {}).get("profile", {})
            prof = None
            for k, v in prof_map.items():
                if k.startswith(bid):
                    prof = v.get("data", {})
                    break
            if not prof:
                continue

            # Используем normalize_item и collect_contacts из VllSunday/2gis-parser
            norm = normalize_item(prof, source_region="aktau", source_query=query_used)
            contacts = collect_contacts(prof)

            rating = float(norm.get("rating") or 0)
            reviews_count = int(norm.get("reviews_count") or 0)

            # Отбираем живые сервисы с хорошим потоком клиентов и рейтингом
            if reviews_count < 5 or rating < 4.0:
                continue

            # Проверяем отсутствие собственного сайта
            websites = [
                w for w in contacts.get("website", [])
                if not any(s in w.lower() for s in ["instagram.com", "wa.me", "whatsapp.com", "t.me", "vk.com", "tiktok.com", "2gis."])
            ]
            if websites:
                print(f"  [skip] {norm['name']} has website: {websites}")
                continue

            phones = contacts.get("phone", [])
            if not phones:
                continue

            primary_phone = phones[0]
            clean_digits = re.sub(r"\D", "", primary_phone)
            if clean_digits.startswith("8") and len(clean_digits) == 11:
                clean_digits = "7" + clean_digits[1:]

            wa_list = contacts.get("whatsapp", [])
            wa_url = wa_list[0] if wa_list else (f"https://wa.me/{clean_digits}" if clean_digits else "")
            ig_list = contacts.get("instagram", [])
            ig_url = ig_list[0] if ig_list else ""

            hero_photo = ""
            for ec in (prof.get("external_content") or []):
                if ec.get("main_photo_url"):
                    hero_photo = ec["main_photo_url"]
                    break

            sched = prof.get("schedule") or {}
            open_time, close_time = "09:00", "19:00"
            days_off = []
            day_map = {"Mon": 1, "Tue": 2, "Wed": 3, "Thu": 4, "Fri": 5, "Sat": 6, "Sun": 0}
            for dkey, dnum in day_map.items():
                if dkey in sched and sched[dkey].get("working_hours"):
                    wh = sched[dkey]["working_hours"][0]
                    open_time = wh.get("from", open_time)
                    close_time = wh.get("to", close_time)
                elif dnum == 0 and sched and not sched.get("is_24x7"):
                    days_off.append(0)

            rubrics = [r.get("name") for r in (prof.get("rubrics") or []) if r.get("name")]
            attrs = []
            for ag in (prof.get("attribute_groups") or []):
                for attr in (ag.get("attributes") or []):
                    aname = attr.get("name")
                    if aname and len(aname) < 55:
                        attrs.append(aname)

            real_reviews = fetch_reviews(bid)

            base_slug = slugify(norm.get("name"), len(results) + 1)
            slug = base_slug
            c_idx = 2
            while slug in used_slugs:
                slug = f"{base_slug}-{c_idx}"
                c_idx += 1
            used_slugs.add(slug)

            name_ex = prof.get("name_ex") or {}
            subtitle = (name_ex.get("extension") or (rubrics[0] if rubrics else "Автосервис и СТО")).capitalize()

            item_record = {
                "branch_id": bid,
                "slug": slug,
                "name": norm.get("name") or prof.get("name"),
                "name_full": norm.get("name_full") or prof.get("name"),
                "subtitle": subtitle,
                "city": norm.get("city") or "Актау",
                "address": norm.get("address") or "г. Актау",
                "phone": primary_phone,
                "all_phones": phones,
                "whatsapp_phone": clean_digits,
                "whatsapp_url": wa_url,
                "instagram": ig_url,
                "rating": rating,
                "reviews_count": reviews_count,
                "hero_photo": hero_photo,
                "working_hours_text": norm.get("working_hours") or f"Ежедневно {open_time}–{close_time}",
                "hours": {"open": open_time, "close": close_time},
                "days_off": days_off,
                "rubrics": rubrics[:6],
                "attributes": attrs[:14],
                "latitude": norm.get("latitude"),
                "longitude": norm.get("longitude"),
                "reviews": real_reviews,
                "2gis_url": norm.get("2gis_url")
            }
            results.append(item_record)
            print(f"  + [{len(results)}] {item_record['name']} ({rating}★, {reviews_count} отз.) | {primary_phone} -> /{slug}")

            if len(results) >= 28:
                break
            time.sleep(0.15)
        except Exception as e:
            print(f"  [warn] firm {bid}: {e}")

    results.sort(key=lambda x: (x["reviews_count"], x["rating"]), reverse=True)
    top_25 = results[:25]

    out_path = r"D:\windows\Desktop\car-pwa\scraper\aktau_services_raw.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(top_25, f, ensure_ascii=False, indent=2)
    print(f"\nDONE! Saved {len(top_25)} real Aktau auto services to {out_path}")

if __name__ == "__main__":
    main()
