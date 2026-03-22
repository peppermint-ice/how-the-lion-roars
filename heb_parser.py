"""
Dual-source Azakot parser
  - Pre-alarms:  extracted from azakot_heb.json (Telegram) — merge consecutive within 3 min
  - Real alarms: extracted from azakot_source.csv — one row per city per alert ID
  - Linking rule (Iran attacks only):
      * Alarm must start ≤15 min after the pre-alarm
      * ≥80% of the alarm's cities must be listed in the pre-alarm
      * Best overlap wins; ties broken by most-recent pre-alarm
  - Lebanon/Gaza → STANDALONE_ALARM always
  - Cutoff: last timestamp in the Telegram dump
"""

import csv
import json
import re
from datetime import datetime

# ── constants ─────────────────────────────────────────────────────────────────
MERGE_GAP_SEC          = 180   # 3 min: collapse split Telegram pre-alarm messages
PRE_ALARM_LINK_GAP_SEC = 900   # 15 min: alarm must start within 15 min AFTER the pre-alarm
OVERLAP_THRESHOLD      = 0.80  # 80%: min fraction of alarm cities that must be in pre-alarm
STANDALONE_BURST_SEC   = 300   # 5 min: consecutive standalone alarms burst-merged

PRE_ALARM_MARKER = 'בדקות הקרובות צפויות להתקבל'
END_PHRASE_RE    = re.compile(r'(היכנסו למרחב|ניתן לצאת|הישמעו|האירוע הסתיים|סיום שהייה)')
COUNTDOWN_RE     = re.compile(r'\s*\([^)]*\)\s*$')

IRAN_ORIGINS    = {'Iran', ''}
LNKD_ORIGINS    = IRAN_ORIGINS          # these get linked to the pre-alarm
STANDALONE_ORGS = {'Lebanon', 'Gaza'}   # these are always standalone

# ── city DB ──────────────────────────────────────────────────────────────────
def load_cities():
    with open('cities.json', encoding='utf-8') as f:
        raw = json.load(f)
    cities = raw.get('cities', {})
    by_he = {}
    for _, info in cities.items():
        if not isinstance(info, dict):
            continue
        he = info.get('he', '').strip()
        if he:
            by_he[he] = info
    return by_he

def lookup_city(name, by_he):
    name = name.strip()
    if name in by_he:
        return by_he[name]
    clean = COUNTDOWN_RE.sub('', name).strip()
    return by_he.get(clean)

def city_obj(info):
    return {
        'id':  info.get('id'),
        'he':  info.get('he', ''),
        'ru':  info.get('ru', info.get('he', '')),
        'en':  info.get('en', ''),
        'lat': info.get('lat'),
        'lng': info.get('lng'),
    }

# ── helpers ───────────────────────────────────────────────────────────────────
def get_text(msg):
    parts = msg.get('text', '')
    if isinstance(parts, list):
        return ''.join(p.get('text', '') if isinstance(p, dict) else str(p) for p in parts)
    return parts or ''

def parse_dt_csv(s):
    """Fallback parser for multiple date formats"""
    s = s.strip()
    try:
        return datetime.strptime(s, '%Y-%m-%d %H:%M:%S')
    except ValueError:
        return datetime.strptime(s, '%d/%m/%Y %H:%M')

# ── Step 1: find Telegram cutoff ──────────────────────────────────────────────
def get_telegram_cutoff(filepath):
    with open(filepath, encoding='utf-8') as f:
        data = json.load(f)
    last_dt = None
    for m in data.get('messages', []):
        dt_str = m.get('date')
        if dt_str:
            try:
                dt = datetime.fromisoformat(dt_str)
                if last_dt is None or dt > last_dt:
                    last_dt = dt
            except ValueError:
                pass
    return last_dt

# ── Step 2: extract + merge pre-alarms from Telegram ──────────────────────────
def extract_pre_alarms(filepath, by_he, start_time=None):
    with open(filepath, encoding='utf-8') as f:
        data = json.load(f)

    raw_events = []
    for msg in data.get('messages', []):
        dt_str = msg.get('date')
        if not dt_str:
            continue
        dt = datetime.fromisoformat(dt_str)
        if start_time and dt <= start_time:
            continue
        
        text = get_text(msg)
        if PRE_ALARM_MARKER not in text:
            continue
            
        cities = _extract_cities_from_text(text, by_he)
        raw_events.append({
            'time': dt,
            'cities': cities,
        })

    raw_events.sort(key=lambda e: e['time'])

    # Merge consecutive pre-alarm messages within MERGE_GAP_SEC
    merged = []
    for ev in raw_events:
        if merged and (ev['time'] - merged[-1]['time']).total_seconds() <= MERGE_GAP_SEC:
            # Add new cities to previous event
            existing = {c['id'] for c in merged[-1]['cities']}
            for c in ev['cities']:
                if c['id'] not in existing:
                    merged[-1]['cities'].append(c)
                    existing.add(c['id'])
        else:
            merged.append(dict(ev))

    return merged  # list of {time: datetime, cities: [city_obj, ...]}

