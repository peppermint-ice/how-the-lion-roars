import json
import requests
import datetime
import os
import shutil
import time
import re
from bs4 import BeautifulSoup
import heb_parser

def fetch_page(url, headers, retries=5, delay=5):
    """Fetches a URL with retries and returns the response."""
    for i in range(retries):
        try:
            # Use a slightly different approach to bypass common filters
            res = requests.get(url, headers=headers, timeout=20)
            if res.status_code == 429:
                print(f"   [!] Rate limited (429). Sleeping {delay*2}s...")
                time.sleep(delay * 2)
                continue
            res.raise_for_status()
            return res
        except Exception as e:
            print(f"   [!] Attempt {i+1} failed for {url}: {e}")
            if i < retries - 1:
                time.sleep(delay)
    return None

def main():
    # 1. Check the latest entry in data.json
    print("1. Checking current DB...")
    latest_time = None
    sequences = []
    cities_map = {}
    
    if os.path.exists('data.json'):
        with open('data.json', 'r', encoding='utf-8') as f:
            db = json.load(f)
            if isinstance(db, dict):
                sequences = db.get('sequences', [])
                cities_map = db.get('cities', {})
            else:
                sequences = db # legacy format
                
        if sequences:
            latest_time = max(datetime.datetime.fromisoformat(s['startTime']) for s in sequences)
            print(f"   Latest alert in data.json: {latest_time}")
    
    if not latest_time:
        latest_time = datetime.datetime(2026, 2, 27)
        print(f"   Starting fresh from {latest_time}")

    # 2. Rebuild the local Telegram store from archive + fresh fetch
    print("2. Syncing Telegram store with channel...")
    
    # We always start from the archive provided by the user
    if os.path.exists('azakot_heb_archive.json'):
        with open('azakot_heb_archive.json', 'r', encoding='utf-8') as f:
            tg_data = json.load(f)
    else:
        tg_data = {"messages": []}
        
    existing_ids = set()
    existing_dates = set()
    for m in tg_data.get('messages', []):
        if 'id' in m: existing_ids.add(m['id'])
        if 'date' in m: existing_dates.add(m['date'])
        
    max_id = max(existing_ids, default=0)
    
    # Fetch NEWER messages than the archive/current store
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7"
    }
    
    new_msgs_count = 0
    url = "https://t.me/s/PikudHaOref_all"
    reached_overlap = False
    
    # We fetch back until we hit the latest DATE in our current store
    # or until we reach the latest alert time.
    store_latest_dt = max((datetime.datetime.fromisoformat(m['date']) for m in tg_data['messages']), default=latest_time)
    print(f"   Searching for messages newer than {store_latest_dt}...")

    while url and not reached_overlap:
        print(f"   Fetching: {url}")
        res = fetch_page(url, headers)
        if not res:
            print("   [!] Failed to retrieve page. Moving to parsing...")
            break
            
        soup = BeautifulSoup(res.text, 'html.parser')
        blocks = soup.select('.tgme_widget_message')
        if not blocks:
            print("   [!] No messages found.")
            break
            
        page_ids = []
        for msg_div in reversed(blocks):
            msg_id_full = msg_div.get('data-post', '')
            msg_id_str = msg_id_full.split('/')[-1] if '/' in msg_id_full else None
            if not msg_id_str: continue
            
            msg_id = int(msg_id_str)
            page_ids.append(msg_id)
            
            time_tag = msg_div.select_one('time')
            text_div = msg_div.select_one('.tgme_widget_message_text')
            
            if not time_tag or not text_div: continue
                
            dt_str = time_tag.get('datetime', '')
            if not dt_str: continue
                
            dt_obj_utc = datetime.datetime.fromisoformat(dt_str)
            dt_local = dt_obj_utc.astimezone().replace(tzinfo=None)
            
            if dt_local <= store_latest_dt:
                reached_overlap = True
            
            if dt_local.isoformat() in existing_dates:
                continue
                
            text = text_div.get_text(separator='\n')
            tg_data['messages'].append({
                "id": "new_" + str(msg_id), # Avoid ID collisions with archive
                "tg_id": msg_id,
                "date": dt_local.isoformat(),
                "text": text
            })
            existing_dates.add(dt_local.isoformat())
            new_msgs_count += 1
            if "בדקות הקרובות" in text:
                print(f"   -> [{msg_id}] Found pre-alarm marker at {dt_local.isoformat()}")

        if not reached_overlap and page_ids:
            min_id = min(page_ids)
            url = f"https://t.me/s/PikudHaOref_all?before={min_id}"
            time.sleep(3) # Stay safe
        else:
            url = None

    # Sort the entire store by date
    tg_data['messages'].sort(key=lambda x: x['date'])
    
    with open('azakot_heb.json', 'w', encoding='utf-8') as f:
        json.dump(tg_data, f, ensure_ascii=False, indent=1)
    print(f"   Synced store saved. Added {new_msgs_count} new messages.")

    # 3. Download the csv file
    print("3. Fetching latest CSV updates...")
    csv_url = "https://raw.githubusercontent.com/yuval-harpaz/alarms/master/data/alarms.csv"
    try:
        r = fetch_page(csv_url, {})
        if r:
            with open('azakot_source.csv', 'w', encoding='utf-8') as f:
                f.write(r.text)
            print("   Updated azakot_source.csv.")
    except Exception as e:
        print(f"   Error downloading CSV: {e}")

    # 4. Create update_DDMMYYHHMM.json
    print("4. Creating incremental update file...")
    by_he = heb_parser.load_cities()
    
    # Telegram events: parse specifically from the newly synced store
    tg_events = heb_parser.extract_telegram_events('azakot_heb.json', by_he, start_time=latest_time)
    print(f"   Extracted {len(tg_events)} new Telegram events since {latest_time}")
    
    # Alarms: parse CSV filtered by start_time
    new_csv_alarms = heb_parser.load_csv_alarms('azakot_source.csv', by_he, start_time=latest_time)
    print(f"   Extracted {len(new_csv_alarms)} new alert events since {latest_time}")
    
    new_sequences = heb_parser.build_sequences(tg_events, new_csv_alarms)
    
    if new_sequences:
        # Cleanup old update files
        for f in os.listdir('.'):
            if f.startswith('update_') and f.endswith('.json'):
                print(f"   Removing old update file: {f}")
                os.remove(f)

        ts = datetime.datetime.now().strftime("%d%m%y%H%M")
        update_filename = f"update_{ts}.json"
        with open(update_filename, 'w', encoding='utf-8') as f:
            json.dump(new_sequences, f, ensure_ascii=False, indent=1)
        print(f"   Created {update_filename} with {len(new_sequences)} merged entries.")
        
        # 5. Update the data.json file
        print("5. Merging into data.json...")
        
        # Ensure cities_map is up to date
        with open('cities.json', 'r', encoding='utf-8') as f:
            c_data = json.load(f)
            raw_cities = c_data.get('cities', {}) if isinstance(c_data, dict) else {}
            for k, v in raw_cities.items():
                cities_map[str(v['id'])] = v

        # Combine sequences and handle overlaps
        existing_times = {s['startTime'] for s in sequences}
        for s in new_sequences:
            if s['startTime'] not in existing_times:
                sequences.append(s)
        
        sequences.sort(key=lambda s: s['startTime'], reverse=True)
        # Re-ID to maintain order from newest
        for i, s in enumerate(sequences, 1):
            s['id'] = i
            
        final_db = {
            "cities": cities_map,
            "sequences": sequences
        }
        
        with open('data.json', 'w', encoding='utf-8') as f:
            json.dump(final_db, f, ensure_ascii=False, indent=1)
        
        shutil.copy("data.json", "frontend/public/data.json")
        print("   Done! data.json updated and moved to frontend.")
    else:
        print("   No new sequences formed. Check linking logic.")

if __name__ == '__main__':
    main()
