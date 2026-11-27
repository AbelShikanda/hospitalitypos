import { describe, expect, it } from 'vitest';
import { canApplyUpdate, parseReleaseNotes } from './updates-core.js';

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

describe('release notes', () => {
  it('accepts versioned notes and drops invalid entries', () => {
    expect(
      parseReleaseNotes({
        version: '1.2.3',
        notes: ['Faster billing', '', 42, 'Safer updates'],
      }),
    ).toEqual({ version: '1.2.3', notes: ['Faster billing', 'Safer updates'] });
  });

  it('rejects malformed release notes', () => {
    expect(parseReleaseNotes(null)).toBeNull();
    expect(parseReleaseNotes({ notes: ['Missing version'] })).toBeNull();
    expect(parseReleaseNotes({ version: '1.0.0', notes: [] })).toBeNull();
  });
});
