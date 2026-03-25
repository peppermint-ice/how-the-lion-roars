# How The Lion Roars 🦁

Have been waking up at night and wondering if you have to to the shelter or not? **How The Lion Roars** is an open-source data analysis platform that will help you answer this horrifying question. Here, we study if the early warnings are any good, understand how the alerts behave based on spatial analysis, and just make your lives better.

Also, this is a convenient tool for those who want to investigate the history of missile attacks or see the current statistics.

The project is published: [How The Lion Roars](https://howthelionroars.info/)

## Features

*   **City Analysis**: Personalized probability analysis for future alerts based on historical correlations between cities.
*   **Statistics Dashboard**: Better than other statistical dashboards. 
*   **Updates**: Daily updates at 11:00 PM Israel Time catching up to Yuval Harpaz's dataset.

## Tech Stack

100% pure vibecode. Don't worry, I did test the reliability.

## Data Sources

I rely on two primary sources for our data:
1.  [Tzeva Adom API](https://api.tzevaadom.co.il/): Used for fetching all data: early warnings, end of events, alerts themselves.
2.  [Yuval Harpaz's Alarms Project](https://github.com/yuvalharpaz/alarms):  Used for alert origin identification. Thanks, Yuval!


### Data Update
To manually refresh the local database:
```bash
python automate_db_update.py
```
Keep an eye on the process. Tzeva Adom can ban you if you misbehave.

## Disclaimer
I need to say it. **This project is for fun only.** Also, you might use it for research if you trust me enough.
For real-time, life-saving information, **always** refer to the official [Pikud HaOref (Home Front Command)](https://www.oref.org.il/) app.

## 📬 Contact
Suggestions and bug reports are welcome: [howthelionroars@protonmail.com](mailto:howthelionroars@protonmail.com)
