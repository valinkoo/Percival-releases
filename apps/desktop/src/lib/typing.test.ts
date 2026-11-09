import { describe, expect, it } from 'vitest';
import { typingLabel } from './typing';

describe('typingLabel', () => {
  it('says nothing when nobody is typing', () => {
    expect(typingLabel([])).toBe('');
  });

  it('names one person', () => {
    expect(typingLabel(['Alice'])).toBe("Alice est en train d'écrire…");
  });

  it('names two people, in alphabetical order', () => {
    expect(typingLabel(['Bob', 'Alice'])).toBe("Alice et Bob sont en train d'écrire…");
  });

  it('does not list more than two people', () => {
    expect(typingLabel(['Alice', 'Bob', 'Carol'])).toBe(
      "Plusieurs personnes sont en train d'écrire…",
    );
  });

  it('does not reorder the list it is given', () => {
    const names = ['Bob', 'Alice'];
    typingLabel(names);
    expect(names).toEqual(['Bob', 'Alice']);
  });
});
