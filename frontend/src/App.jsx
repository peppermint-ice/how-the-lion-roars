import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Polygon, Popup, useMap } from 'react-leaflet';
import { AlertCircle, BarChart2, LayoutDashboard, Info } from 'lucide-react';
import AnalysisView from './AnalysisView.jsx';
import StatsView from './StatsView.jsx';

// --- Map controller: re-fit bounds when selection changes ---
const MapController = ({ markers }) => {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    if (markers && markers.length > 0) {
      const lats = markers.map(m => m.lat);
      const lngs = markers.map(m => m.lng);
      const pad = 0.5;
      map.fitBounds(
        [[Math.min(...lats) - pad, Math.min(...lngs) - pad],
         [Math.max(...lats) + pad, Math.max(...lngs) + pad]],
        { maxZoom: 11 }
      );
    }
  }, [markers, map]);
  return null;
};

// --- Formatting helpers ---
const formatDuration = (sec) => {
  if (!sec && sec !== 0) return '0:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
};

const formatLeadTime = (sec) => {
  if (!sec && sec !== 0) return '0s';
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

// --- Dot / polygon color logic ---
const DOT_COLORS = {
  warned_hit:  { color: '#ff2222', fill: '#ff2222', label: 'Early warning + alert' },
  warned_only: { color: '#f59e0b', fill: '#fbbf24', label: 'Early warning only'    },
  surprise:    { color: '#7f1d1d', fill: '#991b1b', label: 'Alert without warning'  },
};

function computeMarkers(seq, cities) {
  if (!seq || !cities) return [];
  const preIds  = new Set(seq.preAlarmCities);
  const realIds = new Set(seq.realAlarmCities);
  const markers = [];
  
  const allIds = new Set([...seq.preAlarmCities, ...seq.realAlarmCities]);
  
  for (const id of allIds) {
    const c = cities[id];
    if (!c || !c.lat || !c.lng) continue;
    
    let kind = 'surprise';
    if (preIds.has(id)) {
      kind = realIds.has(id) ? 'warned_hit' : 'warned_only';
    }
    
    markers.push({ ...c, kind });
  }
  return markers;
}

// --- App ---
export default function App() {
  const [sequences, setSequences]   = useState([]);
  const [cities, setCities]         = useState({});
  const [loading, setLoading]       = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [iranOnly, setIranOnly] = useState(false);
  const [activeView, setActiveView] = useState('history');
  const [analysisCity, setAnalysisCity] = useState(null);
  const [visibleCount, setVisibleCount] = useState(10);

  // --- Filters ---
  const [cityFilter, setCityFilter]     = useState(null);
  const [cityQuery, setCityQuery]       = useState('');
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [dateFrom, setDateFrom]         = useState('');
  const [dateTo, setDateTo]             = useState('');

  // --- Shared polygon state ---
  const [polygons, setPolygons]       = useState(null);
  const [polyLoading, setPolyLoading] = useState(false);

  useEffect(() => {
    if (polygons || polyLoading) return;
    setPolyLoading(true);
    fetch('/polygons.json')
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => { setPolygons(d); setPolyLoading(false); })
      .catch(() => setPolyLoading(false));
  }, []);

  const goToAnalysis = city => {
    setAnalysisCity(city);
    setActiveView('analysis');
    setSelectedId(null);
    setVisibleCount(10);
  };

  useEffect(() => {
    Promise.all([
      fetch('/shelter_sessions.json').then(r => r.json()),
      fetch('/cities.json').then(r => r.json())
    ]).then(([sessions, citiesData]) => {
      // Map cities.json structure to flattened dict
      const citiesMap = {};
      if (citiesData.cities) {
        Object.entries(citiesData.cities).forEach(([name, info]) => {
          citiesMap[info.id] = { ...info, name };
        });
      }

      // Map sessions to old structure for compatibility or update logic
      const mapped = sessions.map(s => ({
        ...s,
        id: s.session_id,
        startTime: s.start_time,
        // For compatibility with legacy filters/logic:
        type: s.start_type === 14 ? 'PREEMPTIVE_SEQUENCE' : 'STANDALONE_ALARM',
        preAlarmCities: (s.warned_city_ids || []).map(String),
        realAlarmCities: (s.alerted_city_ids || []).map(String),
        allAffectedCities: (s.affected_city_ids || []).map(String)
      }));

      const sorted = [...mapped].sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
      setCities(citiesMap);
      setSequences(sorted);
      if (sorted.length > 0) setSelectedId(sorted[0].id);
      setLoading(false);
    });
  }, []);

  const selectedSeq = useMemo(() => sequences.find(s => s.id === selectedId), [sequences, selectedId]);
  const markers     = useMemo(() => computeMarkers(selectedSeq, cities), [selectedSeq, cities]);

  const filteredSequences = useMemo(() => {
    return sequences.filter(s => {
      if (iranOnly && s.origin !== 'Iran') return false;
      if (cityFilter) {
        const strId = String(cityFilter.id);
        const inPre = s.preAlarmCities.includes(strId);
        const inReal = s.realAlarmCities.includes(strId);
        if (!inPre && !inReal) return false;
      }
      const sDate = s.startTime.split('T')[0];
      if (dateFrom && sDate < dateFrom) return false;
      if (dateTo && sDate > dateTo) return false;
      return true;
    });
  }, [sequences, iranOnly, cityFilter, dateFrom, dateTo]);

  const pagedSequences = filteredSequences.slice(0, visibleCount);

  const allCitiesList = useMemo(() => {
    return Object.values(cities).sort((a, b) => (a.en || '').localeCompare(b.en || ''));
  }, [cities]);

  const searchResults = useMemo(() => {
    if (!cityQuery.trim()) return allCitiesList.slice(0, 50);
    const q = cityQuery.toLowerCase().trim();
    return allCitiesList.filter(c =>
      (c.en && c.en.toLowerCase().includes(q)) ||
      (c.ru && c.ru.toLowerCase().includes(q)) ||
      (c.he && c.he.includes(q)) ||
      (c.ar && c.ar.includes(q))
    ).slice(0, 50);
  }, [cityQuery, allCitiesList]);

  if (loading) return <div className="loading">Loading...</div>;

  const nPre = sequences.filter(s => s.type === 'PREEMPTIVE_SEQUENCE').length;
  const nStd = sequences.filter(s => s.type === 'STANDALONE_ALARM').length;

  return (
    <div className="app-container">
      <header>
        <h1>How The Lion Roars</h1>
        <nav className="header-nav">
          <button className={`nav-btn ${activeView === 'history' ? 'active' : ''}`} onClick={() => setActiveView('history')}>
            <AlertCircle size={14} /> Alert History
          </button>
          <button className={`nav-btn ${activeView === 'analysis' ? 'active' : ''}`} onClick={() => setActiveView('analysis')}>
            <BarChart2 size={14} /> City Analysis
          </button>
          <button className={`nav-btn ${activeView === 'stats' ? 'active' : ''}`} onClick={() => setActiveView('stats')}>
            <LayoutDashboard size={14} /> Statistics
          </button>
          <button className={`nav-btn ${activeView === 'about' ? 'active' : ''}`} onClick={() => setActiveView('about')}>
            <Info size={14} /> About
          </button>
        </nav>
        <div className="header-info">
          <span>{sequences.length} attacks · {nPre} early warnings · {nStd} unexpected</span>
        </div>
      </header>

      {activeView === 'stats' ? (
        <StatsView sequences={sequences} cities={cities} polygons={polygons} />
      ) : activeView === 'analysis' ? (
        <AnalysisView
          sequences={sequences}
          cities={cities}
          initialCity={analysisCity}
          onBack={() => setActiveView('history')}
          polygons={polygons}
          polyLoading={polyLoading}
        />
      ) : activeView === 'about' ? (
        <div className="about-container">
          <div className="about-card">
            <section>
              <h3>Methodology</h3>
              <p>
                Data is automatically extracted. I parse Pikud HaOref official Telegram channel for early warnings and use Yuval Harpaz's alarms project for the alerts data.
              </p>
            </section>
            <section>
              <h3>Credits</h3>
              <p>Created by Dmitrii Usenko, 2026.</p>
            </section>
          </div>
        </div>
      ) : (
      <main>
        <div className="sidebar">
          <div className="legend">
            {Object.values(DOT_COLORS).map(d => (
              <div key={d.label} className="legend-item">
                <span className="legend-dot" style={{ background: d.fill }} />
                {d.label}
              </div>
            ))}
          </div>

          <div className="event-list">
            <div className="list-header">
              <h3>Alert History</h3>
              <button
                className={`filter-btn ${iranOnly ? 'active' : ''}`}
                onClick={() => setIranOnly(v => !v)}
              >
                {iranOnly ? 'Iran only' : 'Hide Hezbollah'}
              </button>
            </div>

            <div className="filter-controls">
              <div className="search-wrap">
                <input
                  type="text"
                  className="city-input"
                  placeholder="Filter by city..."
                  value={cityQuery}
                  onChange={e => { setCityQuery(e.target.value); setShowCityDropdown(true); }}
                  onFocus={() => setShowCityDropdown(true)}
                />
                {showCityDropdown && (
                  <ul className="city-dropdown" onMouseLeave={() => setShowCityDropdown(false)}>
                    {searchResults.map(c => (
                      <li key={c.id} className="city-option" onClick={() => {
                        setCityFilter(c);
                        setCityQuery(c.en || c.ru || c.he);
                        setShowCityDropdown(false);
                        setVisibleCount(10);
                      }}>
                        <span className="city-en">{c.en}</span>
                        <span className="city-he-small">{c.he} {c.ar && ` · ${c.ar}`}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="date-filter-row">
                <div className="date-group">
                  <label>From</label>
                  <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setVisibleCount(10); }} />
                </div>
                <div className="date-group">
                  <label>To</label>
                  <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setVisibleCount(10); }} />
                </div>
              </div>
              {(cityFilter || dateFrom || dateTo) && (
                <button className="clear-all-btn" onClick={() => {
                  setCityFilter(null);
                  setCityQuery('');
                  setDateFrom('');
                  setDateTo('');
                  setVisibleCount(10);
                }}>Clear all filters</button>
              )}
            </div>

            {pagedSequences.map((seq, i) => {
              const thisDay = new Date(seq.startTime).toDateString();
              const prevDay = i > 0 ? new Date(pagedSequences[i-1].startTime).toDateString() : null;
              return (
                <React.Fragment key={seq.id}>
                  {thisDay !== prevDay && (
                    <div className="day-divider">
                      {new Date(seq.startTime).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' })}
                    </div>
                  )}
                  <div
                    className={`event-item ${seq.type} ${selectedId === seq.id ? 'active' : ''}`}
                    onClick={() => setSelectedId(seq.id)}
                  >
                    <div className="event-meta">
                      <span className="event-date">{new Date(seq.startTime).toLocaleDateString()}</span>
                      <span className="event-time">{new Date(seq.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="event-type">
                      {seq.origin === 'Lebanon' ? 'Hezbollah' : (seq.origin || (seq.type === 'PREEMPTIVE_SEQUENCE' ? 'Iran' : 'Hezbollah'))}
                    </div>
                    <div className="event-counts">
                      {seq.preAlarmCities.length > 0 && <span className="tag warned">{seq.preAlarmCities.length} warned</span>}
                      {seq.realAlarmCities.length > 0 && <span className="tag alerted">{seq.realAlarmCities.length} alerted</span>}
                    </div>
                  </div>
                </React.Fragment>
              );
            })}

            {visibleCount < filteredSequences.length && (
              <button className="show-more-btn" onClick={() => setVisibleCount(prev => prev + 10)}>
                Show more ({filteredSequences.length - visibleCount} remaining)
              </button>
            )}
          </div>
        </div>

        <div className="map-wrapper">
          <MapContainer center={[31.5, 34.9]} zoom={8} className="map" style={{ height: '100%', width: '100%', position: 'absolute' }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {polygons && markers.map((m, i) => {
              const poly = polygons[String(m.id)];
              if (!poly) return null;
              const style = DOT_COLORS[m.kind];
              return (
                <Polygon
                  key={`poly-${m.id}-${i}`}
                  positions={poly}
                  pathOptions={{ color: style.color, fillColor: style.fill, fillOpacity: 0.5, weight: 1.5 }}
                  eventHandlers={{ click: () => goToAnalysis(m) }}
                >
                  <Popup>
                    <strong>{m.en || m.ru || m.he}</strong><br />
                    <em>{style.label}</em>
                  </Popup>
                </Polygon>
              );
            })}
            <MapController markers={markers} />
          </MapContainer>

          {selectedSeq && (
            <div className="info-overlay">
              <div className="origin-badge">Origin: {selectedId === '194' || selectedId === '196' ? 'Iran State' : selectedSeq.origin}</div>
              <p className="overlay-time">{new Date(selectedSeq.startTime).toLocaleString('en-GB')}</p>
              
              <div className="sequence-summary">
                <div className="stat-row">
                  <span className="dot warned-dot" />
                  <span>{selectedSeq.preAlarmCities.length} cities warned</span>
                </div>
                <div className="stat-row">
                  <span className="dot alerted-dot" />
                  <span>{selectedSeq.realAlarmCities.length} cities alerted</span>
                </div>
                <div className="stat-divider" />
                <div className="stat-row highlight">
                  <span>Time in shelter:</span>
                  <strong>{formatDuration(selectedSeq.duration_sec)}</strong>
                </div>
                {selectedSeq.lead_time_sec > 0 && (
                  <div className="stat-row highlight lead">
                    <span>Time after early warning:</span>
                    <strong>{formatLeadTime(selectedSeq.lead_time_sec)}</strong>
                  </div>
                )}
                {selectedSeq.attack_times && selectedSeq.attack_times.length > 0 && (
                  <div className="stat-row mini">
                    <span>Waves: {selectedSeq.attack_times.length}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
      )}
    </div>
  );
}
