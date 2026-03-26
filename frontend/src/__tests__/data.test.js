import { describe, it, expect } from 'vitest';
import { mapSession, computeMarkers, computeCorrelations, buildCityIndex } from '../utils.js';

// --- mapSession ---

describe('mapSession', () => {
  it('maps start_type 14 to PREEMPTIVE_SEQUENCE', () => {
    const raw = { session_id: '1', start_time: '2026-01-01 10:00:00', start_type: 14 };
    expect(mapSession(raw).type).toBe('PREEMPTIVE_SEQUENCE');
  });

  it('maps start_type 1 to STANDALONE_ALARM', () => {
    const raw = { session_id: '1', start_time: '2026-01-01 10:00:00', start_type: 1 };
    expect(mapSession(raw).type).toBe('STANDALONE_ALARM');
  });

  it('handles null warned_city_ids', () => {
    const raw = { session_id: '1', start_time: '2026-01-01', start_type: 14, warned_city_ids: null };
    expect(mapSession(raw).preAlarmCities).toEqual([]);
  });

  it('converts city IDs to strings', () => {
    const raw = { session_id: '1', start_time: '2026-01-01', start_type: 14, warned_city_ids: [1, 2] };
    expect(mapSession(raw).preAlarmCities).toEqual(['1', '2']);
  });
});

// --- computeMarkers ---

const cities = {
  '1': { id: '1', lat: 32.08, lng: 34.78, en: 'Tel Aviv' },
  '2': { id: '2', lat: 31.77, lng: 35.21, en: 'Jerusalem' },
  '3': { id: '3', lat: 32.79, lng: 34.99, en: 'Haifa' },
};

describe('computeMarkers', () => {
  it('returns empty array for null seq', () => {
    expect(computeMarkers(null, cities)).toEqual([]);
  });

  it('returns empty array for null cities', () => {
    const seq = { preAlarmCities: ['1'], realAlarmCities: ['1'] };
    expect(computeMarkers(seq, null)).toEqual([]);
  });

  it('classifies city in both pre+real as warned_hit', () => {
    const seq = { preAlarmCities: ['1'], realAlarmCities: ['1'] };
    const result = computeMarkers(seq, cities);
    expect(result[0].kind).toBe('warned_hit');
  });

  it('classifies city in pre only as warned_only', () => {
    const seq = { preAlarmCities: ['1'], realAlarmCities: ['2'] };
    const result = computeMarkers(seq, cities);
    const telAviv = result.find(m => m.en === 'Tel Aviv');
    expect(telAviv.kind).toBe('warned_only');
  });

  it('classifies city in real only as surprise', () => {
    const seq = { preAlarmCities: ['1'], realAlarmCities: ['2'] };
    const result = computeMarkers(seq, cities);
    const jerusalem = result.find(m => m.en === 'Jerusalem');
    expect(jerusalem.kind).toBe('surprise');
  });
});

// --- computeCorrelations ---

describe('computeCorrelations', () => {
  const sequences = [
    {
      type: 'PREEMPTIVE_SEQUENCE',
      preAlarmCities: ['1', '2', '3'],
      realAlarmCities: ['1', '2'],
    },
    {
      type: 'PREEMPTIVE_SEQUENCE',
      preAlarmCities: ['1', '3'],
      realAlarmCities: ['3'],
    },
  ];

  it('returns empty object for target never warned', () => {
    expect(computeCorrelations('999', sequences)).toEqual({});
  });

  it('excludes target city from its own correlations', () => {
    const result = computeCorrelations('1', sequences);
    expect(result).not.toHaveProperty('1');
  });

  it('computes correct score for co-warned cities', () => {
    // Target='1': warned in seq[0] (hit) and seq[1] (not hit)
    // City '2': co-warned in seq[0] only → den=1, num=1, score=1
    // City '3': co-warned in seq[0] (hit) and seq[1] (not hit) → den=2, num=1, score=0.5
    const result = computeCorrelations('1', sequences);
    expect(result['2']).toEqual({ score: 1, numerator: 1, denominator: 1 });
    expect(result['3']).toEqual({ score: 0.5, numerator: 1, denominator: 2 });
  });
});

// --- Set.has() vs .includes() equivalence (validates fixes #4 and #5) ---

describe('Set.has() lookup equivalence', () => {
  // These tests validate that the Set.has() optimization in AnalysisView hitCount
  // and StatsView warningMap produces identical results to the original .includes()

  const attacks = [
    { city_ids: ['510', '1232', '813'] },
    { city_ids: ['510', '1470'] },
    { city_ids: [] },
  ];

  it('finds city present in attack wave', () => {
    const sid = '510';
    const includesResult = attacks.filter(a => a.city_ids.map(String).includes(sid)).length;
    const setResult = attacks.filter(a => new Set(a.city_ids.map(String)).has(sid)).length;
    expect(setResult).toBe(includesResult);
    expect(setResult).toBe(2);
  });

  it('does not find city absent from all waves', () => {
    const sid = '9999';
    const includesResult = attacks.filter(a => a.city_ids.map(String).includes(sid)).length;
    const setResult = attacks.filter(a => new Set(a.city_ids.map(String)).has(sid)).length;
    expect(setResult).toBe(includesResult);
    expect(setResult).toBe(0);
  });

  it('handles empty city_ids array', () => {
    const emptyAttacks = [{ city_ids: [] }];
    const sid = '510';
    const includesResult = emptyAttacks.filter(a => a.city_ids.map(String).includes(sid)).length;
    const setResult = emptyAttacks.filter(a => new Set(a.city_ids.map(String)).has(sid)).length;
    expect(setResult).toBe(includesResult);
    expect(setResult).toBe(0);
  });

  it('handles numeric city_ids converted to strings', () => {
    const numericAttacks = [{ city_ids: [510, 1232] }];
    const sid = '510';
    const includesResult = numericAttacks.filter(a => a.city_ids.map(String).includes(sid)).length;
    const setResult = numericAttacks.filter(a => new Set(a.city_ids.map(String)).has(sid)).length;
    expect(setResult).toBe(includesResult);
    expect(setResult).toBe(1);
  });
});

// --- buildCityIndex ---

describe('buildCityIndex', () => {
  it('returns empty array for null cities', () => {
    expect(buildCityIndex([], null)).toEqual([]);
  });

  it('returns empty array when no PREEMPTIVE_SEQUENCE', () => {
    const seqs = [{ type: 'STANDALONE_ALARM', realAlarmCities: ['1'] }];
    expect(buildCityIndex(seqs, cities)).toEqual([]);
  });

  it('returns only cities that appear in realAlarmCities of preemptive sequences', () => {
    const seqs = [{ type: 'PREEMPTIVE_SEQUENCE', realAlarmCities: ['1', '2'] }];
    const result = buildCityIndex(seqs, cities);
    expect(result.length).toBe(2);
    expect(result.map(c => c.en).sort()).toEqual(['Jerusalem', 'Tel Aviv']);
  });
});
