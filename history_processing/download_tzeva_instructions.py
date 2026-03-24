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

def download_instructions(start_id, end_id):
    id_to_name, all_cities = load_city_map()
    
    ew_path = r"history_processing/tzevaadom_early_warnings.csv"
    ee_path = r"history_processing/tzevaadom_event_ended.csv"
    
    print(f"Downloading instructions and writing to {ew_path} and {ee_path}...")
    
    with open(ew_path, 'w', encoding='utf-8-sig', newline='') as f1, \
         open(ee_path, 'w', encoding='utf-8-sig', newline='') as f2:
        
        ew_writer = csv.writer(f1)
        ee_writer = csv.writer(f2)
        
        header = ['time', 'city', 'id', 'category', 'origin']
        ew_writer.writerow(header)
        ee_writer.writerow(header)
        
        processed = 0
        total = end_id - start_id + 1
        
        for i in range(start_id, end_id + 1):
            if i == 195: continue # User request: Skip 195
            
            processed += 1
            cid = str(i)
            if processed % 50 == 0:
                print(f"Processing ID {cid} ({processed}/{total})...")
            
            url = f"https://api.tzevaadom.co.il/system-messages/id/{cid}"
            try:
                r = requests.get(url, timeout=10)
                if r.status_code != 200: continue
                
                data = r.json()
                title = data.get('titleEn', '')
                time_str = datetime.datetime.fromtimestamp(data['time']).strftime('%Y-%m-%d %H:%M:%S')
                
                # Category Detection
                category = None
                if any(x in title for x in ["Early Warning", "Staying near protected space"]):
                    category = 14
                    writer = ew_writer
                elif any(x in title for x in ["Incident Ended", "Leaving the protected space"]):
                    category = 13
                    writer = ee_writer
                else:
                    # Default: try to infer from content or just use 14 if it's an instruction
                    if data.get('instruction'):
                        category = 14
                        writer = ew_writer
                
                if category is None: continue
                
                # City List
                target_cities = []
                if i in [194, 196] or 10000000 in data.get('citiesIds', []):
                    # Country-wide
                    target_cities = all_cities
                else:
                    for city_id in data.get('citiesIds', []):
                        name = id_to_name.get(city_id)
                        if name: target_cities.append(name)
                        
                for city in target_cities:
                    writer.writerow([time_str, city, cid, category, ""])
                
                time.sleep(0.05)
                
            except Exception as e:
                print(f"Error for ID {cid}: {e}")
                
    print("Done generating instruction CSVs.")

if __name__ == "__main__":
    download_instructions(194, 1122)
