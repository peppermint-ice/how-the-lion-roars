import json
import requests
import os

class MappingAgent:
    def __init__(self, cache_file='city_coords.json'):
        self.cache_file = cache_file
        self.coords = {}
        self.load_cache()

    def load_cache(self):
        if os.path.exists(self.cache_file):
            with open(self.cache_file, 'r', encoding='utf-8') as f:
                self.coords = json.load(f)
        else:
            self.fetch_external_data()

    def fetch_external_data(self):
        print("Fetching external geodata...")
        urls = [
            "https://raw.githubusercontent.com/yuvadm/geolocations-il/master/geolocations-il.geojson",
            "https://raw.githubusercontent.com/ilantnt/cities_coordinate-/master/cities.json"
        ]
        
        for url in urls:
            try:
                res = requests.get(url, timeout=10)
                if res.status_code == 200:
                    data = res.json()
                    if 'features' in data: # GeoJSON
                        for feature in data['features']:
                            name = feature['properties'].get('name')
                            name_he = feature['properties'].get('name:he')
                            coords = feature['geometry']['coordinates'] # [lng, lat]
                            if name_he:
                                self.coords[name_he] = [coords[1], coords[0]]
                            if name:
                                self.coords[name] = [coords[1], coords[0]]
                    elif isinstance(data, list): # Simple list
                        for item in data:
                            name = item.get('name') or item.get('city')
                            lat = item.get('lat') or item.get('latitude')
                            lng = item.get('lng') or item.get('longitude')
                            if name and lat and lng:
                                self.coords[name] = [float(lat), float(lng)]
                    
                    print(f"Loaded {len(self.coords)} locations from {url}")
            except Exception as e:
                print(f"Failed to fetch from {url}: {e}")

        # Add some manual common regions that might be missing or are broad
        self.coords.update({
            "Дан": [32.0853, 34.7818],
            "Шарон": [32.3214, 34.8516],
            "Иерусалим": [31.7683, 35.2137],
            "Шфела": [31.8902, 34.8113],
            "Самария": [32.1246, 35.2017],
            "Иудея": [31.5297, 35.1025],
            "Лахиш": [31.6667, 34.5833],
            "Яркон": [32.1154, 34.8876],
            "Верхняя Галилея": [33.0039, 35.4371],
            "Мертвое море": [31.5000, 35.5000],
            "Иорданская долина": [32.0000, 35.4500]
        })

        with open(self.cache_file, 'w', encoding='utf-8') as f:
            json.dump(self.coords, f, indent=2, ensure_ascii=False)

    def geocode_event(self, event):
        for reg in event['regions']:
            # Try specific cities first
            city_coords = []
            for city in reg['cities']:
                if city in self.coords:
                    city_coords.append(self.coords[city])
            
            if city_coords:
                # Use average of cities for region if multiple
                avg_lat = sum(c[0] for c in city_coords) / len(city_coords)
                avg_lng = sum(c[1] for c in city_coords) / len(city_coords)
                reg['coords'] = [avg_lat, avg_lng]
            elif reg['region'] in self.coords:
                reg['coords'] = self.coords[reg['region']]
            else:
                # Default to center of Israel
                reg['coords'] = [31.0461, 34.8516]
        return event

if __name__ == "__main__":
    mapper = MappingAgent()
    print("Mapping Agent ready.")
