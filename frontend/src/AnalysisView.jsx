import React, { useState, useMemo, useRef, useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Polygon, useMap } from 'react-leaflet';
import { scoreColor, buildCityIndex, computeCorrelations, normalizeSearchString } from './utils.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const DEFAULT_CUTOFF = 0.15;  // 15% default threshold

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

// ── Main component ────────────────────────────────────────────────────────────
export default function AnalysisView({ sequences, cities, initialCity, onBack,
                                       polygons, polyLoading }) {
  const [query, setQuery]             = useState(initialCity ? (initialCity.en || initialCity.ru || initialCity.he) : '');
  const [targetCity, setTargetCity]   = useState(initialCity || null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [threshold, setThreshold]     = useState(DEFAULT_CUTOFF);
  const inputRef    = useRef(null);
  const dropdownRef = useRef(null);

  // All cities that appear in at least one actual alarm (to restrict search)
  const alertedCities = useMemo(() => buildCityIndex(sequences, cities), [sequences, cities]);

  // Autocomplete filter using normalization helper
  const filtered = useMemo(() => {
    if (!query.trim()) return alertedCities.slice(0, 60);
    const q = normalizeSearchString(query);
    return alertedCities.filter(c =>
      normalizeSearchString(c.en).includes(q) ||
      normalizeSearchString(c.ru).includes(q) ||
      normalizeSearchString(c.he).includes(q) ||
      normalizeSearchString(c.ar).includes(q)
    ).slice(0, 60);
  }, [query, alertedCities]);

  const correlations = useMemo(
    () => targetCity ? computeCorrelations(targetCity.id, sequences) : {},
    [targetCity, sequences]
  );


  const hitCount = useMemo(() => {
    if (!targetCity) return 0;
    const sid = String(targetCity.id);
    return sequences.reduce((acc, s) => {
      if (s.attacks) {
        return acc + s.attacks.filter(a => new Set(a.city_ids.map(String)).has(sid)).length;
      }
      return acc + (s.realAlarmCities.includes(sid) ? 1 : 0);
    }, 0);
  }, [targetCity, sequences]);

  // All significant correlations (pass 10% filter)
  const significant = useMemo(() => {
    const minDenominator = Math.max(3, hitCount * 0.15);
    const results = {};
    Object.entries(correlations).forEach(([id, obj]) => { 
      if (obj.denominator >= minDenominator) {
        results[id] = (obj.denominator - obj.numerator) / obj.denominator;
      }
    });
    return results;
  }, [correlations, hitCount]);

  // Fixed scale bounds for when the city is selected
  const scaleBounds = useMemo(() => {
    const scores = Object.values(significant);
    if (!scores.length) return { min: 0, max: 1 };
    return { min: Math.min(...scores), max: Math.max(...scores) };
  }, [significant]);

  // Apply threshold filter (Safety Score: probability of NO alert)
  const visible = useMemo(() => {
    const r = {};
    Object.entries(significant).forEach(([id, safetyScore]) => { 
      if (safetyScore >= threshold) {
        r[id] = safetyScore;
      }
    });
    return r;
  }, [significant, threshold]);

  // Markers for point mode
  const markers = useMemo(() => {
    if (!targetCity) return [];
    const pts = [{ ...targetCity, kind: 'target', score: null }];
    Object.entries(visible).forEach(([id, score]) => {
      const city = cities[id];
      if (city?.lat && city?.lng) pts.push({ ...city, kind: 'corr', score });
    });
    return pts;
  }, [targetCity, visible, cities]);

  const earlyAlarmCount = useMemo(() => {
    if (!targetCity) return 0;
    const sid = String(targetCity.id);
    return sequences.filter(
      s => s.type === 'PREEMPTIVE_SEQUENCE' && s.preAlarmCities.includes(sid)
    ).length;
  }, [targetCity, sequences]);

  const warnedHits = useMemo(() => {
    if (!targetCity) return 0;
    const sid = String(targetCity.id);
    return sequences.filter(
      s => s.type === 'PREEMPTIVE_SEQUENCE' &&
           s.realAlarmCities.includes(sid) &&
           s.preAlarmCities.includes(sid)
    ).length;
  }, [targetCity, sequences]);

  const pctHit = earlyAlarmCount > 0 ? Math.round(warnedHits / earlyAlarmCount * 100) : 0;

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
    return { 
      color: scoreColor(score, scaleBounds.min, scaleBounds.max), 
      fillColor: scoreColor(score, scaleBounds.min, scaleBounds.max), 
      fillOpacity: 0.3, weight: 1.5 
    };
  };

  return (
    <div className="analysis-container">
      {/* ── Left panel ── */}
      <div className="analysis-panel">
        <div className="analysis-panel-header">
          <h2 className="analysis-title">Safety Analysis</h2>
          {onBack && <button className="back-btn" onClick={onBack}>← History</button>}
        </div>
        <p className="analysis-desc" style={{ marginBottom: '.2rem' }}>
          Identify early warnings that are <strong>least likely</strong> to mean an alert in your city. 
          High scores (Red) indicate that a warning in that region usually means you DON'T have to go to the shelter.
        </p>
        {targetCity && (
          <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 0, marginBottom: '.5rem' }}>
            Showing regions with {Math.max(3, Math.round(hitCount * 0.15))} or more shared warnings (≥15% of {targetCity.en || targetCity.he}'s total alarms).
          </p>
        )}

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
                  <span className="city-he">{c.he} {c.ar && ` · ${c.ar}`}</span>
                  {c.ru && c.en && <span className="city-ru">{c.ru}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>


        <div className="threshold-wrap">
          <div className="threshold-header">
            <span className="threshold-question">Will I likely NOT have to go to the shelter if the early warning is shared with these cities?</span>
            <span className="threshold-value">{Math.round(threshold * 100)}%</span>
          </div>
          <input
            type="range"
            className="threshold-slider"
            min="0" max="100" step="1"
            value={Math.round(threshold * 100)}
            onChange={e => setThreshold(parseInt(e.target.value) / 100)}
          />
          <div className="threshold-ticks"><span>No</span><span>Yes</span></div>
        </div>

        {!polygons && !polyLoading && (
          <div className="zones-warning">
            ⚠ No polygon data available.
          </div>
        )}

        {targetCity && hitCount === 0 && earlyAlarmCount === 0 && (
          <div className="analysis-no-data" style={{ 
            marginTop: '1.5rem', 
            padding: '1.5rem', 
            background: 'rgba(255,255,255,0.03)', 
            borderRadius: '12px',
            textAlign: 'center',
            border: '1px dashed rgba(255,255,255,0.1)'
          }}>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
              No alert or warning history found for <strong>{targetCity.en || targetCity.he}</strong>.
            </p>
            <button className="clear-all-btn" onClick={() => { setTargetCity(null); setQuery(''); }}>
              Select another city
            </button>
          </div>
        )}

        {!targetCity && (
          <div className="analysis-placeholder" style={{ marginTop: '2rem', textAlign: 'center' }}>
            Select a city using the map or the search bar
          </div>
        )}

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

          {/* Polygons ── */}
          {polygons && Object.entries(polygons).map(([id, positions]) => {
            const city = cities[id];
            const isTarget = targetCity && String(targetCity.id) === String(id);
            const score = visible[id];
            
            // Standard "neutral" style for all clickable cities
            let options = { color: 'rgba(148, 163, 184, 0.5)', fillColor: 'rgba(148, 163, 184, 0.2)', weight: 1, fillOpacity: 0.3 };
            
            // Highlight if it's the target or a correlated city
            if (isTarget) {
              options = { color: '#2563eb', fillColor: '#3b82f6', fillOpacity: 0.2, weight: 2.5 };
            } else if (score !== undefined) {
              const col = scoreColor(score, scaleBounds.min, scaleBounds.max);
              options = { color: col, fillColor: col, fillOpacity: 0.3, weight: 1.5 };
            }

            return (
              <Polygon
                key={`poly-${id}`}
                positions={positions}
                pathOptions={options}
                eventHandlers={{
                  click: () => { if (city && !targetCity) handleSelect(city); }
                }}
              >
                {city && score !== undefined && (
                  <Popup>
                    <strong>{city.en || city.ru || city.he}</strong><br />
                    <span style={{ color: '#888' }}>{city.he}</span><br />
                    <em>
                      Of {correlations[id].denominator} shared early warnings, {correlations[id].denominator - correlations[id].numerator} ({Math.round(score * 100)}%) did NOT lead to an alert in {targetCity.en || targetCity.ru || targetCity.he}
                    </em>
                  </Popup>
                )}
              </Polygon>
            );
          })}

          <MapFitter markers={markers} />
        </MapContainer>

        {targetCity && (hitCount > 0 || earlyAlarmCount > 0) && (
          <div className="analysis-info-group">
            <div className="target-info">
              <div className="target-name">
                <span className="blue-dot" />
                <span>{targetCity.en || targetCity.ru || targetCity.he}</span>
                <span className="city-he-small">{targetCity.he} {targetCity.ar && ` · ${targetCity.ar}`}</span>
              </div>
              {targetCity.ru && targetCity.en && <div className="target-ru">{targetCity.ru}</div>}
              
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
                  <span className="trivia-label">Early warnings that lead to at least one alert</span>
                  <span className="trivia-value">{warnedHits}</span>
                </div>
                <div className="trivia-row">
                  <span className="trivia-label">Warnings → alert</span>
                  <span className="trivia-value trivia-pct" style={{ color: pctHit >= 50 ? '#a3e635' : '#f87171' }}>
                    {pctHit}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
