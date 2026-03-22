import React, { useState, useMemo, useRef, useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Polygon, useMap } from 'react-leaflet';

// ── Constants ─────────────────────────────────────────────────────────────────
const DEFAULT_CUTOFF = 0.10;  // 10% default threshold

// ── Fit map to markers ────────────────────────────────────────────────────────
function MapFitter({ markers }) {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    if (markers && markers.length > 0) {
      const lats = markers.map(m => m.lat).filter(Boolean);
      const lngs = markers.map(m => m.lng).filter(Boolean);
      if (!lats.length) return;
      const pad = 0.4;
      map.fitBounds([
        [Math.min(...lats) - pad, Math.min(...lngs) - pad],
        [Math.max(...lats) + pad, Math.max(...lngs) + pad],
      ], { maxZoom: 11 });
    }
  }, [markers, map]);
  return null;
}

// scoreColor: normalises score to [threshold, 1.0] → green→yellow→orange→red
// Power-2 curve gives more colour diversity at the HIGH end.

// Normalises so threshold→green, 1.0→red.  Power-2 curve stretches the high end so
// cities with scores between 0.8–1.0 spread across a wide colour range.
function scoreColor(score, threshold) {
  const lo = threshold ?? 0.10;
  const n = Math.max(0, Math.min(1, (score - lo) / Math.max(0.001, 1 - lo)));
  const t = n * n;   // exponent 2: more colour diversity near 1.0
  // Green (hue 120) → Yellow (60) → Orange (30) → Red (0)
  const H = 120 * (1 - t);
  const S = 80 + t * 15;
  const L = 44 - t * 8;
  return `hsl(${H.toFixed(1)}, ${S.toFixed(0)}%, ${L.toFixed(0)}%)`;
}

// ── City index ────────────────────────────────────────────────────────────────
function buildCityIndex(sequences) {
  const m = {};
  sequences.filter(s => s.type === 'PREEMPTIVE_SEQUENCE').forEach(seq => {
    [...seq.preAlarmCities, ...seq.realAlarmCities].forEach(c => {
      if (c.id && !m[c.id]) m[c.id] = c;
    });
  });
  return Object.values(m).filter(c => c.lat && c.lng);
}

