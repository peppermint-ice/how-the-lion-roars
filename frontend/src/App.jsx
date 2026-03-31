import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Polygon, Popup, useMap } from 'react-leaflet';
import { AlertCircle, BarChart2, LayoutDashboard, Info, Menu, X, Plane, Rocket } from 'lucide-react';
import AnalysisView from './AnalysisView.jsx';
import StatsView from './StatsView.jsx';
import { formatDuration, formatLeadTime, computeMarkers, mapSession, normalizeSearchString } from './utils.js';

// --- Map controller: re-fit bounds when selection changes ---
const MapController = ({ markers }) => {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    if (markers && markers.length > 0) {
      const lats = markers.map(m => m.lat).filter(Boolean);
      const lngs = markers.map(m => m.lng).filter(Boolean);
      if (!lats.length || !lngs.length) return;
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

// --- Dot / polygon color logic ---
const DOT_COLORS = {
  warned_hit:  { color: '#ff2222', fill: '#ff2222', label: 'Early warning + alert' },
  warned_only: { color: '#f59e0b', fill: '#fbbf24', label: 'Early warning only'    },
  surprise:    { color: '#7f1d1d', fill: '#991b1b', label: 'Alert without warning'  },
};

// --- App ---
export default function App() {
  const [sequences, setSequences]   = useState([]);
  const [cities, setCities]         = useState({});
  const [loading, setLoading]       = useState(true);
  const [loadError, setLoadError]   = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [iranOnly, setIranOnly] = useState(false);
  const [activeView, setActiveView] = useState('history');
  const [analysisCity, setAnalysisCity] = useState(null);
  const [visibleCount, setVisibleCount] = useState(10);
  const [activeWave, setActiveWave]       = useState(null);
  const [isMenuOpen, setIsMenuOpen]       = useState(false);
  const [hasAgreed, setHasAgreed]         = useState(false);

  const handleAgree = () => {
    setHasAgreed(true);
  };

  // --- Filters ---
  const [cityFilter, setCityFilter]     = useState(null);
  const [cityQuery, setCityQuery]       = useState('');
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [dateFrom, setDateFrom]         = useState('');
  const [dateTo, setDateTo]             = useState('');
  const [filterDrones, setFilterDrones]     = useState(true);
  const [allStats, setAllStats]             = useState(null);

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
    setIsMenuOpen(false);
  };

  // Reset active wave when selection changes
  useEffect(() => {
    setActiveWave(null);
  }, [selectedId]);

  useEffect(() => {
    Promise.all([
      fetch('/shelter_sessions.json').then(r => { if (!r.ok) throw new Error(`Sessions: ${r.status}`); return r.json(); }),
      fetch('/cities.json').then(r => { if (!r.ok) throw new Error(`Cities: ${r.status}`); return r.json(); }),
      fetch('/all_stats.csv').then(r => { if (!r.ok) return ""; return r.text(); })
    ]).then(([sessions, citiesData, statsCsv]) => {
      // Map cities.json structure to flattened dict
      const citiesMap = {};
      if (citiesData.cities) {
        Object.entries(citiesData.cities).forEach(([name, info]) => {
          citiesMap[info.id] = { ...info, name };
        });
      }

      const mapped = sessions.map(mapSession);

      const sorted = [...mapped].sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
      
      const statsMap = {};
      if (statsCsv) {
        const lines = statsCsv.trim().split('\n').slice(1);
        lines.forEach(l => {
          const p = l.split(',');
          if (p.length < 11) return;
          statsMap[p[0]] = {
            iran_m: parseInt(p[1]), iran_d: parseInt(p[2]),
            leba_m: parseInt(p[3]), leba_d: parseInt(p[4]),
            other_m: parseInt(p[5]), other_d: parseInt(p[6]),
            warn: parseInt(p[7]), hit: parseInt(p[8]),
            total_hit: parseInt(p[9]), dur: parseInt(p[10])
          };
        });
      }

      setCities(citiesMap);
      setSequences(sorted);
      setAllStats(statsMap);
      if (sorted.length > 0) setSelectedId(sorted[0].id);
      setLoading(false);
    }).catch(err => {
      setLoadError(err.message);
      setLoading(false);
    });
  }, []);

  const selectedSeq = useMemo(() => sequences.find(s => s.id === selectedId), [sequences, selectedId]);
  const markers     = useMemo(() => computeMarkers(selectedSeq, cities), [selectedSeq, cities]);
  const activeWaveSet = useMemo(
    () => activeWave ? new Set(activeWave.city_ids.map(String)) : null,
    [activeWave]
  );

  const filteredSequences = useMemo(() => {
    return sequences.filter(s => {
      if (iranOnly && s.origin !== 'Iran') return false;
      
      const cats = s.categories || [];
      if (cats.length > 0) {
        // Missiles (cat 1) are always shown; drones (cat 2) follow the filter toggle.
        const canShowMissile = cats.includes(1);
        const canShowDrone = filterDrones && cats.includes(2);
        if (!canShowMissile && !canShowDrone) return false;
      }

      if (cityFilter) {
        const strId = String(cityFilter.id);
        const inPre = s.preAlarmCities.includes(strId);
        const inReal = s.realAlarmCities.includes(strId);
        if (!inPre && !inReal) return false;
      }
      const sDate = (s.startTime || '').split('T')[0];
      if (dateFrom && sDate < dateFrom) return false;
      if (dateTo && sDate > dateTo) return false;
      return true;
    });
  }, [sequences, iranOnly, cityFilter, dateFrom, dateTo, filterDrones]);

  const pagedSequences = filteredSequences.slice(0, visibleCount);

  const allCitiesList = useMemo(() => {
    return Object.values(cities).sort((a, b) => (a.en || '').localeCompare(b.en || ''));
  }, [cities]);

  const searchResults = useMemo(() => {
    if (!cityQuery.trim()) return allCitiesList.slice(0, 50);
    const q = normalizeSearchString(cityQuery);
    return allCitiesList.filter(c =>
      normalizeSearchString(c.en).includes(q) ||
      normalizeSearchString(c.ru).includes(q) ||
      normalizeSearchString(c.he).includes(q) ||
      normalizeSearchString(c.ar).includes(q)
    ).slice(0, 50);
  }, [cityQuery, allCitiesList]);

  if (loadError) return <div className="loading">Failed to load data: {loadError}</div>;
  if (loading) return <div className="loading">Loading...</div>;

  const nPre = sequences.filter(s => s.type === 'PREEMPTIVE_SEQUENCE').length;
  const nStd = sequences.filter(s => s.type === 'STANDALONE_ALARM').length;

  return (
    <div className="app-container">
      <header>
        <button className="menu-toggle" onClick={() => setIsMenuOpen(!isMenuOpen)}>
          {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
        <h1>How The Lion Roars</h1>
        <nav className={`header-nav ${isMenuOpen ? 'open' : ''}`}>
          <button className={`nav-btn ${activeView === 'history' ? 'active' : ''}`} onClick={() => { setActiveView('history'); setIsMenuOpen(false); }}>
            <AlertCircle size={14} /> Alert History
          </button>
          <button className={`nav-btn ${activeView === 'analysis' ? 'active' : ''}`} onClick={() => { setActiveView('analysis'); setIsMenuOpen(false); }}>
            <BarChart2 size={14} /> City Analysis
          </button>
          <button className={`nav-btn ${activeView === 'stats' ? 'active' : ''}`} onClick={() => { setActiveView('stats'); setIsMenuOpen(false); }}>
            <LayoutDashboard size={14} /> Statistics
          </button>
          <button className={`nav-btn ${activeView === 'about' ? 'active' : ''}`} onClick={() => { setActiveView('about'); setIsMenuOpen(false); }}>
            <Info size={14} /> About
          </button>

          <div className="mobile-header-stats">
            <span>{sequences.length} attacks · {nPre} early warnings · {nStd} unexpected</span>
          </div>
        </nav>
        <div className="header-info">
          <span>{sequences.length} attacks · {nPre} early warnings · {nStd} unexpected</span>
        </div>
      </header>

      {activeView === 'stats' ? (
        <StatsView sequences={sequences} cities={cities} polygons={polygons} allStats={allStats} />
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
                Data is automatically extracted. I use Tzeva Adom's API for early warnings and <a href="https://github.com/yuvalharpaz/alarms">Yuval Harpaz's alarms project</a> for the alerts data, for that his source identification system is brilliant. The project is updated daily, although there might be delays. <b>For real-time life-saving information, always refer to the official Pikud HaOref app or website.</b>
              </p>
              <p>
                The source code is open and available on <a href="https://github.com/peppermint-ice/how-the-lion-roars" target="_blank" rel="noopener noreferrer">GitHub</a>.
              </p>
              <h3>Project Status</h3>
              <p>It is an alpha version, so feel free to report any issues or suggestions to this email: howthelionroars@protonmail.com. This project is 100% vibecoded, so, well. Don't trust it too much. And please never take any decisions based on this project. It can be literally deadly.</p>
            </section>
            <section>
              <h3>Credits</h3>
              <p>Created by Dmitrii Usenko, 2026.</p>
              <p>If you like me and speak Russian, you can follow me on Telegram: <a href="https://t.me/zachav">Ад, Израиль и помидоры черри</a>. Special thanks to my friend Grisha for the original idea behind this project.</p>
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
              <div className="filter-group-main">
                <button
                  className={`filter-btn ${iranOnly ? 'active' : ''}`}
                  onClick={() => setIranOnly(v => !v)}
                >
                  {iranOnly ? 'Iran only' : 'Hide Hezbollah'}
                </button>
                <button
                  className={`filter-btn ${!filterDrones ? 'active' : ''}`}
                  onClick={() => setFilterDrones(v => !v)}
                >
                  {!filterDrones ? 'Missiles only' : 'Hide Drones'}
                </button>
              </div>
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
                      <span className="attack-icons">
                        {seq.categories?.includes(2) && <Plane size={14} className="attack-icon plane" />}
                        {seq.categories?.includes(1) && <Rocket size={14} className="attack-icon missile" />}
                      </span>
                      {cityFilter && (
                        <span className="city-status-inline">
                          <span className={`dot ${seq.realAlarmCities.includes(String(cityFilter.id)) ? 'alerted-dot' : 'warned-dot'}`} />
                          {cityFilter.en || cityFilter.he}
                        </span>
                      )}
                    </div>
                    <div className="event-counts">
                      {seq.preAlarmCities.length > 0 && <span className="tag warned">{seq.preAlarmCities.length} warned</span>}
                      {seq.realAlarmCities.length > 0 && <span className="tag alerted">{seq.realAlarmCities.length} alerted</span>}
                    </div>

                    {selectedId === seq.id && seq.attacks && seq.attacks.length > 1 && (
                      <div className="event-subevents">
                        {[...seq.attacks].reverse().map((w, idx) => (
                          <div 
                            key={idx} 
                            className={`event-wave-item ${activeWave === w ? 'active' : ''}`}
                            onClick={(e) => { e.stopPropagation(); setActiveWave(activeWave === w ? null : w); }}
                          >
                            <span className="wave-time">{new Date(w.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            <span className="wave-type-icon">
                              {Number(w.category) === 2 ? <Plane size={12} /> : <Rocket size={12} />}
                            </span>
                            <span className="wave-count">{w.city_ids.length} cities</span>
                          </div>
                        ))}
                      </div>
                    )}
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
            {/* Draw all city polygons */}
            {polygons && Object.keys(polygons).map(cid => {
              const poly = polygons[cid];
              const city = cities[cid];
              if (!city) return null;

              const marker = markers.find(m => String(m.id) === cid);
              
              if (marker) {
                const isActiveInWave = activeWaveSet && activeWaveSet.has(String(cid));
                const style = DOT_COLORS[marker.kind];
                return (
                  <Polygon
                    key={`poly-${cid}`}
                    positions={poly}
                    pathOptions={{ 
                      color: style.color, 
                      fillColor: style.fill, 
                      fillOpacity: activeWave ? (isActiveInWave ? 0.8 : 0.1) : 0.5, 
                      weight: isActiveInWave ? 3 : 1.5 
                    }}
                    eventHandlers={{ click: () => goToAnalysis(marker) }}
                  >
                    <Popup>
                      <strong>{marker.en || marker.ru || marker.he}</strong><br />
                      <em>{style.label}</em>
                    </Popup>
                  </Polygon>
                );
              } else {
                // Transparent interactive polygon for other cities
                return (
                  <Polygon
                    key={`poly-bg-${cid}`}
                    positions={poly}
                    pathOptions={{ 
                      stroke: false,
                      fillOpacity: 0
                    }}
                    eventHandlers={{ click: () => goToAnalysis(city) }}
                  />
                );
              }
            })}
            <MapController markers={markers} />
          </MapContainer>

          {selectedSeq && (
            <div className="info-overlay">
              <div className="origin-badge">
                Origin: {selectedId === '194' || selectedId === '196' ? 'Iran State' : selectedSeq.origin}
                <span className="attack-icons">
                  {selectedSeq.categories?.includes(2) && <Plane size={14} className="attack-icon plane" />}
                  {selectedSeq.categories?.includes(1) && <Rocket size={14} className="attack-icon missile" />}
                </span>
              </div>
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

                {selectedSeq.attack_times && selectedSeq.attack_times.length === 1 && (
                  <div className="stat-row mini">
                    <span>Wave: {new Date(selectedSeq.attack_times[0]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
      )}
      {!hasAgreed && (
        <div className="disclaimer-overlay">
          <div className="disclaimer-card">
            <h2>Disclaimer</h2>
            <p>
              I understand that this website is purely informational, unofficial, and can't be used as a reason to decide whether or not to go to the shelter. I understand that following the Home Front Command guidelines is essential.
            </p>
            <button className="disclaimer-btn" onClick={handleAgree}>I Understand & Agree</button>
          </div>
        </div>
      )}
    </div>
  );
}
