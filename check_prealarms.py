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

# Search for potential pre-alarms not caught by current regex
pre_alarm_vaguely = r"Раннее предупреждение|Expected Alerts|Alerts Expected|התרעה מוקדמת"

for msg in data['messages'][-2000:]:
    text = get_text(msg)
    if re.search(pre_alarm_vaguely, text):
        print(f"ID: {msg.get('id')} Text: {text[:200]!r}")
