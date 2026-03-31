import React, { useState, useMemo } from 'react';
import { Plane, Rocket } from 'lucide-react';
import { MapContainer, TileLayer, Polygon, Popup } from 'react-leaflet';
import { formatDurationStats, heatColor, effColor } from './utils.js';

// ── Distribution / Histogram chart ───────────────────────────────────────────
function DistributionChart({ buckets, getLabel, getColor, maxCount }) {
  const localMax = Math.max(...buckets, 1);
  return (
    <div className="eff-chart">
      {buckets.map((cnt, i) => (
        <div key={i} className="eff-bar-row">
          <span className="eff-label">{getLabel(i)}</span>
          <div className="eff-track">
            <div className="eff-fill"
              style={{ width: `${cnt / localMax * 100}%`,
                       background: getColor(i) }} />
          </div>
          <span className="eff-count">{cnt}</span>
        </div>
      ))}
    </div>
  );
}

// ── View Toggle ───────────────────────────────────────────────────────────────
function ViewToggle({ view, onChange }) {
  return (
    <div className="mode-toggle-btns" style={{ width: 'auto', marginLeft: 'auto' }}>
      <button className={`mode-btn ${view === 'list' ? 'active' : ''}`}
        onClick={() => onChange('list')}>List</button>
      <button className={`mode-btn ${view === 'chart' ? 'active' : ''}`}
        onClick={() => onChange('chart')}>Chart</button>
    </div>
  );
}

// ── Mini map ──────────────────────────────────────────────────────────────────
function StatsMap({ items, keyProp, getColor, getLabel, listReference, polygons }) {
  // If listReference is provided, we can look up the percentileT from it for each item
  const itemLookup = useMemo(() => {
    const m = {};
    if (listReference) {
      listReference.forEach(c => { if (c.id) m[c.id] = c; });
    }
    return m;
  }, [listReference]);

  return (
    <MapContainer center={[31.5, 34.9]} zoom={7}
      style={{ height: '100%', width: '100%', position: 'absolute', inset: 0 }}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="" />
      {items.map((c, i) => {
        const poly = polygons && polygons[String(c.id)];
        if (!poly) return null;
        const col = getColor(c);
        return (
          <Polygon
            key={`${keyProp}-${c.id ?? i}`}
            positions={poly}
            pathOptions={{ color: col, fillColor: col, fillOpacity: 0.6, weight: 1 }}
          >
            <Popup>
              <strong>{c.en || c.ru || c.he}</strong>
              {c.he && <><br /><span style={{ color: '#888' }}>{c.he}</span></>}
              <br />{getLabel(c)}
            </Popup>
          </Polygon>
        );
      })}
    </MapContainer>
  );
}

