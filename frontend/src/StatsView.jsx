import React, { useState, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';

// ── Color helpers ─────────────────────────────────────────────────────────────
// Frequency heat: green (low) → red (high)
function heatColor(count, maxCount) {
  const t = maxCount > 0 ? Math.min(1, count / maxCount) : 0;
  const tt = t * t;
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
function StatsMap({ items, keyProp, getColor, getLabel }) {
  return (
    <MapContainer center={[31.5, 34.9]} zoom={7}
      style={{ height: '100%', width: '100%', position: 'absolute', inset: 0 }}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="" />
      {items.filter(c => c.lat && c.lng).map((c, i) => {
        const col = getColor(c);
        return (
          <CircleMarker key={`${keyProp}-${c.id ?? i}`} center={[c.lat, c.lng]} radius={4}
            pathOptions={{ color: col, fillColor: col, fillOpacity: 0.85, weight: 0.5 }}>
            <Popup>
              <strong>{c.en || c.ru || c.he}</strong>
              {c.he && <><br /><span style={{ color: '#888' }}>{c.he}</span></>}
              <br />{getLabel(c)}
            </Popup>
          </CircleMarker>
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
                style={{ width: `${val / maxVal * 100}%`, background: heatColor(val, maxVal) }} />
            </span>
            <span className="rank-count">{getLabel ? getLabel(c) : val}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function StatsView({ sequences }) {
  const [topFilter, setTopFilter] = useState('iran');

  const preSeqs   = useMemo(() => sequences.filter(s => s.type === 'PREEMPTIVE_SEQUENCE'), [sequences]);
  const standSeqs = useMemo(() => sequences.filter(s => s.type === 'STANDALONE_ALARM'),    [sequences]);

  // Iran real-alarm counts
  const iranMap = useMemo(() => {
    const m = {};
    preSeqs.forEach(seq => seq.realAlarmCities.forEach(c => {
      if (!c.id) return;
      if (!m[c.id]) m[c.id] = { ...c, count: 0 };
      m[c.id].count++;
    }));
    return m;
  }, [preSeqs]);

  // Lebanon / standalone real-alarm counts
  const lebaMap = useMemo(() => {
    const m = {};
    standSeqs.forEach(seq => seq.realAlarmCities.forEach(c => {
      if (!c.id) return;
      if (!m[c.id]) m[c.id] = { ...c, count: 0 };
      m[c.id].count++;
    }));
    return m;
  }, [standSeqs]);

  // All combined
  const allMap = useMemo(() => {
    const m = {};
    [...preSeqs, ...standSeqs].forEach(seq => seq.realAlarmCities.forEach(c => {
      if (!c.id) return;
      if (!m[c.id]) m[c.id] = { ...c, count: 0 };
      m[c.id].count++;
    }));
    return m;
  }, [preSeqs, standSeqs]);

  // Early warnings (Iran only)
  const warningMap = useMemo(() => {
    const m = {};
    preSeqs.forEach(seq => {
      const hitIds = new Set(seq.realAlarmCities.map(c => c.id));
      seq.preAlarmCities.forEach(c => {
        if (!c.id) return;
        if (!m[c.id]) m[c.id] = { ...c, warnCount: 0, hitCount: 0 };
        m[c.id].warnCount++;
        if (hitIds.has(c.id)) m[c.id].hitCount++;
      });
    });
    return m;
  }, [preSeqs]);

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

  // Sorted arrays
  const iranRanked    = useMemo(() => Object.values(iranMap).sort((a,b) => b.count - a.count),     [iranMap]);
  const lebaRanked    = useMemo(() => Object.values(lebaMap).sort((a,b) => b.count - a.count),     [lebaMap]);
  const allRanked     = useMemo(() => Object.values(allMap).sort((a,b) => b.count - a.count),      [allMap]);
  const warningRanked = useMemo(() => Object.values(warningMap).sort((a,b) => b.warnCount - a.warnCount), [warningMap]);

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
            <RankList items={activeTopList} getValue={c => c.count}
              getLabel={c => `${c.count}×`} maxVal={topMax} />
          </div>
          <div className="stats-map-panel">
            <StatsMap
              items={Object.values(activeTopMap).filter(c => c.count >= 1)}
              keyProp="top"
              getColor={c => heatColor(c.count, topMax)}
              getLabel={c => `${c.count} attacks`}
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
            <RankList items={warningRanked} getValue={c => c.warnCount}
              getLabel={c => `${c.warnCount} warned · ${c.hitCount} hit`} maxVal={warnMax} />
          </div>
          <div className="stats-map-panel">
            <StatsMap
              items={warningRanked.filter(c => c.warnCount >= 1)}
              keyProp="warn"
              getColor={c => heatColor(c.warnCount, warnMax)}
              getLabel={c => `${c.warnCount} warnings, ${c.hitCount} hits`}
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
              {effBuckets.map((cnt, i) => (
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
          </div>
          <div className="stats-map-panel">
            <StatsMap
              items={effData}
              keyProp="eff"
              getColor={c => effColor(c.rate)}
              getLabel={c => `${Math.round(c.rate * 100)}% efficiency (${c.hitCount}/${c.warnCount})`}
            />
          </div>
        </div>
      </div>

    </div>
  );
}
