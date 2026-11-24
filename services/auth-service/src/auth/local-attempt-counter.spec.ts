import { LocalAttemptCounter } from './local-attempt-counter';

describe('LocalAttemptCounter', () => {
  it('counts attempts inside the window and forgets them after it', () => {
    const c = new LocalAttemptCounter();
    expect(c.hit('k', 60, 0)).toBe(1);
    expect(c.hit('k', 60, 1000)).toBe(2);
    expect(c.count('k', 59_000)).toBe(2);
    expect(c.count('k', 61_000)).toBe(0);
    expect(c.hit('k', 60, 61_000)).toBe(1);
  });

  it('clears a key and stays bounded under many keys', () => {
    const c = new LocalAttemptCounter(10);
    c.hit('a', 60, 0);
    c.clear('a');
    expect(c.count('a', 0)).toBe(0);
    for (let i = 0; i < 100; i += 1) c.hit(`k${i}`, 60, 0);
    expect(c.count('k99', 0)).toBe(1);
  });
});
