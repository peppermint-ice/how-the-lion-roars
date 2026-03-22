import json

with open('azakot_heb.json', 'r', encoding='utf-8') as f:
    d = json.load(f)

def get_text(m):
    text = ""
    if isinstance(m.get('text'), list):
        for part in m['text']:
            if isinstance(part, dict):
                text += part.get('text', '')
            else:
                text += str(part)
    elif isinstance(m.get('text'), str):
        text = m.get('text')
    return text

count = 0
for m in d.get('messages', []):
    text = get_text(m)
    if 'ירי רקטות' in text:
        print(f"ID {m['id']} | {m['date']}")
        print(text)
        print("====")
        count += 1
        if count >= 3:
            break
