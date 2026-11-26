import { describe, expect, it } from 'vitest';
import { canApplyUpdate } from './updates-core.js';

describe('update reload guard', () => {
  it('requires a waiting update', () => {
    expect(canApplyUpdate(false, false)).toBe(false);
    expect(canApplyUpdate(true, false)).toBe(false);
  });

  it('defers the reload while a bill is open', () => {
    expect(canApplyUpdate(true, true)).toBe(false);
    expect(canApplyUpdate(false, true)).toBe(true);
  });
});
