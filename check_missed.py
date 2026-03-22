import json
import re

def get_text(msg):
    text = ""
    t_field = msg.get('text', '')
    if isinstance(t_field, list):
        for part in t_field:
            if isinstance(part, dict):
                text += part.get('text', '')
            else:
                text += str(part)
    elif t_field:
        text = str(t_field)
    return text

with open('telegram.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

current_event_mock = None
missed_bullets = 0
caught_bullets = 0

for msg in data['messages']:
    text = get_text(msg).strip()
    if not text:
        continue
    
    if "🔴 Цева Адом" in text or "Раннее предупреждение" in text:
        current_event_mock = True
    elif "Инцидент завершен" in text:
        current_event_mock = None
    elif text.startswith("•"):
        if current_event_mock:
            caught_bullets += 1
        else:
            missed_bullets += 1

print(f"Caught Bullets: {caught_bullets}")
print(f"Missed Bullets: {missed_bullets}")
