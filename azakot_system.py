import json
import os
from telegram_parser import ParsingAgent
from mapping_agent import MappingAgent

class AzakotSystem:
    def __init__(self):
        self.parser = ParsingAgent('telegram.json')
        self.mapper = MappingAgent('city_coords.json')

    def run(self):
        print("--- Azakot System Startup ---")
        
        # 1. Parsing Phase
        sequences = self.parser.run()
        
        # 2. Mapping Phase
        print("Geocoding events...")
        for seq in sequences:
            for event in seq['allEvents']:
                self.mapper.geocode_event(event)
        
        # 3. Save Output
        output_file = 'data.json'
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(sequences, f, indent=2, ensure_ascii=False, default=str)
        
        print(f"--- System Run Complete. Saved to {output_file} ---")

if __name__ == "__main__":
    system = AzakotSystem()
    system.run()
