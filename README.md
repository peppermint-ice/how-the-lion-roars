# How The Lion Roars 🦁

**How The Lion Roars** is an open-source platform for analyzing and visualizing Red Alert (Tzeva Adom) events in Israel. It provides deep insights into early warning efficiency, attack patterns, and regional impact through interactive maps and detailed statistics.

[Live Demo on Vercel](https://azakot.vercel.app/)

## 🚀 Features

*   **City Analysis**: Personalized probability analysis for future alerts based on historical correlations between cities.
*   **Statistics Dashboard**:
    *   **Top Attacked Cities**: Ranking by frequency of alerts.
    *   **Top Early-Warned Cities**: Cities that receive the most advance early warnings.
    *   **Early Warning Efficiency**: Measures how often an early warning (Cat 14) is followed by a confirmed alert (Cat 1/2).
    *   **Time Spent in Shelter**: Cumulative duration calculations for time spent in protected spaces.
*   **Interactive Spatial Data**: Heat maps and regional visualizations for all parameters.
*   **Automated Data Pipeline**: Daily updates at 11:00 PM Israel Time ensuring the latest historical data is always available.

## 🛠 Tech Stack

*   **Frontend**: React (Vite), Lucide Icons, Simple Maps.
*   **Data Processing**: Python (Pandas), Session reconstruction logic.
*   **Automation**: GitHub Actions.
*   **Hosting**: Vercel.

## 📊 Data Sources

We rely on two primary sources for our data:
1.  [Tzeva Adom API](https://api.tzevaadom.co.il/): Used for fetching early warnings and system messages.
2.  [Yuval Harpaz's Alarms Project](https://github.com/yuvalharpaz/alarms): A brilliant community-maintained source used for alert origin identification.

## 🏗 Setup & Installation

### Prerequisites
*   Node.js (v18+)
*   Python (v3.10+)

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### Data Update (Manual)
To manually refresh the local database:
```bash
python automate_db_update.py
```

## ⚠️ Disclaimer
**This project is for educational and statistical analysis purposes only.**  
For real-time, life-saving information, **always** refer to the official [Pikud HaOref (Home Front Command)](https://www.oref.org.il/) app or website. This data can have delays and is not a substitute for official alert systems.

## 📬 Contact
Alpha version - suggestions and bug reports are welcome: [howthelionroars@protonmail.com](mailto:howthelionroars@protonmail.com)

---
*Created with ❤️ for the community.*
