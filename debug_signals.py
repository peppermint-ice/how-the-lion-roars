import json

with open('telegram.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

for msg in data['messages'][-50:]:
    text = ""
    if isinstance(msg.get('text'), list):
        for part in msg['text']:
            if isinstance(part, dict):
                text += part.get('text', '')
            else:
                text += str(part)
    else:
        text = msg.get('text', '')
    
    if text:
        print(f"ID: {msg.get('id')} | Date: {msg.get('date')}")
        print(text)
        print("-" * 20)
