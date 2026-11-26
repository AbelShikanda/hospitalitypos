import { describe, expect, it } from 'vitest';
import { navVisibleInMode, resolveAppMode } from './mode.js';

describe('app mode', () => {
  it('trusts a live edge health probe over the build mode', () => {
    expect(resolveAppMode('hosted', 'edge')).toBe('edge');
    expect(resolveAppMode('edge', 'hosted')).toBe('hosted');
  });

  it('falls back to the build mode without a health probe', () => {
    expect(resolveAppMode('hosted', undefined)).toBe('hosted');
    expect(resolveAppMode('edge', undefined)).toBe('edge');
    expect(resolveAppMode(undefined, undefined)).toBe('edge');
  });

  it('hides edge-only navigation in hosted mode', () => {
    expect(navVisibleInMode('KDS', 'edge')).toBe(true);
    expect(navVisibleInMode('KDS', 'hosted')).toBe(false);
    expect(navVisibleInMode('Tables', 'hosted')).toBe(true);
  });
});
