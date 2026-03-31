import { describe, it, expect } from 'vitest';
import { normalizeSearchString } from '../utils.js';

describe('Hebrew punctuation normalization', () => {
  it('should match Hebrew Geresh to single quote', () => {
    // כפר חב'ד (straight) vs כפר חב׳ד (geresh)
    const straight = "כפר חב'ד";
    const geresh = "כפר חב׳ד";
    expect(normalizeSearchString(straight)).toBe(normalizeSearchString(geresh));
  });

  it('should match Hebrew Gershayim to double quote', () => {
    // Using gershayim for initials or names
    const straight = 'חב"ד';
    const gershayim = 'חב״ד';
    expect(normalizeSearchString(straight)).toBe(normalizeSearchString(gershayim));
  });

  it('should handle unicode escapes for Geresh and Gershayim', () => {
    const geresh = "\u05F3";
    const gershayim = "\u05F4";
    expect(normalizeSearchString(geresh)).toBe("'");
    expect(normalizeSearchString(gershayim)).toBe('"');
  });

  it('should still handle standard quotes and smart quotes', () => {
    expect(normalizeSearchString("’")).toBe("'");
    expect(normalizeSearchString("”")).toBe('"');
  });
});
