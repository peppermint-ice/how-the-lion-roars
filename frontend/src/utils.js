// ── Formatting helpers ────────────────────────────────────────────────────────

export const formatDuration = (sec) => {
  if (!sec && sec !== 0) return '0:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
};

export const formatLeadTime = (sec) => {
  if (!sec && sec !== 0) return '0s';
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

export const formatDurationStats = (sec) => {
  if (!sec) return '0m';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

// ── Color helpers ────────────────────────────────────────────────────────────

export function heatColor(count, maxCount, tOverride) {
  const t = (tOverride !== undefined) ? tOverride : (maxCount > 0 ? Math.min(1, count / maxCount) : 0);
  const tt = t;
  return `hsl(${(120 * (1 - tt)).toFixed(0)}, ${(80 + tt * 15).toFixed(0)}%, ${(44 - tt * 8).toFixed(0)}%)`;
}

export function effColor(rate) {
  const t = Math.sqrt(Math.max(0, Math.min(1, rate)));
  const H = 120 * t;
  const S = 88 - t * 10;
  const L = 40 + t * 6;
  return `hsl(${H.toFixed(0)}, ${S.toFixed(0)}%, ${L.toFixed(0)}%)`;
}

export function scoreColor(score, minVal = 0, maxVal = 1.0) {
  const lo = minVal;
  const hi = Math.max(lo + 0.01, maxVal);
  const n = Math.max(0, Math.min(1, (score - lo) / (hi - lo)));
  const t = n;
  const H = 120 * t;
  const S = 80 + (1 - t) * 15;
  const L = 44 - (1 - t) * 8;
  return `hsl(${H.toFixed(1)}, ${S.toFixed(0)}%, ${L.toFixed(0)}%)`;
}

// ── Data helpers ─────────────────────────────────────────────────────────────

export function computeMarkers(seq, cities) {
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

export function mapSession(s) {
  return {
    ...s,
    id: s.session_id,
    startTime: s.start_time,
    type: s.start_type === 14 ? 'PREEMPTIVE_SEQUENCE' : 'STANDALONE_ALARM',
    preAlarmCities: (s.warned_city_ids || []).map(String),
    realAlarmCities: (s.alerted_city_ids || []).map(String),
    allAffectedCities: (s.affected_city_ids || []).map(String)
  };
}

export function buildCityIndex(sequences, cities) {
  if (!cities) return [];
  const s = new Set();
  sequences.filter(seq => seq.type === 'PREEMPTIVE_SEQUENCE')
           .forEach(seq => seq.realAlarmCities.forEach(id => s.add(String(id))));
  return Object.values(cities).filter(c => s.has(String(c.id)) && c.lat && c.lng);
}

export function computeCorrelations(targetId, sequences) {
  const strId = String(targetId);
  const pre = sequences.filter(s => s.type === 'PREEMPTIVE_SEQUENCE');
  const targetWarnedSeqs = pre.filter(s => s.preAlarmCities.includes(strId));
  if (!targetWarnedSeqs.length) return {};

  const bothWarnedCounts = {};
  const bothWarnedAndHitCounts = {};

  targetWarnedSeqs.forEach(seq => {
    const isTargetHit = seq.realAlarmCities.includes(strId);
    seq.preAlarmCities.forEach(otherId => {
      if (otherId === strId) return;
      bothWarnedCounts[otherId] = (bothWarnedCounts[otherId] || 0) + 1;
      if (isTargetHit) {
        bothWarnedAndHitCounts[otherId] = (bothWarnedAndHitCounts[otherId] || 0) + 1;
      }
    });
  });

  const result = {};
  Object.keys(bothWarnedCounts).forEach(id => {
    const num = bothWarnedAndHitCounts[id] || 0;
    const den = bothWarnedCounts[id];
    result[id] = { score: num / den, numerator: num, denominator: den };
  });
  return result;
}
