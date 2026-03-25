import pandas as pd
import json
import os
import datetime

def load_city_map(path='cities.json'):
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    cities_dict = data.get('cities', {})
    name_to_id = {name: str(info['id']) for name, info in cities_dict.items()}
    return name_to_id

def reconstruct_sessions():
    name_to_id = load_city_map()
    
    # 1. Load Data
    print("Loading CSVs...")
    alerts = pd.read_csv('history_processing/tzevaadom_alerts.csv', encoding='utf-8-sig', on_bad_lines='skip')
    warnings = pd.read_csv('history_processing/tzevaadom_early_warnings.csv', encoding='utf-8-sig', on_bad_lines='skip')
    ends = pd.read_csv('history_processing/tzevaadom_event_ended.csv', encoding='utf-8-sig', on_bad_lines='skip')
    
    # Pre-filter for valid timestamps
    for df in [alerts, warnings, ends]:
        df['time'] = pd.to_datetime(df['time'], errors='coerce')
        df.dropna(subset=['time'], inplace=True)
    
    # Map cities to IDs (Vectorized)
    print("Mapping city IDs...")
    for df in [alerts, warnings, ends]:
        df['city_id'] = df['city'].map(name_to_id)
        df.dropna(subset=['city_id'], inplace=True)

    # 2. Aggregating by Notification ID
    print("Aggregating alerts by ID...")
    # For alerts, we also want the origin
    alerts_agg = alerts.groupby('id').agg({
        'time': 'min',
        'city_id': lambda x: set(x),
        'category': 'first',
        'origin': 'first'
    }).rename(columns={'time': 'start_time', 'city_id': 'affected_city_ids'})

    print("Aggregating warnings by ID...")
    warnings_agg = warnings.groupby('id').agg({
        'time': 'min',
        'city_id': lambda x: set(x),
        'category': 'first',
        'origin': 'first'
    }).rename(columns={'time': 'start_time', 'city_id': 'affected_city_ids'})

    print("Aggregating end events by ID...")
    ends_agg = ends.groupby('id').agg({
        'time': 'min',
        'city_id': lambda x: set(x)
    }).rename(columns={'time': 'end_time', 'city_id': 'end_city_ids'}).sort_values('end_time')

    # 3. Aggregation & Session Synthesis
    # We first process Warnings (14) then Alerts (1/2)
    # If an alert happens during an active warning for the same cities, it's absorbed into that session.

    # Pre-cache end event times and city sets for faster lookup
    end_event_list = ends_agg.reset_index().to_dict('records')
    end_times = [ee['end_time'] for ee in end_event_list]
    from bisect import bisect_left

    sessions = []
    absorbed_alert_ids = set()

    print(f"Processing {len(warnings_agg)} early warnings...")
    for sid, row in warnings_agg.iterrows():
        t_start = row['start_time']
        warned_c_set = row['affected_city_ids']
        
        # Find matching End Event (13)
        found_end = None
        start_idx = bisect_left(end_times, t_start)
        for i in range(start_idx, len(end_event_list)):
            ee = end_event_list[i]
            if ee['end_time'] > t_start and (warned_c_set & ee['end_city_ids']):
                found_end = ee
                break
        
        if not found_end: continue
        t_end = found_end['end_time']
        
        # Absorption: Find all Alerts (1/2) that started during this warning session
        attacks = []
        alerted_c_set = set()
        
        mask = (alerts_agg['start_time'] >= t_start) & (alerts_agg['start_time'] <= t_end)
        candidate_alerts = alerts_agg[mask].sort_values('start_time')
        
        for aid, arow in candidate_alerts.iterrows():
            if warned_c_set & arow['affected_city_ids']:
                attacks.append({
                    "time": arow['start_time'].strftime('%Y-%m-%d %H:%M:%S'),
                    "city_ids": list(arow['affected_city_ids'])
                })
                alerted_c_set |= arow['affected_city_ids']
                absorbed_alert_ids.add(str(aid))
                
        attack_times = sorted(list(set([a['time'] for a in attacks])))
        
        lead_time_sec = 0
        if attacks:
            t_first_attack = pd.to_datetime(attacks[0]['time'])
            lead_time_sec = int((t_first_attack - t_start).total_seconds())

        sessions.append({
            "session_id": str(sid),
            "start_type": 14,
            "origin": row['origin'] if pd.notna(row['origin']) else "Iran",
            "warned_city_ids": list(warned_c_set),
            "alerted_city_ids": list(alerted_c_set),
            "affected_city_ids": list(warned_c_set | alerted_c_set),
            "start_time": t_start.strftime('%Y-%m-%d %H:%M:%S'),
            "attack_times": attack_times,
            "attacks": attacks,
            "end_time": t_end.strftime('%Y-%m-%d %H:%M:%S'),
            "duration_sec": int((t_end - t_start).total_seconds()),
            "lead_time_sec": lead_time_sec
        })

    print(f"Processing {len(alerts_agg)} alerts (checking for standalone)...")
    for sid, row in alerts_agg.iterrows():
        if str(sid) in absorbed_alert_ids:
            continue
            
        t_start = row['start_time']
        alerted_c_set = row['affected_city_ids']
        
        # Find matching End Event (13)
        found_end = None
        start_idx = bisect_left(end_times, t_start)
        for i in range(start_idx, len(end_event_list)):
            ee = end_event_list[i]
            if ee['end_time'] > t_start and (alerted_c_set & ee['end_city_ids']):
                found_end = ee
                break
        
        if not found_end: continue
        t_end = found_end['end_time']
        
        sessions.append({
            "session_id": str(sid),
            "start_type": int(row['category']),
            "origin": row['origin'] if pd.notna(row['origin']) else "other",
            "warned_city_ids": [],
            "alerted_city_ids": list(alerted_c_set),
            "affected_city_ids": list(alerted_c_set),
            "start_time": t_start.strftime('%Y-%m-%d %H:%M:%S'),
            "attack_times": [t_start.strftime('%Y-%m-%d %H:%M:%S')],
            "attacks": [{
                "time": t_start.strftime('%Y-%m-%d %H:%M:%S'),
                "city_ids": list(alerted_c_set)
            }],
            "end_time": t_end.strftime('%Y-%m-%d %H:%M:%S'),
            "duration_sec": int((t_end - t_start).total_seconds()),
            "lead_time_sec": 0
        })

    # Sort final sessions by start_time
    sessions.sort(key=lambda x: x['start_time'])

    # 4. Save Output
    output_path = 'history_processing/shelter_sessions.json'
    print(f"Saving {len(sessions)} sessions to {output_path}...")
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(sessions, f, indent=2, ensure_ascii=False)
    
    print("Done.")

if __name__ == "__main__":
    reconstruct_sessions()
