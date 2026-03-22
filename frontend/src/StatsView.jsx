import React, { useState, useMemo } from 'react';
import { MapContainer, TileLayer, Polygon, Popup } from 'react-leaflet';

// ── Color helpers ─────────────────────────────────────────────────────────────
// Frequency heat: green (low) → red (high)
// Modified to use a percentile-based approach if rank-based 't' is provided.
function heatColor(count, maxCount, tOverride) {
  const t = (tOverride !== undefined) ? tOverride : (maxCount > 0 ? Math.min(1, count / maxCount) : 0);
  // Quadratic curve (t*t) makes it stay green longer for linear counts,
  // but for percentiles we want it more balanced.
  // Actually, we'll keep the tt logic but the input 't' will be percentile-based.
  const tt = t; // Use linear for percentile to satisfy "median = yellow" (t=0.5)
  return `hsl(${(120 * (1 - tt)).toFixed(0)}, ${(80 + tt * 15).toFixed(0)}%, ${(44 - tt * 8).toFixed(0)}%)`;
}

// Efficiency: rate=0 (all false positives) → red, rate=1 (perfect) → green
// sqrt curve makes it turn green only at HIGH efficiency (red earlier)
function effColor(rate) {
  const t = Math.sqrt(Math.max(0, Math.min(1, rate)));   // sqrt: 0.25→0.5, 0.5→0.71
  const H = 120 * t;                                       // 0=red, 120=green
  const S = 88 - t * 10;
  const L = 40 + t * 6;
  return `hsl(${H.toFixed(0)}, ${S.toFixed(0)}%, ${L.toFixed(0)}%)`;
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
  const [showAllTop, setShowAllTop]   = useState(false);
  const [showAllWarn, setShowAllWarn] = useState(false);
  const [showAllEff, setShowAllEff]   = useState(false);

  const preSeqs   = useMemo(() => sequences.filter(s => s.type === 'PREEMPTIVE_SEQUENCE'), [sequences]);
  const standSeqs = useMemo(() => sequences.filter(s => s.type === 'STANDALONE_ALARM'),    [sequences]);

  // Iran real-alarm counts
  const iranMap = useMemo(() => {
    const m = {};
    preSeqs.forEach(seq => seq.realAlarmCities.forEach(id => {
      if (!m[id] && cities[id]) m[id] = { ...cities[id], count: 0 };
      if (m[id]) m[id].count++;
    }));
    return m;
  }, [preSeqs, cities]);

  // Lebanon / standalone real-alarm counts
  const lebaMap = useMemo(() => {
    const m = {};
    standSeqs.forEach(seq => seq.realAlarmCities.forEach(id => {
      if (!m[id] && cities[id]) m[id] = { ...cities[id], count: 0 };
      if (m[id]) m[id].count++;
    }));
    return m;
  }, [standSeqs, cities]);

  // All combined
  const allMap = useMemo(() => {
    const m = {};
    [...preSeqs, ...standSeqs].forEach(seq => seq.realAlarmCities.forEach(id => {
      if (!m[id] && cities[id]) m[id] = { ...cities[id], count: 0 };
      if (m[id]) m[id].count++;
    }));
    return m;
  }, [preSeqs, standSeqs, cities]);

  // Early warnings (Iran only)
  const warningMap = useMemo(() => {
    const m = {};
    preSeqs.forEach(seq => {
      const hitIds = new Set(seq.realAlarmCities);
      seq.preAlarmCities.forEach(id => {
        if (!m[id] && cities[id]) m[id] = { ...cities[id], warnCount: 0, hitCount: 0 };
        if (m[id]) {
          m[id].warnCount++;
          if (hitIds.has(id)) m[id].hitCount++;
        }
      });
    });
    return m;
  }, [preSeqs, cities]);

  // Efficiency: cities with ≥1 false positive
  const effData = useMemo(() =>
    Object.values(warningMap)
      .filter(c => c.warnCount > c.hitCount)
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
    const list = Object.values(warningMap).sort((a,b) => b.warnCount - a.warnCount);
    list.forEach((c, i) => { c.percentileT = list.length > 1 ? 1 - (i / (list.length - 1)) : 1; });
    return list;
  }, [warningMap]);

  const activeTopMap  = topFilter === 'iran' ? iranMap   : topFilter === 'lebanon' ? lebaMap    : allMap;
  const activeTopList = topFilter === 'iran' ? iranRanked : topFilter === 'lebanon' ? lebaRanked : allRanked;
  const topMax     = activeTopList.length ? activeTopList[0].count : 1;
  const warnMax    = warningRanked.length ? warningRanked[0].warnCount : 1;

  return (
    <div className="stats-container">

      {/* ── Column 1: Top Attacked Cities ───────────────────────────────── */}
      <div className="stats-section">
        <div className="stats-section-header">
          <h2 className="stats-title">Top Attacked Cities</h2>
          <div className="mode-toggle-btns" style={{ width: 'auto' }}>
            {[['iran','Iran'],['lebanon','Lebanon'],['all','All']].map(([k,lbl]) => (
              <button key={k} className={`mode-btn ${topFilter===k?'active':''}`}
                onClick={() => setTopFilter(k)}>{lbl}</button>
            ))}
          </div>
        </div>
        <div className="stats-body">
          <div className="stats-list-panel">
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
        </div>
        <div className="stats-body">
          <div className="stats-list-panel">
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
          <span className="stats-subtitle">Cities with at least 1 false positive</span>
        </div>
        <div className="stats-body">
          <div className="stats-list-panel">
            <div className="eff-chart">
              {(showAllEff ? effBuckets : effBuckets.slice(0, 20)).map((cnt, i) => (
                <div key={i} className="eff-bar-row">
                  <span className="eff-label">{i * 10}–{i*10+9}%</span>
                  <div className="eff-track">
                    <div className="eff-fill"
                      style={{ width: `${cnt / effBucketMax * 100}%`,
                               background: effColor(i / 9) }} />
                  </div>
                  <span className="eff-count">{cnt}</span>
                </div>
              ))}
            </div>
            {/* Efficiency is a fixed bucket list of 10, so no show-all needed here normally,
                but I'll keep the logic consistent if it was a city list.
                Actually effData is the city list below. Wait.
                The eff-chart is buckets (10 rows). The user mentioned "Top Cities panes".
                Top Cities panes refer to Column 1 and 2.
                I'll leave Column 3 as is since it's only 10 rows. */}
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

    </div>
  );
}
