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

for msg in data['messages'][-2000:]:
    text = get_text(msg)
    if "צבע אדום" in text:
        print(f"ID: {msg.get('id')} Text (first 100): {text[:100]!r}")
