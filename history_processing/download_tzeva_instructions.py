import requests
import json
import time
import datetime
import csv
import os

def load_city_map():
    print("Loading cities.json...")
    with open('cities.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Map ID -> Hebrew Name (using the 'cities' part of the JSON)
    id_to_name = {}
    all_cities = []
    
    cities_dict = data.get('cities', {})
    for city_name, city_data in cities_dict.items():
        cid = city_data.get('id')
        if cid is not None:
            id_to_name[cid] = city_name
            all_cities.append(city_name)
            
    return id_to_name, all_cities

def download_instructions(start_id, end_id, append=False, max_time=None):
    id_to_name, all_cities = load_city_map()
    
    ew_path = r"history_processing/tzevaadom_early_warnings.csv"
    ee_path = r"history_processing/tzevaadom_event_ended.csv"
    
    # If appending, load existing IDs to avoid duplicates
    existing_ids = set()
    if append:
        for p in [ew_path, ee_path]:
            if os.path.exists(p):
                with open(p, 'r', encoding='utf-8-sig') as f:
                    r = csv.DictReader(f)
                    for row in r:
                        existing_ids.add(str(row['id']))

    mode = 'a' if append else 'w'
    print(f"Downloading instructions ({mode}) and writing to {ew_path} and {ee_path}...")
    
    max_inst_time = datetime.datetime(2000, 1, 1)

    with open(ew_path, mode, encoding='utf-8-sig', newline='') as f1, \
         open(ee_path, mode, encoding='utf-8-sig', newline='') as f2:
        
        ew_writer = csv.writer(f1)
        ee_writer = csv.writer(f2)
        
        if not append:
            header = ['time', 'city', 'id', 'category', 'origin']
            ew_writer.writerow(header)
            ee_writer.writerow(header)
        
        processed = 0
        total = end_id - start_id + 1
        
        for i in range(start_id, end_id + 1):
            if i == 195: continue
            cid = str(i)
            if append and cid in existing_ids:
                continue

            processed += 1
            if processed % 50 == 0:
                print(f"Processing ID {cid} ({processed}/{total})...")
            
            url = f"https://api.tzevaadom.co.il/system-messages/id/{cid}"
            try:
                r = requests.get(url, timeout=10)
                if r.status_code != 200: continue
                
                data = r.json()
                title = data.get('titleEn', '')
                inst_time_obj = datetime.datetime.fromtimestamp(data['time'])
                time_str = inst_time_obj.strftime('%Y-%m-%d %H:%M:%S')
                max_inst_time = max(max_inst_time, inst_time_obj)

                if max_time and inst_time_obj > max_time:
                    break
                
                # Category Detection
                category = None
                if any(x in title for x in ["Early Warning", "Staying near protected space"]):
                    category = 14
                    writer = ew_writer
                elif any(x in title for x in ["Incident Ended", "Leaving the protected space"]):
                    category = 13
                    writer = ee_writer
                else:
                    if data.get('instruction'):
                        category = 14
                        writer = ew_writer
                
                if category is None: continue
                
                # City List
                target_cities = []
                if i in [194, 196] or 10000000 in data.get('citiesIds', []):
                    target_cities = all_cities
                else:
                    for city_id in data.get('citiesIds', []):
                        name = id_to_name.get(city_id)
                        if name: target_cities.append(name)
                        
                for city in target_cities:
                    writer.writerow([time_str, city, cid, category, ""])
                
                time.sleep(1.0)
                
            except Exception as e:
                print(f"Error for ID {cid}: {e}")
                
    print("Done generating instruction CSVs.")
    return max_inst_time

if __name__ == "__main__":
    download_instructions(194, 1122)

if __name__ == "__main__":
    download_instructions(194, 1122)
