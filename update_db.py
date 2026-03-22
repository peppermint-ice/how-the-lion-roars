import json
import requests
import datetime
import os
import subprocess
import shutil
from bs4 import BeautifulSoup

def main():
    print("1. Checking current DB...")
    try:
        with open('data.json', 'r', encoding='utf-8') as f:
            data = json.load(f)
        if data:
            latest_time = max(datetime.datetime.fromisoformat(s['startTime']) for s in data)
            print(f"   Latest alert in data.json: {latest_time}")
        else:
            print("   data.json is empty.")
    except FileNotFoundError:
        print("   data.json not found yet.")

    print("2. Fetching new early warnings from t.me/PikudHaOref_all...")
    try:
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        res = requests.get("https://t.me/s/PikudHaOref_all", headers=headers, timeout=15)
        res.raise_for_status()
        soup = BeautifulSoup(res.text, 'html.parser')
        
        # Load existing Telegram dump to append to
        with open('azakot_heb.json', 'r', encoding='utf-8') as f:
            tg_data = json.load(f)
        
        # Strip out any improperly timezoned messages that our bot added previously to start fresh
        # (Native Telegram Desktop dumps have extra fields like 'from_id' or 'from')
        tg_data['messages'] = [m for m in tg_data.get('messages', []) if 'from' in m]
        
        existing_dates = set(m.get('date') for m in tg_data.get('messages', []))
        max_id = max((m.get('id', 0) for m in tg_data.get('messages', [])), default=0)
        
        new_msgs = 0
        url = "https://t.me/s/PikudHaOref_all"
        reached_known = False
        
        while url and not reached_known:
            print(f"   Fetching page: {url}")
            try:
                res = requests.get(url, headers=headers, timeout=15)
                res.raise_for_status()
            except Exception as loop_e:
                print(f"   [!] Connection issue or end of pages during pagination: {loop_e}")
                print("   [!] Stopping pagination early, will save what was collected so far.")
                break
                
            soup = BeautifulSoup(res.text, 'html.parser')
            
            blocks = soup.select('.tgme_widget_message')
            if not blocks:
                break
                
            # Process from oldest to newest on this page
            for msg_div in reversed(blocks):
                time_tag = msg_div.select_one('time')
                text_div = msg_div.select_one('.tgme_widget_message_text')
                
                if not time_tag or not text_div:
                    continue
                    
                dt_str = time_tag.get('datetime', '')
                if not dt_str:
                    continue
                    
                # Telegram Web gives UTC: e.g. 2026-03-22T00:23:06+00:00
                dt_obj_utc = datetime.datetime.fromisoformat(dt_str)
                # Convert to local Israel Time (+2 or +3)
                dt_local = dt_obj_utc.astimezone()
                dt_iso = dt_local.replace(tzinfo=None).isoformat()
                
                if latest_time and dt_local.replace(tzinfo=None) <= latest_time:
                    reached_known = True
                    
                if dt_iso in existing_dates:
                    continue
                    
                text = text_div.get_text(separator='\n')
                # We append ALL messages so the dataset remains authentic 
                # and heb_parser's cutoff time advances correctly.
                max_id += 1
                tg_data['messages'].append({
                    "id": max_id,
                    "type": "message",
                    "date": dt_iso,
                    "text": text
                })
                existing_dates.add(dt_iso)
                new_msgs += 1
                if "בדקות הקרובות צפויות להתקבל" in text:
                    print(f"   -> Found and appended pre-alarm from {dt_iso}!")
                else:
                    print(f"   -> Appended regular message from {dt_iso}")
            
            if not reached_known:
                first_post = blocks[0].get('data-post', '')
                if '/' in first_post:
                    first_id = first_post.split('/')[-1]
                    url = f"https://t.me/s/PikudHaOref_all?before={first_id}"
                else:
                    url = None
                    
        if new_msgs > 0:
            with open('azakot_heb.json', 'w', encoding='utf-8') as f:
                json.dump(tg_data, f, ensure_ascii=False, indent=1)
            print(f"   Saved {new_msgs} new pre-alarms into azakot_heb.json.")
        else:
            print("   No new pre-alarms found to append.")
            
    except Exception as e:
        print(f"   Error fetching or parsing Telegram channel: {e}")

    print("3. Fetching latest CSV updates...")
    try:
        csv_url = "https://raw.githubusercontent.com/yuval-harpaz/alarms/master/data/alarms.csv"
        r = requests.get(csv_url, timeout=30)
        r.raise_for_status()

        with open('azakot_source.csv', 'w', encoding='utf-8') as f:
            f.write(r.text)
        print("   Updated azakot_source.csv with latest alarms.")
    except PermissionError:
        print("\n   [!] ERROR: Permission denied on azakot_source.csv!")
        print("       Is the file open in Excel or another program? Please close it and run again.\n")
        return
    except Exception as e:
        print(f"   Error downloading CSV: {e}")
        return
    
    print("4. Re-running parser to rebuild the JSON database...")
    try:
        subprocess.run(["python", "heb_parser.py"], check=True)
        shutil.copy("data.json", "frontend/public/data.json")
        print("   Done! The updated data.json has been built and moved to the frontend.")
    except subprocess.CalledProcessError as e:
        print(f"   Parser failed: {e}")
    except Exception as e:
        print(f"   Error copying to frontend: {e}")

if __name__ == '__main__':
    main()
