import requests
import re
import json

url = 'https://www.tzevaadom.co.il/ru/instructions/748'
r = requests.get(url)
text = r.text

print("Is there inline JSON?")
matches = re.findall(r'<script.*?>\s*var\s+[a-zA-Z0-9_]+\s*=\s*(\{.*?\})\s*;\s*</script>', text, re.DOTALL)
for m in matches:
    print(m[:200])

print("\nAre there any endpoints like /api/instructions directly in JS?")
js_links = re.findall(r'<script\s+src="([^"]+)"', text)
for link in js_links:
    if link.startswith('/'):
        link = 'https://www.tzevaadom.co.il' + link
    print(f"Checking JS: {link}")
    try:
        js_text = requests.get(link).text
        apis = re.findall(r'/api/[a-zA-Z0-9_/-]+', js_text)
        if apis:
            print(f"Found APIs in {link}:")
            print(list(set(apis)))
    except Exception as e:
        pass
