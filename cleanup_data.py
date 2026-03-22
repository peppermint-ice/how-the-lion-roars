import json
import os
import shutil

def cleanup_data(file_path, cutoff_iso, public_path=None):
    print(f"Loading {file_path}...")
    with open(file_path, 'r', encoding='utf-8') as f:
        db = json.load(f)
    
    is_dict_format = isinstance(db, dict)
    if is_dict_format:
        sequences = db.get('sequences', [])
        print("Detected dictionary format.")
    else:
        sequences = db
        print("Detected list format.")
    
    initial_count = len(sequences)
    print(f"Initial entries: {initial_count}")
    
    # Filter entries
    filtered_sequences = [item for item in sequences if item.get('startTime', '') <= cutoff_iso]
    
    final_count = len(filtered_sequences)
    removed_count = initial_count - final_count
    
    if removed_count == 0:
        print("No entries newer than cutoff. No changes made.")
    else:
        print(f"Removed {removed_count} entries.")
        print(f"Remaining entries: {final_count}")
        
        # Backup
        backup_path = file_path + ".bak"
        print(f"Creating backup at {backup_path}...")
        shutil.copy2(file_path, backup_path)
        
        # Update sequences in the loaded object
        if is_dict_format:
            # Sort and re-ID to maintain consistency with update_db.py
            filtered_sequences.sort(key=lambda s: s['startTime'], reverse=True)
            for i, s in enumerate(filtered_sequences, 1):
                s['id'] = i
            db['sequences'] = filtered_sequences
            final_obj = db
        else:
            final_obj = filtered_sequences

        # Write back
        print(f"Writing filtered data back to {file_path}...")
        with open(file_path, 'w', encoding='utf-8') as f:
            # Use indent=1 to match update_db.py's format
            json.dump(final_obj, f, ensure_ascii=False, indent=1)
        
        # Sync to public
        if public_path:
            print(f"Syncing to {public_path}...")
            shutil.copy2(file_path, public_path)
            print("Sync complete.")
    
    print("Cleanup operation complete.")

if __name__ == "__main__":
    DATA_FILE = "data.json"
    PUBLIC_FILE = "frontend/public/data.json"
    CUTOFF = "2026-03-21T12:32:00"
    
    if os.path.exists(DATA_FILE):
        cleanup_data(DATA_FILE, CUTOFF, PUBLIC_FILE)
    else:
        print(f"Error: {DATA_FILE} not found.")
