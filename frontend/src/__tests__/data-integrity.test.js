import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { mapSession } from '../utils.js';

const sessions = JSON.parse(readFileSync('public/shelter_sessions.json', 'utf-8'));

describe('real data integrity', () => {
  it('all sessions have valid structure after mapping', () => {
    expect(sessions.length).toBeGreaterThan(0);

    const mapped = sessions.map(mapSession);

    mapped.forEach(s => {
      expect(s.id).toBeDefined();
      expect(s.startTime).toBeDefined();
      expect(['PREEMPTIVE_SEQUENCE', 'STANDALONE_ALARM']).toContain(s.type);
      expect(Array.isArray(s.preAlarmCities)).toBe(true);
      expect(Array.isArray(s.realAlarmCities)).toBe(true);
      s.preAlarmCities.forEach(id => expect(typeof id).toBe('string'));
      s.realAlarmCities.forEach(id => expect(typeof id).toBe('string'));
      expect(s.duration_sec).toBeGreaterThanOrEqual(0);
      if (s.type === 'PREEMPTIVE_SEQUENCE') {
        expect(s.lead_time_sec).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