// ── Rank list ─────────────────────────────────────────────────────────────────
function RankList({ items, getValue, getLabel, maxVal }) {
  return (
    <div className="rank-list">
      {items.map((c, i) => {
        const val = getValue(c);
        return (
          <div key={c.id ?? i} className="rank-row">
            <span className="rank-num">{i + 1}</span>
            <span className="rank-name">{c.en || c.ru || c.he}</span>
            <span className="rank-bar-wrap">
              <span className="rank-bar"
                style={{ width: `${val / maxVal * 100}%`, background: heatColor(val, maxVal, c.percentileT) }} />
            </span>
            <span className="rank-count">{getLabel ? getLabel(c) : val}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function StatsView({ sequences, cities, polygons }) {
  const [topFilter, setTopFilter] = useState('iran');
  const [topView, setTopView]     = useState('list');
  const [showMissiles, setShowMissiles] = useState(true);
  const [showDrones, setShowDrones]     = useState(true);
  const [warnView, setWarnView]   = useState('list');
  const [effView, setEffView]     = useState('chart');
  const [shelterView, setShelterView] = useState('list');
  
  const [showAllTop, setShowAllTop]   = useState(false);
  const [showAllWarn, setShowAllWarn] = useState(false);
  const [showAllEff, setShowAllEff]   = useState(false);
  const [showAllShelter, setShowAllShelter] = useState(false);

  const preSeqs   = useMemo(() => sequences.filter(s => s.type === 'PREEMPTIVE_SEQUENCE'), [sequences]);
  const standSeqs = useMemo(() => sequences.filter(s => s.type === 'STANDALONE_ALARM'),    [sequences]);

  // Iran real-alarm counts
  const iranMap = useMemo(() => {
    const m = {};
    preSeqs.forEach(seq => {
      const attacks = seq.attacks || [];
      attacks.forEach(a => {
        const cat = Number(a.category);
        if (cat === 1 && !showMissiles) return;
        if (cat === 2 && !showDrones) return;
        a.city_ids.forEach(id => {
          const sid = String(id);
          if (!m[sid] && cities[sid]) m[sid] = { ...cities[sid], count: 0 };
          if (m[sid]) m[sid].count++;
        });
      });
    });
    return m;
  }, [preSeqs, cities, showMissiles, showDrones]);

  // Lebanon / standalone real-alarm counts
  const lebaMap = useMemo(() => {
    const m = {};
    standSeqs.forEach(seq => {
      const attacks = seq.attacks || [];
      attacks.forEach(a => {
        const cat = Number(a.category);
        if (cat === 1 && !showMissiles) return;
        if (cat === 2 && !showDrones) return;
        a.city_ids.forEach(id => {
          const sid = String(id);
          if (!m[sid] && cities[sid]) m[sid] = { ...cities[sid], count: 0 };
          if (m[sid]) m[sid].count++;
        });
      });
    });
    return m;
  }, [standSeqs, cities, showMissiles, showDrones]);

  // All combined
  const allMap = useMemo(() => {
    const m = {};
    [...preSeqs, ...standSeqs].forEach(seq => {
      const attacks = seq.attacks || [];
      attacks.forEach(a => {
        const cat = Number(a.category);
        if (cat === 1 && !showMissiles) return;
        if (cat === 2 && !showDrones) return;
        a.city_ids.forEach(id => {
          const sid = String(id);
          if (!m[sid] && cities[sid]) m[sid] = { ...cities[sid], count: 0 };
          if (m[sid]) m[sid].count++;
        });
      });
    });
    return m;
  }, [preSeqs, standSeqs, cities, showMissiles, showDrones]);

  // Early warnings (Iran only)
  const warningMap = useMemo(() => {
    const m = {};
    preSeqs.forEach(seq => {
      const hitIds = new Set(seq.realAlarmCities);
      seq.preAlarmCities.forEach(id => {
        const sid = String(id);
        if (!m[sid] && cities[sid]) m[sid] = { ...cities[sid], warnCount: 0, hitCount: 0, totalHitCount: 0 };
        if (m[sid]) {
          m[sid].warnCount++;
          if (hitIds.has(sid)) m[sid].hitCount++;
          const waveCount = seq.attacks ? seq.attacks.filter(a => new Set(a.city_ids.map(String)).has(sid)).length : (hitIds.has(sid) ? 1 : 0);
          m[sid].totalHitCount += waveCount;
        }
      });
    });
    return m;
  }, [preSeqs, cities]);

  // Efficiency: all cities with warnings
  const effData = useMemo(() =>
    Object.values(warningMap)
      .filter(c => c.warnCount > 0)
      .map(c => ({ ...c, rate: c.hitCount / c.warnCount }))
      .sort((a, b) => b.rate - a.rate),
    [warningMap]
  );

  const effBuckets = useMemo(() => {
    const b = Array(10).fill(0);
    effData.forEach(c => { b[Math.min(9, Math.floor(c.rate * 10))]++; });
    return b;
  }, [effData]);
  const effBucketMax = Math.max(...effBuckets, 1);

  // Sorted arrays with percentile pre-computation
  const iranRanked    = useMemo(() => {
    const list = Object.values(iranMap).sort((a,b) => b.count - a.count);
    list.forEach((c, i) => { c.percentileT = list.length > 1 ? 1 - (i / (list.length - 1)) : 1; });
    return list;
  }, [iranMap]);

  const lebaRanked    = useMemo(() => {
    const list = Object.values(lebaMap).sort((a,b) => b.count - a.count);
    list.forEach((c, i) => { c.percentileT = list.length > 1 ? 1 - (i / (list.length - 1)) : 1; });
    return list;
  }, [lebaMap]);

  const allRanked     = useMemo(() => {
    const list = Object.values(allMap).sort((a,b) => b.count - a.count);
    list.forEach((c, i) => { c.percentileT = list.length > 1 ? 1 - (i / (list.length - 1)) : 1; });
    return list;
  }, [allMap]);

  const warningRanked = useMemo(() => {
    const list = Object.values(warningMap).sort((a,b) => (b.warnCount - a.warnCount) || (b.totalHitCount - a.totalHitCount));
    list.forEach((c, i) => { c.percentileT = list.length > 1 ? 1 - (i / (list.length - 1)) : 1; });
    return list;
  }, [warningMap]);

  const activeTopMap  = topFilter === 'iran' ? iranMap   : topFilter === 'lebanon' ? lebaMap    : allMap;
  const activeTopList = topFilter === 'iran' ? iranRanked : topFilter === 'lebanon' ? lebaRanked : allRanked;
  const topMax     = activeTopList.length ? activeTopList[0].count : 1;
  const warnMax    = warningRanked.length ? warningRanked[0].warnCount : 1;

  // New bucket calculations for Top Attacked and Top Warned
  const topBuckets = useMemo(() => {
    const list = activeTopList;
    if (!list.length) return Array(10).fill(0);
    const maxVal = topMax;
    const b = Array(10).fill(0);
    list.forEach(c => {
      const idx = Math.min(9, Math.floor(((c.count-1) / maxVal) * 10));
      b[idx]++;
    });
    return b;
  }, [activeTopList, topMax]);

  const warnBuckets = useMemo(() => {
    const list = warningRanked;
    if (!list.length) return Array(10).fill(0);
    const maxVal = warnMax;
    const b = Array(10).fill(0);
    list.forEach(c => {
      const idx = Math.min(9, Math.floor(((c.warnCount-1) / maxVal) * 10));
      b[idx]++;
    });
    return b;
  }, [warningRanked, warnMax]);

  // Total shelter time aggregation
  const shelterMap = useMemo(() => {
    const m = {};
    sequences.forEach(seq => {
      const duration = seq.duration_sec || 0;
      if (duration <= 0) return;
      (seq.allAffectedCities || []).forEach(id => {
        const sid = String(id);
        if (!m[sid] && cities[sid]) m[sid] = { ...cities[sid], totalDuration: 0 };
        if (m[sid]) m[sid].totalDuration += duration;
      });
    });
    return m;
  }, [sequences, cities]);

  const shelterRanked = useMemo(() => {
    const list = Object.values(shelterMap).sort((a,b) => b.totalDuration - a.totalDuration);
    list.forEach((c, i) => { c.percentileT = list.length > 1 ? 1 - (i / (list.length - 1)) : 1; });
    return list;
  }, [shelterMap]);

  const shelterMax = shelterRanked.length ? shelterRanked[0].totalDuration : 1;

  const shelterBuckets = useMemo(() => {
    if (!shelterRanked.length) return Array(10).fill(0);
    const b = Array(10).fill(0);
    shelterRanked.forEach(c => {
      const idx = Math.min(9, Math.floor(((c.totalDuration - 1) / shelterMax) * 10));
      b[idx]++;
    });
    return b;
  }, [shelterRanked, shelterMax]);

  return (
    <div className="stats-container">

      {/* ── Column 1: Top Attacked Cities ───────────────────────────────── */}
      <div className="stats-section">
        <div className="stats-section-header">
          <h2 className="stats-title">Top Attacked Cities</h2>
          <div className="stats-filters-row">
            <div className="mode-toggle-btns" style={{ width: 'auto' }}>
              {[['iran','Iran'],['lebanon','Lebanon'],['all','All']].map(([k,lbl]) => (
                <button key={k} className={`mode-btn ${topFilter===k?'active':''}`}
                  onClick={() => setTopFilter(k)}>{lbl}</button>
              ))}
            </div>
            <div className="category-toggles">
              <button 
                className={`category-btn ${showMissiles ? 'active' : ''}`}
                onClick={() => setShowMissiles(!showMissiles)}
                title="Missiles"
              >
                <Rocket size={16} />
              </button>
              <button 
                className={`category-btn ${showDrones ? 'active' : ''}`}
                onClick={() => setShowDrones(!showDrones)}
                title="Drones"
              >
                <Plane size={16} />
              </button>
            </div>
          </div>
          <ViewToggle view={topView} onChange={setTopView} />
        </div>
        <div className="stats-body">
          <div className={`stats-list-panel ${showAllTop ? 'expanded' : ''}`}>
            {topView === 'list' ? (
              <>
                <RankList
                  items={showAllTop ? activeTopList : activeTopList.slice(0, 20)}
                  getValue={c => c.count}
                  getLabel={c => `${c.count}×`}
                  maxVal={topMax}
                />
                {!showAllTop && activeTopList.length > 20 && (
                  <button className="show-more-btn" onClick={() => setShowAllTop(true)}>
                    Show all {activeTopList.length} cities
                  </button>
                )}
              </>
            ) : (
              <DistributionChart
                buckets={topBuckets}
                getLabel={i => {
                  const step = Math.ceil(topMax / 10);
                  const start = i * step + 1;
                  const end = Math.min((i + 1) * step, topMax);
                  return start === end ? `${start}` : `${start}–${end}`;
                }}
                getColor={i => heatColor((i/9) * topMax, topMax, i/9)}
                maxCount={Math.max(...topBuckets)}
              />
            )}
          </div>
          <div className="stats-map-panel">
            <StatsMap
              items={Object.values(activeTopMap).filter(c => c.count >= 1)}
              keyProp="top"
              listReference={activeTopList}
              getColor={c => heatColor(c.count, topMax, c.percentileT)}
              getLabel={c => `${c.count} attacks`}
              polygons={polygons}
            />
          </div>
        </div>
      </div>

      {/* ── Column 2: Top Early-Warned Cities ───────────────────────────── */}
      <div className="stats-section">
        <div className="stats-section-header">
          <h2 className="stats-title">Top Early-Warned Cities</h2>
          <span className="stats-subtitle">Iran attacks only</span>
          <ViewToggle view={warnView} onChange={setWarnView} />
        </div>
        <div className="stats-body">
          <div className={`stats-list-panel ${showAllWarn ? 'expanded' : ''}`}>
            {warnView === 'list' ? (
              <>
                <RankList
                  items={showAllWarn ? warningRanked : warningRanked.slice(0, 20)}
                  getValue={c => c.warnCount}
                  getLabel={c => `${c.warnCount} warned · ${c.hitCount} hit`}
                  maxVal={warnMax}
                />
                {!showAllWarn && warningRanked.length > 20 && (
                  <button className="show-more-btn" onClick={() => setShowAllWarn(true)}>
                    Show all {warningRanked.length} cities
                  </button>
                )}
              </>
            ) : (
              <DistributionChart
                buckets={warnBuckets}
                getLabel={i => {
                  const step = Math.ceil(warnMax / 10);
                  const start = i * step + 1;
                  const end = Math.min((i + 1) * step, warnMax);
                  return start === end ? `${start}` : `${start}–${end}`;
                }}
                getColor={i => heatColor((i/9) * warnMax, warnMax, i/9)}
                maxCount={Math.max(...warnBuckets)}
              />
            )}
          </div>
          <div className="stats-map-panel">
            <StatsMap
              items={warningRanked.filter(c => c.warnCount >= 1)}
              keyProp="warn"
              listReference={warningRanked}
              getColor={c => heatColor(c.warnCount, warnMax, c.percentileT)}
              getLabel={c => `${c.warnCount} warnings, ${c.hitCount} hits`}
              polygons={polygons}
            />
          </div>
        </div>
      </div>

      {/* ── Column 3: Warning Efficiency ────────────────────────────────── */}
      <div className="stats-section">
        <div className="stats-section-header">
          <h2 className="stats-title">Early Warning Efficiency</h2>
          <span className="stats-subtitle">Share of early warnings that lead to alerts</span>
          <ViewToggle view={effView} onChange={setEffView} />
        </div>
        <div className="stats-body">
          <div className={`stats-list-panel ${showAllEff ? 'expanded' : ''}`}>
            {effView === 'chart' ? (
              <DistributionChart
                buckets={effBuckets}
                getLabel={i => `${i * 10}–${i * 10 + 9}%`}
                getColor={i => effColor(i / 9)}
                maxCount={effBucketMax}
              />
            ) : (
              <>
                <RankList
                  items={showAllEff ? effData : effData.slice(0, 20)}
                  getValue={c => c.rate * 100}
                  getLabel={c => `${Math.round(c.rate * 100)}%`}
                  maxVal={100}
                />
                {!showAllEff && effData.length > 20 && (
                  <button className="show-more-btn" onClick={() => setShowAllEff(true)}>
                    Show all {effData.length} cities
                  </button>
                )}
              </>
            )}
          </div>
          <div className="stats-map-panel">
            <StatsMap
              items={effData}
              keyProp="eff"
              getColor={c => effColor(c.rate)}
              getLabel={c => `${Math.round(c.rate * 100)}% efficiency (${c.hitCount}/${c.warnCount})`}
              polygons={polygons}
            />
          </div>
        </div>
      </div>
      
      {/* ── Column 4: Time Spent in Shelter ───────────────────────────── */}
      <div className="stats-section">
        <div className="stats-section-header">
          <h2 className="stats-title">Time Spent in Shelter</h2>
          <span className="stats-subtitle">Cumulative across all sessions</span>
          <ViewToggle view={shelterView} onChange={setShelterView} />
        </div>
        <div className="stats-body">
          <div className={`stats-list-panel ${showAllShelter ? 'expanded' : ''}`}>
            {shelterView === 'list' ? (
              <>
                <RankList
                  items={showAllShelter ? shelterRanked : shelterRanked.slice(0, 20)}
                  getValue={c => c.totalDuration}
                  getLabel={c => formatDurationStats(c.totalDuration)}
                  maxVal={shelterMax}
                />
                {!showAllShelter && shelterRanked.length > 20 && (
                  <button className="show-more-btn" onClick={() => setShowAllShelter(true)}>
                    Show all {shelterRanked.length} cities
                  </button>
                )}
              </>
            ) : (
              <DistributionChart
                buckets={shelterBuckets}
                getLabel={i => {
                  const step = shelterMax / 10;
                  return `${formatDurationStats(i * step + 1)}–${formatDurationStats((i + 1) * step)}`;
                }}
                getColor={i => heatColor((i/9) * shelterMax, shelterMax, i/9)}
                maxCount={Math.max(...shelterBuckets)}
              />
            )}
          </div>
          <div className="stats-map-panel">
            <StatsMap
              items={shelterRanked}
              keyProp="shelter"
              listReference={shelterRanked}
              getColor={c => heatColor(c.totalDuration, shelterMax, c.percentileT)}
              getLabel={c => `Total time in shelter: ${formatDurationStats(c.totalDuration)}`}
              polygons={polygons}
            />
          </div>
        </div>
      </div>

    </div>
  );
}
