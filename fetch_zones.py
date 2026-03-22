"""
Download Pikud HaOref zone polygon boundaries from tzevaadom.co.il
and save as frontend/public/polygons.json

Run once: python fetch_zones.py
"""
import json, requests, os

URL = "https://www.tzevaadom.co.il/static/polygons.json"
OUT = os.path.join("frontend", "public", "polygons.json")

HEADERS = {
    "Referer": "https://www.tzevaadom.co.il/",
    "User-Agent": "Mozilla/5.0",
}

print(f"Downloading polygon data from {URL} ...")
r = requests.get(URL, headers=HEADERS, timeout=30)
r.raise_for_status()

data = r.json()
print(f"Got {len(data)} zone polygons.")

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(data, f)

print(f"Saved to {OUT}")
