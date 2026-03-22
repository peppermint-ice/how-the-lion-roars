import json

with open('telegram.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

for msg in data.get('messages', []):
    text_parts = msg.get('text', [])
    text_content = ""
    urls = []
    
    if isinstance(text_parts, list):
        for part in text_parts:
            if isinstance(part, dict):
                text_content += part.get('text', '')
                if part.get('type') == 'text_link':
                    urls.append(part.get('href'))
            else:
                text_content += str(part)
    elif isinstance(text_parts, str):
        text_content = text_parts
        
    if "Раннее предупреждение" in text_content or "Expected Alerts" in text_content:
        if urls:
            print(f"Message ID {msg.get('id')} has URL: {urls}")
