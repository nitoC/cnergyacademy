import { describe, expect, it } from 'vitest';
import { safeNext } from './safe-next';

describe('safeNext', () => {
  it('allows same-site paths only', () => {
    expect(safeNext('/learn/courses/1')).toBe('/learn/courses/1');
    expect(safeNext('https://evil.test')).toBeNull();
    expect(safeNext('//evil.test')).toBeNull();
    expect(safeNext('/\\evil.test')).toBeNull();
    expect(safeNext(null)).toBeNull();
  });
});