// ── Correlation computation ───────────────────────────────────────────────────
function computeCorrelations(targetId, sequences) {
  const pre = sequences.filter(s => s.type === 'PREEMPTIVE_SEQUENCE');
  const hits = pre.filter(s => s.realAlarmCities.some(c => c.id === targetId));
  if (!hits.length) return {};
  const counts = {};
  hits.forEach(seq => seq.preAlarmCities.forEach(c => {
    if (c.id !== targetId) counts[c.id] = (counts[c.id] || 0) + 1;
  }));
  const result = {};
  Object.entries(counts).forEach(([id, cnt]) => { result[id] = cnt / hits.length; });
  return result;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AnalysisView({ sequences, initialCity, onBack,
                                       polygonMode, setPolygonMode, polygons, polyLoading }) {
  const [query, setQuery]             = useState(initialCity ? (initialCity.en || initialCity.ru || initialCity.he) : '');
  const [targetCity, setTargetCity]   = useState(initialCity || null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [threshold, setThreshold]     = useState(DEFAULT_CUTOFF);
  const inputRef    = useRef(null);
  const dropdownRef = useRef(null);

  // All cities that appear in at least one actual alarm (to restrict search)
  const allCities = useMemo(() => buildCityIndex(sequences), [sequences]);
  const alertedIds = useMemo(() => {
    const s = new Set();
    sequences.filter(seq => seq.type === 'PREEMPTIVE_SEQUENCE')
             .forEach(seq => seq.realAlarmCities.forEach(c => s.add(c.id)));
    return s;
  }, [sequences]);
  const alertedCities = useMemo(() => allCities.filter(c => alertedIds.has(c.id)), [allCities, alertedIds]);

  // Autocomplete filter (EN › RU › HE)
  const filtered = useMemo(() => {
    if (!query.trim()) return alertedCities.slice(0, 60);
    const q = query.trim().toLowerCase();
    return alertedCities.filter(c =>
      (c.en && c.en.toLowerCase().includes(q)) ||
      (c.ru && c.ru.toLowerCase().includes(q)) ||
      (c.he && c.he.includes(query.trim()))
    ).slice(0, 60);
  }, [query, alertedCities]);

  const correlations = useMemo(
    () => targetCity ? computeCorrelations(targetCity.id, sequences) : {},
    [targetCity, sequences]
  );

  // Apply threshold filter
  const visible = useMemo(() => {
    const r = {};
    Object.entries(correlations).forEach(([id, s]) => { if (s >= threshold) r[id] = s; });
    return r;
  }, [correlations, threshold]);

  // Markers for point mode
  const markers = useMemo(() => {
    if (!targetCity) return [];
    const pts = [{ ...targetCity, kind: 'target', score: null }];
    Object.entries(visible).forEach(([id, score]) => {
      const city = allCities.find(c => String(c.id) === String(id));
      if (city?.lat && city?.lng) pts.push({ ...city, kind: 'corr', score });
    });
    return pts;
  }, [targetCity, visible, allCities]);

  const hitCount = useMemo(() => {
    if (!targetCity) return 0;
    return sequences.filter(
      s => s.type === 'PREEMPTIVE_SEQUENCE' && s.realAlarmCities.some(c => c.id === targetCity.id)
    ).length;
  }, [targetCity, sequences]);

  const earlyAlarmCount = useMemo(() => {
    if (!targetCity) return 0;
    return sequences.filter(
      s => s.type === 'PREEMPTIVE_SEQUENCE' && s.preAlarmCities.some(c => c.id === targetCity.id)
    ).length;
  }, [targetCity, sequences]);

  const pctHit = earlyAlarmCount > 0 ? Math.round(hitCount / earlyAlarmCount * 100) : 0;

  // Close dropdown on outside click
  useEffect(() => {
    const h = e => {
      if (!dropdownRef.current?.contains(e.target) && !inputRef.current?.contains(e.target))
        setShowDropdown(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const handleSelect = c => {
    setTargetCity(c);
    setQuery(c.en || c.ru || c.he);
    setShowDropdown(false);
  };

  // Polygon style helper
  const polyStyle = (id) => {
    const strId = String(id);
    if (targetCity && strId === String(targetCity.id)) {
      return { color: '#2563eb', fillColor: '#3b82f6', fillOpacity: 0.2, weight: 2.5 };
    }
    const score = visible[id];
    if (score === undefined) return null;  // don't render this polygon
    return { color: scoreColor(score), fillColor: scoreColor(score), fillOpacity: 0.3, weight: 1.5 };
  };

  return (
    <div className="analysis-container">
      {/* ── Left panel ── */}
      <div className="analysis-panel">
        <div className="analysis-panel-header">
          <h2 className="analysis-title">City Correlation</h2>
          {onBack && <button className="back-btn" onClick={onBack}>← History</button>}
        </div>
        <p className="analysis-desc">
          Select a city to see which early-warning cities correlate with its actual alerts.
          Only preemptive sequences counted.
        </p>

        {/* Search box */}
        <div className="search-wrap">
          <input
            ref={inputRef}
            className="city-input"
            placeholder="Type city (English / Russian / Hebrew)…"
            value={query}
            onChange={e => { setQuery(e.target.value); setShowDropdown(true); }}
            onFocus={() => setShowDropdown(true)}
          />
          {showDropdown && filtered.length > 0 && (
            <ul className="city-dropdown" ref={dropdownRef}>
              {filtered.map(c => (
                <li key={c.id} className="city-option" onMouseDown={() => handleSelect(c)}>
                  <span className="city-en">{c.en || c.ru}</span>
                  <span className="city-he">{c.he}</span>
                  {c.ru && c.en && <span className="city-ru">{c.ru}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Target info */}
        {targetCity && (
          <div className="target-info">
            <div className="target-name">
              <span className="blue-dot" />
              <span>{targetCity.en || targetCity.ru || targetCity.he}</span>
              <span className="city-he-small">{targetCity.he}</span>
            </div>
            {targetCity.ru && targetCity.en && <div className="target-ru">{targetCity.ru}</div>}
            <div className="target-stats">
              Mentioned in <strong>{hitCount}</strong> attacks from Iran ·{' '}
              <strong>{Object.keys(visible).length}</strong> cities shown at ≥{Math.round(threshold * 100)}%
            </div>
          </div>
        )}

        {/* City trivia */}
        {targetCity && (
          <div className="city-trivia">
            <div className="trivia-row">
              <span className="trivia-label">Alerted</span>
              <span className="trivia-value">{hitCount} times</span>
            </div>
            <div className="trivia-row">
              <span className="trivia-label">Early warnings</span>
              <span className="trivia-value">{earlyAlarmCount}</span>
            </div>
            <div className="trivia-row">
              <span className="trivia-label">Warnings → alarm</span>
              <span className="trivia-value trivia-pct" style={{ color: pctHit >= 50 ? '#f87171' : '#a3e635' }}>
                {pctHit}%
              </span>
            </div>
          </div>
        )}

        <div className="threshold-wrap">
          <div className="threshold-label">
            <span>Min correlation</span>
            <strong>{Math.round(threshold * 100)}%</strong>
          </div>
          <input
            type="range"
            className="threshold-slider"
            min="10" max="100" step="1"
            value={Math.round(threshold * 100)}
            onChange={e => setThreshold(parseInt(e.target.value) / 100)}
          />
          <div className="threshold-ticks"><span>10%</span><span>100%</span></div>
        </div>

        {/* Mode toggle */}
        <div className="mode-toggle-row">
          <span className="mode-label">Display mode</span>
          <div className="mode-toggle-btns">
            <button className={`mode-btn ${!polygonMode ? 'active' : ''}`} onClick={() => setPolygonMode(false)}>
              ● Points
            </button>
            <button className={`mode-btn ${polygonMode ? 'active' : ''}`} onClick={() => setPolygonMode(true)}>
              ▭ Polygons{polyLoading ? ' …' : ''}
            </button>
          </div>
        </div>
        {polygonMode && !polygons && !polyLoading && (
          <div className="zones-warning">
            ⚠ No polygon file. Run <code>python fetch_zones.py</code> first.
          </div>
        )}

        {/* Color scale */}
        {targetCity && (
          <div className="scale-legend">
            <span className="mode-label" style={{ marginBottom: '.15rem' }}>Correlation</span>
            <div className="scale-bar" />
            <div className="scale-labels">
              <span>{Math.round(threshold * 100)}% — low</span>
              <span>high — 100%</span>
            </div>
          </div>
        )}

        {!targetCity && <div className="analysis-placeholder">← Search for a city to begin</div>}
      </div>

      {/* ── Map ── */}
      <div className="analysis-map-wrap">
        <MapContainer
          center={[31.5, 34.9]}
          zoom={8}
          style={{ height: '100%', width: '100%', position: 'absolute', top: 0, left: 0 }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />

          {/* Polygon mode: target polygon + correlated polygons */}
          {polygonMode && polygons && targetCity && (() => {
            const targetKey = String(targetCity.id);
            return (
              <>
                {targetKey in polygons && (
                  <Polygon
                    key={`target-${targetKey}`}
                    positions={polygons[targetKey]}
                    pathOptions={{ color: '#2563eb', fillColor: '#3b82f6', fillOpacity: 0.2, weight: 2.5 }}
                  />
                )}
                {Object.entries(visible).map(([id, score]) => {
                  if (!(id in polygons)) return null;
                  const city = allCities.find(c => String(c.id) === id);
                  return (
                    <Polygon
                      key={`poly-${id}`}
                      positions={polygons[id]}
                      pathOptions={{ color: scoreColor(score, 0.10), fillColor: scoreColor(score, 0.10), fillOpacity: 0.3, weight: 1.5 }}
                    >
                      {city && (
                        <Popup>
                          <strong>{city.en || city.ru || city.he}</strong><br />
                          <span style={{ color: '#888' }}>{city.he}</span><br />
                          <em>{(score * 100).toFixed(0)}% co-warning</em>
                        </Popup>
                      )}
                    </Polygon>
                  );
                })}
              </>
            );
          })()}

          {/* Point mode */}
          {!polygonMode && markers.map((m, i) => (
            <CircleMarker
              key={`pt-${m.id}-${i}`}
              center={[m.lat, m.lng]}
              radius={m.kind === 'target' ? 10 : 6}
              pathOptions={
                m.kind === 'target'
                  ? { color: '#1d4ed8', fillColor: '#3b82f6', fillOpacity: 1, weight: 2.5 }
                  : { color: scoreColor(m.score, 0.10), fillColor: scoreColor(m.score, 0.10), fillOpacity: 0.85, weight: 1 }
              }
            >
              <Popup>
                <strong>{m.en || m.ru || m.he}</strong>
                {m.ru && <><br />{m.ru}</>}
                <br /><span style={{ color: '#888' }}>{m.he}</span>
                {m.kind === 'target'
                  ? <><br /><em>Selected city (hit {hitCount}×)</em></>
                  : <><br /><em>{(m.score * 100).toFixed(0)}% co-warning</em></>}
              </Popup>
            </CircleMarker>
          ))}

          <MapFitter markers={markers} />
        </MapContainer>

        {!targetCity && (
          <div className="map-placeholder-overlay">Select a city to begin</div>
        )}
      </div>
    </div>
  );
}
