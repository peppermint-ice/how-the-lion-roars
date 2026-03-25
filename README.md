# How The Lion Roars 🦁

Have been waking up at night and wondering if you have to to the shelter or not? **How The Lion Roars** is an open-source data analysis platform that will help you answer this horrifying question. Here, we study if the early warnings are any good, understand how the alerts behave based on spatial analysis, and just make your lives better.

Also, this is a convenient tool for those who want to investigate the history of missile attacks or see the current statistics.

The project is published: [How The Lion Roars](https://howthelionroars.info/)

## Features

*   **City Analysis**: Personalized probability analysis for future alerts based on historical correlations between cities.
*   **Statistics Dashboard**:
    *   **Top Attacked Cities**: Ranking by frequency of alerts.
    *   **Top Early-Warned Cities**: Cities that receive the most advance early warnings.
    *   **Early Warning Efficiency**: Measures how often an early warning (Cat 14) is followed by a confirmed alert (Cat 1/2).
    *   **Time Spent in Shelter**: Cumulative duration calculations for time spent in protected spaces.
*   **Interactive Spatial Data**: Heat maps and regional visualizations for all parameters.
*   **Automated Data Pipeline**: Daily updates at 11:00 PM Israel Time ensuring the latest historical data is always available.

## Tech Stack

   100% vibecoded. Don't worry, I did test the reliability.

## Data Sources

We rely on two primary sources for our data:
1.  [Tzeva Adom API](https://api.tzevaadom.co.il/): Used for fetching all data: early warnings, end of events, alerts themselves.
2.  [Yuval Harpaz's Alarms Project](https://github.com/yuvalharpaz/alarms):  Used for alert origin identification. Thanks, Yuval!


### Data Update
In the website, the data updates daily, catching up to Yuval Harpaz's verified strike origins.
To manually refresh the local database:
```bash
python automate_db_update.py
```

## Disclaimer
I need to say it. **This project is for fun only.** Also, you might use it for research if you trust me enough.
For real-time, life-saving information, **always** refer to the official [Pikud HaOref (Home Front Command)](https://www.oref.org.il/) app.

## 📬 Contact
Alpha version - suggestions and bug reports are welcome: [howthelionroars@protonmail.com](mailto:howthelionroars@protonmail.com)
