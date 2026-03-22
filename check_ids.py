import json

with open('cities.json', 'r', encoding='utf-8') as f:
    cities = json.load(f)

# The cities returned by the system-messages/id/748
target_ids = [1371, 1393, 1409, 1329, 1076, 2191, 2201, 1078, 1380, 1401]

found = []
for k, v in cities.items():
    if not isinstance(v, dict):
        continue
    if v.get('id') in target_ids:
        found.append((v.get('id'), v.get('he'), v.get('ru')))

print(f"Out of {len(target_ids)} target IDs, we found {len(found)} in cities.json.")
if found:
    print(found[:5])
