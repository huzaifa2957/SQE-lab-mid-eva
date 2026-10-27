import { describe, expect, it } from 'vitest';
import { CORE_VERSION } from '../src';

describe('@evm/core skeleton', () => {
  it('exposes a version string', () => {
    expect(CORE_VERSION).toBe('0.0.0');
  });
});
