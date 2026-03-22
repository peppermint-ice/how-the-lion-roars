import pandas as pd

def analyze_cities():
    df = pd.read_csv('alarms_full.csv')
    unique_cities = df['cities'].dropna().unique()
    
    keywords = ['מרכז', 'דן', 'שרון', 'שפלה', 'יהודה', 'שומרון', 'גליל', 'גולן', 'עמקים', 'מנשה', 'התרעה']
    
    found = []
    for city in unique_cities:
        if any(kw in city for kw in keywords):
            found.append(city)
            
    print(f"Total Unique Cities: {len(unique_cities)}")
    print(f"Keyword Matches: {len(found)}")
    print("Sample Keyword Matches:")
    for c in sorted(found):
        print(c)

    # Also check rows with exceptionally many cities for the same ID
    counts = df.groupby('id')['cities'].count()
    large_alarms = counts[counts > 50].index
    print("\nLarge Alarms (potential broad area candidates):")
    for alarm_id in large_alarms[:5]:
        sample = df[df['id'] == alarm_id]['cities'].unique()
        print(f"ID {alarm_id}: {len(sample)} cities, e.g., {sample[:5]}")

if __name__ == "__main__":
    analyze_cities()
