import json
import re

def get_text(msg):
    # Telegram export text can be list or string
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

for msg in data['messages'][-500:]:
    text = get_text(msg).strip()
    if text:
        # Check if it looks like a bullet but maybe has leading whitespace
        if "•" in text[:5]:
             print(f"ID: {msg.get('id')} Text (first 50): {text[:50]!r}")

for msg in data['messages'][-500:]:
    text = get_text(msg).strip()
    if "🔴 Цева Адом" in text:
        print(f"ALARM_START: {msg.get('id')} {text[:100]!r}")
