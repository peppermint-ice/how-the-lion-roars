import requests
import csv
import io
import json
import time
import datetime
import os
from collections import defaultdict

PATHS_FILE = r"utils/paths.json"

def load_csv_url():
    with open(PATHS_FILE, "r", encoding="utf-8") as f:
        return json.load(f).get("alarms.csv")

def download_tzeva_data(start_id, end_id, append=False):
    csv_url = load_csv_url()
    print(f"Fetching alarms.csv to map origins...")
    response = requests.get(csv_url, timeout=60)
    response.raise_for_status()
    f = io.StringIO(response.content.decode('utf-8-sig'))
    reader = csv.reader(f)
    next(reader)
    
    # Map ID -> Origin (taking the first origin found for that ID in 2026+)
    id_to_origin = {}
    start_2026 = datetime.datetime(2026, 1, 1)
    
    for row in reader:
        if len(row) < 6: continue
        time_str, csv_id, origin = row[0], row[3], row[5]
        try:
            dt = datetime.datetime.strptime(time_str, '%Y-%m-%d %H:%M:%S')
            if dt >= start_2026:
                if csv_id not in id_to_origin:
                    id_to_origin[str(csv_id)] = origin.strip()
        except:
            continue
            
    print(f"Mapped origins for {len(id_to_origin)} IDs.")
    
    output_path = r"history_processing/tzevaadom_alerts.csv"
    
    # If appending, load existing IDs to avoid duplicates
    existing_ids = set()
    if append and os.path.exists(output_path):
        with open(output_path, 'r', encoding='utf-8-sig') as f:
            r = csv.DictReader(f)
            for row in r:
                existing_ids.add(str(row['id']))

    mode = 'a' if append else 'w'
    print(f"Downloading Tzeva Adom data ({mode}) and writing to {output_path}...")
    
    THREAT_TO_CAT = {0: 1, 5: 2}
    
    with open(output_path, mode, encoding='utf-8-sig', newline='') as f:
        writer = csv.writer(f)
        if not append:
            writer.writerow(['time', 'city', 'id', 'category', 'origin'])
        
        total = end_id - start_id + 1
        processed = 0
        success_count = 0
        alert_count = 0
        
        for i in range(start_id, end_id + 1):
            cid = str(i)
            if append and cid in existing_ids:
                continue

            processed += 1
            if processed % 50 == 0:
                print(f"Processing ID {cid} ({processed}/{total}). Total alerts so far: {alert_count}")
            
            url = f"https://api.tzevaadom.co.il/alerts-history/id/{cid}"
            try:
                r = requests.get(url, timeout=10)
                if r.status_code != 200: continue
                
                data = r.json()
                origin = id_to_origin.get(cid, "other")
                
                for alert in data.get('alerts', []):
                    threat = alert.get('threat')
                    if threat not in THREAT_TO_CAT: continue
                    
                    category = THREAT_TO_CAT[threat]
                    alert_time = datetime.datetime.fromtimestamp(alert['time']).strftime('%Y-%m-%d %H:%M:%S')
                    
                    for city in alert.get('cities', []):
                        writer.writerow([alert_time, city.strip(), cid, category, origin])
                        alert_count += 1
                
                success_count += 1
                time.sleep(1.0)
                
            except Exception as e:
                print(f"Error fetching ID {cid}: {e}")
                
    print(f"\nDone. Successfully fetched {success_count} alert IDs.")
    print(f"Total individual alert rows written: {alert_count}")

if __name__ == "__main__":
    # Range based on previous analysis (Feb 27 onwards)
    download_tzeva_data(5597, 6493)
