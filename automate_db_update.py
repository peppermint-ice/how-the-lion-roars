import requests
import csv
import io
import json
import os
import datetime
import subprocess
import time
import sys

# Add history_processing to path for imports
sys.path.append("history_processing")
from download_tzeva_data import download_tzeva_data
from download_tzeva_instructions import download_instructions

# Paths (using relative paths consistent with the scripts)
PATHS_FILE = "utils/paths.json"
ALERTS_CSV = "history_processing/tzevaadom_alerts.csv"
WARNINGS_CSV = "history_processing/tzevaadom_early_warnings.csv"
ENDS_CSV = "history_processing/tzevaadom_event_ended.csv"
SESSIONS_JSON = "history_processing/shelter_sessions.json"
RECONSTRUCT_SCRIPT = "history_processing/reconstruct_sessions.py"

def load_paths():
    with open(PATHS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def get_latest_local_alert_id():
    """Returns the maximum ID found in tzevaadom_alerts.csv"""
    if not os.path.exists(ALERTS_CSV):
        return 0
    max_id = 0
    with open(ALERTS_CSV, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                max_id = max(max_id, int(row['id']))
            except:
                continue
    return max_id

def get_latest_alarms_id(alarms_url):
    """Downloads alarms.csv and finds the latest ID with all fields filled (including origin) in 2026+."""
    print(f"Downloading {alarms_url}...")
    r = requests.get(alarms_url)
    r.raise_for_status()
    f = io.StringIO(r.content.decode('utf-8-sig'))
    reader = csv.DictReader(f)
    
    latest_id = 0
    latest_time = None
    start_2026 = datetime.datetime(2026, 1, 1)
    
    for row in reader:
        if row.get('id') and row.get('origin') and row['origin'].strip():
            try:
                curr_time = datetime.datetime.strptime(row['time'], '%Y-%m-%d %H:%M:%S')
                if curr_time < start_2026:
                    continue
                cid = int(row['id'])
                latest_id = max(latest_id, cid)
                if latest_time is None or curr_time > latest_time:
                    latest_time = curr_time
            except:
                continue
    return latest_id, latest_time

def clean_ongoing_events(start_id):
    """
    Deletes alerts/warnings matching ID >= start_id from CSVs if they don't have a matching end event.
    """
    print(f"Cleaning up ongoing events (IDs >= {start_id})...")
    try:
        import pandas as pd
        alerts = pd.read_csv(ALERTS_CSV, encoding='utf-8-sig')
        warnings = pd.read_csv(WARNINGS_CSV, encoding='utf-8-sig')
        ends = pd.read_csv(ENDS_CSV, encoding='utf-8-sig')
    except Exception as e:
        print(f"Error reading CSVs for cleanup: {e}")
        return

    for name, df in [("alerts", alerts), ("warnings", warnings), ("ends", ends)]:
        orig_len = len(df)
        df['time'] = pd.to_datetime(df['time'], errors='coerce')
        df.dropna(subset=['time'], inplace=True)
        if len(df) < orig_len:
            print(f"   [!] Dropped {orig_len - len(df)} rows from {name} due to invalid timestamps.")

    end_event_list = ends.groupby('id').agg({'time': 'min', 'city': lambda x: set(x)}).sort_values('time').reset_index().to_dict('records')

    def has_end(t_start, cities_set):
        for ee in end_event_list:
            if ee['time'] > t_start and (cities_set & ee['city']):
                return True
        return False

    alert_ids_to_remove = set()
    for aid, group in alerts[alerts['id'] >= start_id].groupby('id'):
        t_start = group['time'].min()
        c_set = set(group['city'])
        if not has_end(t_start, c_set):
            print(f"   [!] Alert ID {aid} is ongoing or missing 'ended' msg. Deleting.")
            alert_ids_to_remove.add(aid)

    warn_ids_to_remove = set()
    for wid, group in warnings[warnings['id'] >= start_id].groupby('id'):
        t_start = group['time'].min()
        c_set = set(group['city'])
        if not has_end(t_start, c_set):
            print(f"   [!] Warning ID {wid} is ongoing or missing 'ended' msg. Deleting.")
            warn_ids_to_remove.add(wid)

    alerts_clean = alerts[~alerts['id'].isin(alert_ids_to_remove)]
    warnings_clean = warnings[~warnings['id'].isin(warn_ids_to_remove)]

    alerts_clean.to_csv(ALERTS_CSV, index=False, encoding='utf-8-sig')
    warnings_clean.to_csv(WARNINGS_CSV, index=False, encoding='utf-8-sig')
    print("Cleanup done.")

def verify_ids_with_alarms(alarms_url):
    """
    Verifies that all unique IDs from alarms.csv (2026+) exist in tzevaadom_alerts.csv.
    Only checks IDs for threats 0 (Red Alert) and 5 (Hostile Aircraft).
    """
    print("Step 6: Verifying IDs with alarms.csv...")
    try:
        # Load local IDs
        local_ids = set()
        if os.path.exists(ALERTS_CSV):
            with open(ALERTS_CSV, 'r', encoding='utf-8-sig') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    local_ids.add(str(row['id']))

        # Load remote IDs (2026+)
        r = requests.get(alarms_url)
        r.raise_for_status()
        f = io.StringIO(r.content.decode('utf-8-sig'))
        reader = csv.DictReader(f)
        
        missing_ids = set()
        start_2026 = datetime.datetime(2026, 1, 1)
        
        for row in reader:
            # Column indices: time=0, threat=2, id=3
            # Threat mapping: 0=1, 5=2
            if row.get('id') and row.get('threat') in ['0', '5']:
                try:
                    dt = datetime.datetime.strptime(row['time'], '%Y-%m-%d %H:%M:%S')
                    if dt >= start_2026:
                        rid = str(row['id'])
                        if rid not in local_ids:
                            missing_ids.add(rid)
                except:
                    continue
        
        if missing_ids:
            print(f"   [WARNING] {len(missing_ids)} IDs are present in alarms.csv but missing in local data: {sorted(list(missing_ids))[:10]}...")
            return False
        else:
            print("   [SUCCESS] All 2026+ alert IDs from alarms.csv are present in the local database.")
            return True
    except Exception as e:
        print(f"   [ERROR] Verification failed: {e}")
        return False

def main():
    paths = load_paths()
    alarms_url = paths.get("alarms.csv")
    
    print("Step 1: Checking for updates...")
    local_id = get_latest_local_alert_id()
    remote_id, latest_alert_time = get_latest_alarms_id(alarms_url)
    
    print(f"   Local Latest Alert ID: {local_id}")
    print(f"   Remote Latest Full ID: {remote_id} (at {latest_alert_time})")
    
    if remote_id <= local_id:
        print("   No new updates with origins found. Running instructions cleanup anyway.")
    else:
        print(f"   Action: Fetching {remote_id - local_id} new alert IDs...")
        download_tzeva_data(local_id + 1, remote_id, append=True)
        print("   Alerts update finished.")
    
    print("Step 3: Updating Instructions CSVs...")
    # Fetch instructions until 1 hour past the latest alert
    cutoff = latest_alert_time + datetime.timedelta(hours=1)
    # Start ID for instructions needs to be determined
    def get_max_inst_id():
        mx = 0
        for p in [WARNINGS_CSV, ENDS_CSV]:
            if os.path.exists(p):
                with open(p, 'r', encoding='utf-8-sig') as f:
                    reader = csv.DictReader(f)
                    for r in reader:
                        try: mx = max(mx, int(r['id']))
                        except: continue
        return mx
    
    inst_start_id = get_max_inst_id() + 1
    print(f"   Action: Checking for new instructions from ID {inst_start_id}...")
    
    # We don't know the remote end_id for instructions accurately without scanning API, 
    # but download_instructions will stop if max_time is reached or too many 404s.
    download_instructions(inst_start_id, inst_start_id + 2000, append=True, max_time=cutoff)
    print("   Instructions update finished.")
    
    print("Step 4: Cleaning ongoing events...")
    clean_ongoing_events(local_id + 1)
    
    print("Step 5: Reconstructing sessions...")
    print("   Action: Running history_processing/reconstruct_sessions.py...")
    result = subprocess.run(["python", RECONSTRUCT_SCRIPT], capture_output=True, text=True)
    if result.stdout:
        print("   [Reconstruct Summary]:")
        for line in result.stdout.splitlines()[-5:]: # Print last 5 lines of summary
            print(f"      {line}")
            
    if result.stderr:
        print(f"   [Reconstruct Error]:\n{result.stderr}")
    
    if os.path.exists(SESSIONS_JSON):
        import shutil
        shutil.copy(SESSIONS_JSON, "frontend/public/shelter_sessions.json")
        print(f"   Action: Copied {SESSIONS_JSON} to frontend/public/")

    print("Step 6: Final Verification...")
    verify_ids_with_alarms(alarms_url)

    print("\n[SUCCESS] Database update process completed.")

if __name__ == "__main__":
    try:
        import pandas as pd
    except ImportError:
        print("Installing pandas...")
        subprocess.run(["pip", "install", "pandas"])
        
    main()
