import json
import re

def get_text(msg):
    text = ""
    if isinstance(msg.get('text'), list):
        for part in msg['text']:
            if isinstance(part, dict):
                text += part.get('text', '')
            else:
                text += str(part)
    else:
        text = msg.get('text', '')
    return text

with open('telegram.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

alarm_regex = r"🔴 Цева Адом"
pre_alarm_regex = r"Раннее предупреждение|Expected Alerts"

alarms_count = 0
pre_alarms_count = 0
bullet_msgs_count = 0

for msg in data['messages']:
    text = get_text(msg)
    if re.search(alarm_regex, text):
        alarms_count += 1
    elif re.search(pre_alarm_regex, text):
        pre_alarms_count += 1
    elif text.startswith("•"):
        bullet_msgs_count += 1

print(f"Alarms: {alarms_count}")
print(f"Pre-Alarms: {pre_alarms_count}")
print(f"Bullet Messages: {bullet_msgs_count}")
