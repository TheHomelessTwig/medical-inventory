import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebounce } from '../hooks/useDebounce';

describe('useDebounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('hello', 300));
    expect(result.current).toBe('hello');
  });

  it('does NOT update before the delay has elapsed', () => {
    const { result, rerender } = renderHook(({ val }) => useDebounce(val, 300), {
      initialProps: { val: 'initial' },
    });
    rerender({ val: 'updated' });
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current).toBe('initial');
  });

  it('updates after the delay has elapsed', () => {
    const { result, rerender } = renderHook(({ val }) => useDebounce(val, 300), {
      initialProps: { val: 'initial' },
    });
    rerender({ val: 'updated' });
    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current).toBe('updated');
  });

  it('resets the timer on every new value', () => {
    const { result, rerender } = renderHook(({ val }) => useDebounce(val, 300), {
      initialProps: { val: 'a' },
    });
    rerender({ val: 'b' });
    act(() => { vi.advanceTimersByTime(200); });
    rerender({ val: 'c' }); // resets timer
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current).toBe('a'); // still not debounced

    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current).toBe('c'); // now it fires
  });

  it('works with numbers', () => {
    const { result, rerender } = renderHook(({ val }) => useDebounce(val, 100), {
      initialProps: { val: 0 },
    });
    rerender({ val: 42 });
    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current).toBe(42);
  });
});
