import json
import re
import os
import requests
import time
from datetime import datetime

# Load cities.json and build indexes
def load_cities_indexes():
    with open('cities.json', 'r', encoding='utf-8') as f:
        cities_dict = json.load(f)
        
    city_by_id = {}
    city_by_ru = {}
    
    cities_payload = cities_dict.get('cities', {})
    
    for _, city_info in cities_payload.items():
        if not isinstance(city_info, dict):
            continue
        c_id = city_info.get('id')
        if c_id is not None:
            city_by_id[c_id] = city_info
        if 'ru' in city_info:
            ru_name = city_info['ru'].strip().lower()
            city_by_ru[ru_name] = city_info
            
        # Also index by Hebrew/English in case telegram msg uses logic
        he_name = city_info.get('he', '').strip()
        if he_name:
            city_by_ru[he_name] = city_info
        
    return city_by_id, city_by_ru

def fetch_pre_alarm_cities(instruction_id, city_by_id):
    cache_file = f'cache_{instruction_id}.json'
    if os.path.exists(cache_file):
        with open(cache_file, 'r', encoding='utf-8') as f:
            ans = json.load(f)
            return ans
    
    cities_found = []
    try:
        url = f"https://api.tzevaadom.co.il/system-messages/id/{instruction_id}"
        r = requests.get(url, timeout=10)
        if r.status_code == 200:
            data = r.json()
            city_ids = data.get('cities', [])
            for c_id in city_ids:
                if c_id in city_by_id:
                    cities_found.append(city_by_id[c_id])
            with open(cache_file, 'w', encoding='utf-8') as f:
                json.dump(cities_found, f, ensure_ascii=False)
            time.sleep(0.1) # Be nice to the API
        else:
            print(f"Failed to fetch {instruction_id}: HTTP {r.status_code}")
    except Exception as e:
        print(f"Failed to fetch {instruction_id}: {e}")
        
    return cities_found

def parse_telegram_data(filepath, city_by_id, city_by_ru):
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    events = []
    current_event = None
    
    alarm_start_regex = r"🔴 Цева Адом"
    pre_alarm_regex = r"Раннее предупреждение|Expected Alerts"
    
    messages = data.get('messages', [])
    
    for msg in messages:
        text = ""
        urls = []
        if isinstance(msg.get('text'), list):
            for part in msg['text']:
                if isinstance(part, dict):
                    text += part.get('text', '')
                    if part.get('type') == 'text_link':
                        urls.append(part.get('href'))
                else:
                    text += str(part)
        else:
            text = msg.get('text', '')
            
        if not text:
            continue
            
        text_clean = text.strip()
        
        if re.search(alarm_start_regex, text_clean):
            if current_event:
                events.append(current_event)
            current_event = {
                "type": "ALARM",
                "time": msg.get('date'),
                "raw_text": text_clean,
                "msg_ids": [msg.get('id')],
                "urls": urls,
                "detailed_cities": []
            }
        elif re.search(pre_alarm_regex, text_clean):
            if current_event:
                events.append(current_event)
            current_event = {
                "type": "PRE_ALARM",
                "time": msg.get('date'),
                "raw_text": text_clean,
                "msg_ids": [msg.get('id')],
                "urls": urls,
                "detailed_cities": []
            }
        elif text_clean.startswith("•") and current_event:
            current_event["raw_text"] += "\n" + text_clean
            current_event["msg_ids"].append(msg.get('id'))
        elif "Инцидент завершен" in text_clean:
            if current_event:
                events.append(current_event)
            current_event = None
            
    if current_event:
        events.append(current_event)
        
    # Extract details using indexes
    for ev in events:
        if ev['type'] == 'PRE_ALARM':
            # Looking for instruction URL in the gathered URLs or raw_text
            instruction_id = None
            for u in ev['urls']:
                match = re.search(r'instructions/(\d+)', u)
                if match:
                    instruction_id = match.group(1)
                    break
            if not instruction_id:
                match = re.search(r'instructions/(\d+)', ev['raw_text'])
                if match:
                    instruction_id = match.group(1)
            
            if instruction_id:
                ev['detailed_cities'] = fetch_pre_alarm_cities(instruction_id, city_by_id)
                print(f"Pre-alarm {ev['time']} matched {len(ev['detailed_cities'])} cities.")
                
        elif ev['type'] == 'ALARM':
            # ALARM format: "• Region: City1, City2"
            matches = re.findall(r"• ([^:]+): ([^\n•]+)", ev['raw_text'])
            for reg_name, cities_str in matches:
                cities = [c.strip() for c in cities_str.split(',')]
                for city_name in cities:
                    # Clean up things like specific district notes
                    cleaned_name = re.sub(r'\(.*?\)', '', city_name).strip().lower()
                    if cleaned_name in city_by_ru:
                        ev['detailed_cities'].append(city_by_ru[cleaned_name])
                    else:
                        # Try partial match or leave coords null
                        found = False
                        for ru_key, c_info in city_by_ru.items():
                            if cleaned_name in ru_key or ru_key in cleaned_name:
                                ev['detailed_cities'].append(c_info)
                                found = True
                                break
                        if not found:
                            pass # Can't map this specific spot

    return events

def create_sequences(events):
    sequences = []
    current_sequence = None
    
    events.sort(key=lambda x: x['time'])
    
    for event in events:
        event_time = datetime.fromisoformat(event['time'])
        
        start_new = False
        if event['type'] == "PRE_ALARM":
            start_new = True
        elif not current_sequence:
            start_new = True
        elif (event_time - current_sequence['lastTime']).total_seconds() > 1200: # 20 mins max gap
            start_new = True
            
        if start_new:
            if current_sequence:
                sequences.append(current_sequence)
            
            seq_type = "PREEMPTIVE_SEQUENCE" if event['type'] == "PRE_ALARM" else "STANDALONE_ALARM"
            current_sequence = {
                "id": len(sequences) + 1,
                "type": seq_type,
                "startTime": event['time'],
                "lastTime": event_time,
                "preAlarmCities": event['detailed_cities'] if event['type'] == "PRE_ALARM" else [],
                "realAlarmCities": event['detailed_cities'] if event['type'] == "ALARM" else [],
                "allEvents": [event]
            }
        else:
            current_sequence['allEvents'].append(event)
            current_sequence['lastTime'] = event_time
            if event['type'] == "ALARM":
                current_sequence['realAlarmCities'].extend(event['detailed_cities'])
            elif event['type'] == "PRE_ALARM":
                current_sequence['preAlarmCities'].extend(event['detailed_cities'])
            
    if current_sequence:
        sequences.append(current_sequence)
        
    # Deduplicate cities in sequences based on ID for a clean frontend payload
    for seq in sequences:
        pac = {}
        for c in seq['preAlarmCities']:
            pac[c['id']] = c
        seq['preAlarmCities'] = list(pac.values())
        
        rac = {}
        for c in seq['realAlarmCities']:
            rac[c['id']] = c
        seq['realAlarmCities'] = list(rac.values())
        
    return sequences

if __name__ == "__main__":
    city_by_id, city_by_ru = load_cities_indexes()
    print("Loaded cities DB.")
    
    filepath = 'telegram.json'
    events = parse_telegram_data(filepath, city_by_id, city_by_ru)
    
    # Filter for 2026
    events = [e for e in events if "2026" in e['time']]
    
    sequences = create_sequences(events)
    
    with open('data.json', 'w', encoding='utf-8') as f:
        json.dump(sequences, f, indent=2, ensure_ascii=False, default=str)
        
    print(f"Processed {len(sequences)} sequences to data.json")
