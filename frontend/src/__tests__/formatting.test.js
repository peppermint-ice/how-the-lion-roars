import { describe, it, expect } from 'vitest';
import { formatDuration, formatLeadTime, formatDurationStats } from '../utils.js';

describe('formatDuration', () => {
  it('returns "0:00" for null', () => {
    expect(formatDuration(null)).toBe('0:00');
  });

  it('returns "0:00" for undefined', () => {
    expect(formatDuration(undefined)).toBe('0:00');
  });

  it('returns "0:00" for 0', () => {
    expect(formatDuration(0)).toBe('0:00');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(125)).toBe('2:05');
  });

  it('formats hours, minutes, and seconds', () => {
    expect(formatDuration(3661)).toBe('1:01:01');
  });
});

describe('formatLeadTime', () => {
  it('returns "0s" for null', () => {
    expect(formatLeadTime(null)).toBe('0s');
  });

  it('returns seconds format under 60', () => {
    expect(formatLeadTime(45)).toBe('45s');
  });

  it('formats exactly 60 as minutes', () => {
    expect(formatLeadTime(60)).toBe('1:00');
  });
});

describe('formatDurationStats', () => {
  it('returns "0m" for null', () => {
    expect(formatDurationStats(null)).toBe('0m');
  });

  it('returns "0m" for 0', () => {
    expect(formatDurationStats(0)).toBe('0m');
  });

  it('formats hours and minutes', () => {
    expect(formatDurationStats(3660)).toBe('1h 1m');
  });
});