def _extract_cities_from_text(text, by_he):
    matched, seen = [], set()
    for line in text.splitlines():
        line = line.strip()
        if END_PHRASE_RE.search(line):
            continue
        for candidate in re.split(r'[,،]', line):
            name = COUNTDOWN_RE.sub('', candidate).strip()
            if not name:
                continue
            info = lookup_city(name, by_he)
            if info and info['id'] not in seen:
                matched.append(city_obj(info))
                seen.add(info['id'])
    return matched

# ── Step 3: load alarms from CSV ──────────────────────────────────────────────
def load_csv_alarms(filepath, by_he, cutoff_dt=None, start_time=None):
    """
    Returns a list of alarm dicts, each being one logical alarm event:
    {
      time:   datetime,
      origin: str,
      cities: [city_obj, ...],
    }
    Grouped by (id, time_str) pairs to handle reused IDs across conflict periods.
    Rows after cutoff are excluded.
    """
    # Use (ev_id, time_str) as composite key — IDs are reused across years
    alarm_map = {}
    order = []

    with open(filepath, encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        for row in reader:
            time_str = row.get('time', '').strip()
            try:
                dt = parse_dt_csv(time_str)
            except ValueError:
                continue
            if cutoff_dt and dt > cutoff_dt:
                continue
            if start_time and dt <= start_time:
                continue
            ev_id     = row.get('id', '').strip()
            origin    = row.get('origin', '').strip()
            city_name = row.get('cities', '').strip()

            # Rule 1: Find the last line that has ALL fields filled. 
            # If any are empty (e.g. untagged realtime alarms), discard them.
            if not origin or not city_name or not ev_id or not row.get('threat', '').strip() or not row.get('description', '').strip():
                continue

            key = (ev_id, time_str)   # composite key handles ID reuse
            if key not in alarm_map:
                alarm_map[key] = {
                    'time':   dt,
                    'origin': origin,
                    'cities': [],
                    'seen':   set(),
                }
                order.append(key)

            info = lookup_city(city_name, by_he)
            if info and info['id'] not in alarm_map[key]['seen']:
                alarm_map[key]['cities'].append(city_obj(info))
                alarm_map[key]['seen'].add(info['id'])

    result = []
    for key in order:
        ev = alarm_map[key]
        result.append({
            'time':   ev['time'],
            'origin': ev['origin'],
            'cities': ev['cities'],
        })
    result.sort(key=lambda e: e['time'])
    return result

# ── Step 4: build sequences ───────────────────────────────────────────────────

def _city_set(city_list):
    """Return set of city IDs from a city list."""
    return {c['id'] for c in city_list if c.get('id') is not None}

def _overlap_fraction(alarm_cities, pre_alarm_city_set):
    """Fraction of alarm cities that appear in the pre-alarm city set."""
    alarm_ids = _city_set(alarm_cities)
    if not alarm_ids:
        return 0.0
    return len(alarm_ids & pre_alarm_city_set) / len(alarm_ids)

def _clean(seq):
    seq.pop('_last_time', None)
    seq.pop('_seen', None)
    return seq

def build_sequences(pre_alarms, csv_alarms):
    """
    Matching strategy for Iran alarms:
      1. The alarm starts within PRE_ALARM_LINK_GAP_SEC (15 min) AFTER a pre-alarm.
      2. At least OVERLAP_THRESHOLD (80%) of the alarm's cities were listed in the pre-alarm.
      Among valid candidates, the pre-alarm with the highest overlap score wins.
      Ties broken by most-recent pre-alarm.
    Lebanon/Gaza alarms are always STANDALONE.
    """
    # Pre-compute city sets for every pre-alarm (fast membership test)
    pa_city_sets = [_city_set(pa['cities']) for pa in pre_alarms]

    iran_groups     = {}   # pa_idx → [alarm, ...]
    standalone_alarms = []

    for alarm in csv_alarms:
        if alarm['origin'] in LNKD_ORIGINS:
            best_pa_idx  = None
            best_overlap = -1.0

            for pa_idx, pa in enumerate(pre_alarms):
                # Gate 1: alarm must come AFTER the pre-alarm, within the window
                gap = (alarm['time'] - pa['time']).total_seconds()
                if gap < 0 or gap > PRE_ALARM_LINK_GAP_SEC:
                    continue
                # Gate 2: city overlap must meet threshold
                overlap = _overlap_fraction(alarm['cities'], pa_city_sets[pa_idx])
                if overlap < OVERLAP_THRESHOLD:
                    continue
                # Best = highest overlap; tie → latest pre-alarm
                if (overlap > best_overlap or
                        (overlap == best_overlap and
                         best_pa_idx is not None and
                         pa['time'] > pre_alarms[best_pa_idx]['time'])):
                    best_overlap = overlap
                    best_pa_idx  = pa_idx

            if best_pa_idx is not None:
                iran_groups.setdefault(best_pa_idx, []).append(alarm)
            else:
                standalone_alarms.append(alarm)
        else:
            standalone_alarms.append(alarm)

    sequences = []
    seq_id = 1

    # --- Emit one PREEMPTIVE_SEQUENCE per pre-alarm (linked alarms or not) ---
    for pa_idx, pa in enumerate(pre_alarms):
        linked = iran_groups.get(pa_idx, [])
        real_cities, seen_ids = [], set()
        for alarm in linked:
            for c in alarm['cities']:
                if c['id'] not in seen_ids:
                    real_cities.append(c)
                    seen_ids.add(c['id'])

        sequences.append({
            'id':              seq_id,
            'type':            'PREEMPTIVE_SEQUENCE',
            'startTime':       pa['time'].isoformat(),
            'preAlarmCities':  [c['id'] for c in pa['cities']],
            'realAlarmCities': [c['id'] for c in real_cities],
        })
        seq_id += 1

    # --- Emit STANDALONE_ALARMs (burst-merge within 5 min) ---
    standalone_alarms.sort(key=lambda e: e['time'])
    current = None
    for alarm in standalone_alarms:
        if current is None:
            current = {
                'id':              seq_id,
                'type':            'STANDALONE_ALARM',
                'startTime':       alarm['time'].isoformat(),
                'preAlarmCities':  [],
                'realAlarmCities': [c['id'] for c in alarm['cities']],
                '_last_time':      alarm['time'],
                '_seen':           _city_set(alarm['cities']),
            }
            seq_id += 1
        else:
            gap = (alarm['time'] - current['_last_time']).total_seconds()
            if gap <= STANDALONE_BURST_SEC:
                current['_last_time'] = alarm['time']
                for c in alarm['cities']:
                    if c['id'] not in current['_seen']:
                        current['realAlarmCities'].append(c['id'])
                        current['_seen'].add(c['id'])
            else:
                sequences.append(_clean(current))
                current = {
                    'id':              seq_id,
                    'type':            'STANDALONE_ALARM',
                    'startTime':       alarm['time'].isoformat(),
                    'preAlarmCities':  [],
                    'realAlarmCities': [c['id'] for c in alarm['cities']],
                    '_last_time':      alarm['time'],
                    '_seen':           _city_set(alarm['cities']),
                }
                seq_id += 1
    if current:
        sequences.append(_clean(current))

    # Sort newest-first, re-number
    sequences.sort(key=lambda s: s['startTime'], reverse=True)
    for i, s in enumerate(sequences, 1):
        s['id'] = i

    return sequences


# ── main ─────────────────────────────────────────────────────────────────────
def run_full_rebuild():
    by_he = load_cities()
    print(f"Loaded {len(by_he)} Hebrew city names.")

    # Load Real alarms from CSV (use START_FILTER if needed, or stick to Feb 27 for full)
    START_FILTER = datetime(2026, 2, 27)
    all_csv = load_csv_alarms('azakot_source.csv', by_he, cutoff_dt=datetime.max)
    csv_alarms = [a for a in all_csv if a['time'] >= START_FILTER]
    
    if csv_alarms:
        csv_max_time = max(a['time'] for a in csv_alarms)
    else:
        csv_max_time = datetime.max
        
    print(f"CSV alarm events (2026): {len(csv_alarms)}, Max CSV Date: {csv_max_time}")

    # Pre-alarms from Telegram (strictly starting from Feb 27)
    all_pre = extract_pre_alarms('azakot_heb_archive.json', by_he)
    pre_alarms = [p for p in all_pre if p['time'] >= START_FILTER and p['time'] <= csv_max_time]
    print(f"Pre-alarms (2026, <= CSV cutoff): {len(pre_alarms)}")

    origin_counts = {}
    for a in csv_alarms:
        origin_counts[a['origin']] = origin_counts.get(a['origin'], 0) + 1
    print(f"Origin breakdown: {origin_counts}")

    sequences = build_sequences(pre_alarms, csv_alarms)

    print(f"Sequences: {len(sequences)} ({len([s for s in sequences if s['type']=='PREEMPTIVE_SEQUENCE'])} preemptive, {len([s for s in sequences if s['type']=='STANDALONE_ALARM'])} standalone)")
    
    with open('data.json', 'w', encoding='utf-8') as f:
        json.dump(sequences, f, ensure_ascii=False, indent=2, default=str)
    print(f"\nSaved {len(sequences)} sequences to data.json")

if __name__ == '__main__':
    run_full_rebuild()
