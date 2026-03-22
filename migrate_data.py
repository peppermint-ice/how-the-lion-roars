import json
import os

def migrate():
    print("Migrating data.json to ID-mapped format...")
    
    if not os.path.exists('data.json'):
        print("data.json not found.")
        return

    with open('cities.json', 'r', encoding='utf-8') as f:
        cities_data = json.load(f)
    
    # Handle both {"cities": {...}} and flat list formats
    if isinstance(cities_data, dict) and 'cities' in cities_data:
        cities_list = list(cities_data['cities'].values())
    elif isinstance(cities_data, list):
        cities_list = cities_data
    else:
        cities_list = list(cities_data.values())

    cities_map = {str(c['id']): c for c in cities_list}

    with open('data.json', 'r', encoding='utf-8') as f:
        old_data_json = json.load(f)

    if isinstance(old_data_json, dict):
        old_data = old_data_json.get('sequences', [])
    else:
        old_data = old_data_json

    new_sequences = []
    for seq in old_data:
        # Convert preAlarmCities
        pre_ids = []
        for c in seq.get('preAlarmCities', []):
            if isinstance(c, dict):
                pre_ids.append(c['id'])
            else:
                pre_ids.append(c) # already ID

        # Convert realAlarmCities
        real_ids = []
        for c in seq.get('realAlarmCities', []):
            if isinstance(c, dict):
                real_ids.append(c['id'])
            else:
                real_ids.append(c) # already ID

        new_sequences.append({
            "id": seq['id'],
            "type": seq['type'],
            "startTime": seq['startTime'],
            "preAlarmCities": pre_ids,
            "realAlarmCities": real_ids
        })

    final_data = {
        "cities": cities_map,
        "sequences": new_sequences
    }

    with open('data.json', 'w', encoding='utf-8') as f:
        json.dump(final_data, f, ensure_ascii=False, indent=1)
    
    print(f"Migration complete. New size: {os.path.getsize('data.json')} bytes")

if __name__ == "__main__":
    migrate()
