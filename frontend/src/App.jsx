import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Polygon, Popup, useMap } from 'react-leaflet';
import { AlertCircle, BarChart2, LayoutDashboard, Info } from 'lucide-react';
import AnalysisView from './AnalysisView.jsx';
import StatsView from './StatsView.jsx';

// ── Map controller: re-fit bounds when selection changes ──────────────────────
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

// ── Dot / polygon color logic ─────────────────────────────────────────────────
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
  
  // Create unique set of all city IDs in this sequence
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

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [sequences, setSequences]   = useState([]);
  const [cities, setCities]         = useState({});
  const [loading, setLoading]       = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [hideStandalone, setHideStandalone] = useState(false);
  const [activeView, setActiveView] = useState('history');
  const [analysisCity, setAnalysisCity] = useState(null);
  const [visibleCount, setVisibleCount] = useState(10);

  // ── Shared polygon state ──────────────────────────────────────────────────
  const [polygons, setPolygons]       = useState(null);   // {id: [[lat,lng],...]}
  const [polyLoading, setPolyLoading] = useState(false);

  // Load once
  useEffect(() => {
    if (polygons || polyLoading) return;
    setPolyLoading(true);
    fetch('/polygons.json')
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => { setPolygons(d); setPolyLoading(false); })
      .catch(() => setPolyLoading(false));
  }, []);

  const goToAnalysis = city => { setAnalysisCity(city); setActiveView('analysis'); };

  useEffect(() => {
    fetch('/data.json')
      .then(r => r.json())
      .then(d => {
        let seqs = [];
        if (d.sequences) {
          seqs = d.sequences;
          setCities(d.cities || {});
        } else {
          seqs = d; // fallback for old format if needed during dev
        }
        const sorted = [...seqs].sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
        setSequences(sorted);
        if (sorted.length > 0) setSelectedId(sorted[0].id);
        setLoading(false);
      });
  }, []);

  const selectedSeq = useMemo(() => sequences.find(s => s.id === selectedId), [sequences, selectedId]);
  const markers     = useMemo(() => computeMarkers(selectedSeq, cities), [selectedSeq, cities]);

  if (loading) return <div className="loading">Loading...</div>;

  const nPre = sequences.filter(s => s.type === 'PREEMPTIVE_SEQUENCE').length;
  const nStd = sequences.filter(s => s.type === 'STANDALONE_ALARM').length;
  const visibleSequences = hideStandalone
    ? sequences.filter(s => s.type === 'PREEMPTIVE_SEQUENCE')
    : sequences;
  const pagedSequences = visibleSequences.slice(0, visibleCount);

  return (
    <div className="app-container">
      <header>
        <h1>How The Lion Roars</h1>
        <nav className="header-nav">
          <button
            className={`nav-btn ${activeView === 'history' ? 'active' : ''}`}
            onClick={() => setActiveView('history')}
          >
            <AlertCircle size={14} /> Alert History
          </button>
          <button
            className={`nav-btn ${activeView === 'analysis' ? 'active' : ''}`}
            onClick={() => setActiveView('analysis')}
          >
            <BarChart2 size={14} /> City Analysis
          </button>
          <button
            className={`nav-btn ${activeView === 'stats' ? 'active' : ''}`}
            onClick={() => setActiveView('stats')}
          >
            <LayoutDashboard size={14} /> Statistics
          </button>
          <button
            className={`nav-btn ${activeView === 'about' ? 'active' : ''}`}
            onClick={() => setActiveView('about')}
          >
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
                Data is automatically extracted.
                I parse Pikud HaOref official Telegram channel for early warnings and use Yuval Harpaz's <a href="https://github.com/yuval-harpaz/alarms">alarms</a> project for the alerts data, for that his source identification system is brilliant.
                The project is updated every hour, although there might be delays. <strong>For real-time life-saving information, always refer to the official Pikud HaOref app or website.</strong>
              </p>
            </section>
            <section>
              <h3>Project Status</h3>
              <p>
                It is an alpha version, so feel free to report any issues or suggestions to this email: howthelionroars@protonmail.com.
                This project is 100% vibecoded, so, well. Don't trust it too much.
                And <i>please</i> never take any decisions based on this project. It can be literally deadly.
              </p>
            </section>
            <section>
              <h3>Credits</h3>
              <p>
                Created by <strong>Dmitrii Usenko</strong>, 2026.<br />
                If you like me and speak Russian, you can follow me on Telegram: <a href="https://t.me/zachav" target="_blank" rel="noopener noreferrer">Ад, Израиль и помидоры черри</a>.
                Special thanks to my friend <strong>Grisha</strong> for the original idea behind this project.
              </p>
            </section>
          </div>
        </div>
      ) : (
      <main>
        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <div className="sidebar">
          <div className="legend">
            {Object.values(DOT_COLORS).map(d => (
              <div key={d.label} className="legend-item">
                <span className="legend-dot" style={{ background: d.fill }} />
                {d.label}
              </div>
            ))}
          </div>

          {polyLoading && (
            <div className="zones-warning">
              ⌛ Loading map zones...
            </div>
          )}
          {!polygons && !polyLoading && (
            <div className="zones-warning">
              ⚠ No polygon data available.
            </div>
          )}

          <div className="event-list">
            <div className="list-header">
              <h3>Alert History</h3>
              <button
                className={`filter-btn ${hideStandalone ? 'active' : ''}`}
                onClick={() => {
                  setHideStandalone(v => !v);
                  const sel = sequences.find(s => s.id === selectedId);
                  if (sel && sel.type === 'STANDALONE_ALARM') setSelectedId(null);
                }}
              >
                {hideStandalone ? '⚡ Preemptive only' : '⚡ Hide standalone'}
              </button>
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
                <div className="event-type">{seq.type === 'PREEMPTIVE_SEQUENCE' ? 'Iran' : 'Hezbollah'}</div>
                <div className="event-counts">
                  {seq.preAlarmCities.length > 0 && <span className="tag warned">{seq.preAlarmCities.length} warned</span>}
                  {seq.realAlarmCities.length > 0 && <span className="tag alerted">{seq.realAlarmCities.length} alerted</span>}
                </div>
              </div>
                </React.Fragment>
              );
            })}

            {visibleCount < visibleSequences.length && (
              <button
                className="show-more-btn"
                onClick={() => setVisibleCount(prev => prev + 10)}
              >
                Show 10 more alerts ({visibleSequences.length - visibleCount} remaining)
              </button>
            )}
          </div>
        </div>

        {/* ── Map ─────────────────────────────────────────────────────────── */}
        <div className="map-wrapper">
          <MapContainer
            center={[31.5, 34.9]}
            zoom={8}
            className="map"
            style={{ height: '100%', width: '100%', position: 'absolute', top: 0, left: 0 }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />

            {/* ── Polygons ── */}
            {polygons && markers.map((m, i) => {
              const poly = polygons[String(m.id)];
              if (!poly) return null;
              const style = DOT_COLORS[m.kind];
              return (
                <Polygon
                  key={`poly-${m.id}-${i}`}
                  positions={poly}
                  pathOptions={{
                    color: style.color,
                    fillColor: style.fill,
                    fillOpacity: 0.5,
                    weight: 1.5,
                  }}
                  eventHandlers={{ click: () => goToAnalysis(m) }}
                >
                  <Popup>
                    <strong>{m.en || m.ru || m.he}</strong><br />
                    {m.ru && <span>{m.ru}<br /></span>}
                    <span style={{ color: '#888' }}>{m.he}</span><br />
                    <em>{style.label}</em><br />
                    <span style={{ fontSize: '0.75em', color: '#3b82f6', cursor: 'pointer' }}
                      onClick={() => goToAnalysis(m)}>🔎 Analyze this city</span>
                  </Popup>
                </Polygon>
              );
            })}

            <MapController markers={markers} />
          </MapContainer>

          {/* Info overlay */}
          {selectedSeq && (
            <div className="info-overlay">
              <h2>
                {selectedSeq.type === 'PREEMPTIVE_SEQUENCE' ? 'Attack from Iran' : 'Attack from Lebanon'}
              </h2>
              <p>{new Date(selectedSeq.startTime).toLocaleString()}</p>
              <div className="sequence-summary">
                <div><span className="dot warned-dot" /> {selectedSeq.preAlarmCities.length} cities warned</div>
                <div><span className="dot alerted-dot" /> {selectedSeq.realAlarmCities.length} cities alerted</div>
                <div>
                  {markers.filter(m => m.kind === 'warned_hit').length} hit after warning &nbsp;·&nbsp;
                  {markers.filter(m => m.kind === 'surprise').length} surprise alerts
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
      )}
    </div>
  );
}
