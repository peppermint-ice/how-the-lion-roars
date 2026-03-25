import { describe, it, expect } from 'vitest';
import { heatColor, effColor, scoreColor } from '../utils.js';

const parseH = (hsl) => parseInt(hsl.match(/hsl\(([0-9.]+)/)[1]);

describe('heatColor', () => {
  it('returns green (H=120) for count 0', () => {
    expect(parseH(heatColor(0, 100))).toBe(120);
  });

  it('returns red (H=0) for max count', () => {
    expect(parseH(heatColor(100, 100))).toBe(0);
  });

  it('returns valid HSL when maxCount is 0 (division guard)', () => {
    expect(heatColor(0, 0)).toMatch(/^hsl\(/);
  });

  it('uses tOverride instead of count/maxCount ratio', () => {
    expect(parseH(heatColor(0, 100, 0.5))).toBe(60);
  });
});

describe('effColor', () => {
  it('returns red (H=0) for rate 0', () => {
    expect(parseH(effColor(0))).toBe(0);
  });

  it('returns green (H=120) for rate 1', () => {
    expect(parseH(effColor(1))).toBe(120);
  });

  it('clamps negative rate to 0 (red)', () => {
    expect(parseH(effColor(-1))).toBe(0);
  });

  it('clamps rate > 1 to green', () => {
    expect(parseH(effColor(1.5))).toBe(120);
  });
});

describe('scoreColor', () => {
  it('returns valid HSL when minVal equals maxVal (division guard)', () => {
    expect(scoreColor(0.5, 0.5, 0.5)).toMatch(/^hsl\(/);
  });

  it('returns red (H=0) for min score', () => {
    expect(parseH(scoreColor(0, 0, 1))).toBe(0);
  });

  it('returns green (H=120) for max score', () => {
    expect(parseH(scoreColor(1, 0, 1))).toBe(120);
  });
});
