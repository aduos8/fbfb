import { describe, test, expect } from 'vitest';
import { isPaidStatus, isFinalStatus } from './oxapay';

describe('Oxapay helpers', () => {
  test('isPaidStatus returns true for paid', () => {
    expect(isPaidStatus('paid')).toBe(true);
  });

  test('isPaidStatus returns true for manual_accept', () => {
    expect(isPaidStatus('manual_accept')).toBe(true);
  });

  test('isPaidStatus returns false for non-terminal statuses', () => {
    expect(isPaidStatus('new')).toBe(false);
    expect(isPaidStatus('waiting')).toBe(false);
    expect(isPaidStatus('paying')).toBe(false);
  });

  test('isPaidStatus returns false for terminal non-paid statuses', () => {
    expect(isPaidStatus('expired')).toBe(false);
    expect(isPaidStatus('refunded')).toBe(false);
    expect(isPaidStatus('underpaid')).toBe(false);
    expect(isPaidStatus('refunding')).toBe(false);
  });

  test('isFinalStatus returns true for all terminal statuses', () => {
    expect(isFinalStatus('paid')).toBe(true);
    expect(isFinalStatus('manual_accept')).toBe(true);
    expect(isFinalStatus('refunded')).toBe(true);
    expect(isFinalStatus('expired')).toBe(true);
  });

  test('isFinalStatus returns false for non-terminal statuses', () => {
    expect(isFinalStatus('new')).toBe(false);
    expect(isFinalStatus('waiting')).toBe(false);
    expect(isFinalStatus('paying')).toBe(false);
    expect(isFinalStatus('underpaid')).toBe(false);
    expect(isFinalStatus('refunding')).toBe(false);
  });
});
