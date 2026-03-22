import pandas as pd
import requests
import io

def fetch_data():
    urls = [
        "https://raw.githubusercontent.com/yuval-harpaz/alarms/main/data/alarms.csv",
        "https://raw.githubusercontent.com/yuval-harpaz/alarms/master/data/alarms.csv",
        "https://raw.githubusercontent.com/yuval-harpaz/alarms/main/alarms.csv",
        "https://raw.githubusercontent.com/yuval-harpaz/alarms/master/alarms.csv"
    ]
    
    for url in urls:
        print(f"Trying {url}...")
        try:
            res = requests.get(url, timeout=30)
            if res.status_code == 200:
                print("Successfully downloaded CSV from", url)
                df = pd.read_csv(io.StringIO(res.text))
                df.to_csv("alarms_full.csv", index=False)
                print("Columns:", df.columns)
                # Filter for something that looks like a preemptive alarm or broad area
                broad_areas = df[df['cities'].str.contains('מרחב', na=False)]['cities'].unique()
                print("Broad areas found:", broad_areas[:10])
                preemptive_hints = df[df['cities'].str.contains('התרעה|מוקדמת', na=False)]['cities'].unique()
                print("Preemptive-like strings:", preemptive_hints)
                return df
        except Exception as e:
            print(f"Error fetching {url}: {e}")
    
    print("Could not find the dataset at known URLs.")
    return None

if __name__ == "__main__":
    fetch_data()
