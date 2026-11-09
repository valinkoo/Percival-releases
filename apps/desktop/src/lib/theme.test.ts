import { beforeEach, describe, expect, it } from 'vitest';
import { parseTheme, theme } from './theme.svelte';

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset['theme'];
});

describe('parseTheme', () => {
  it('accepts the two explicit themes', () => {
    expect(parseTheme('dark')).toBe('dark');
    expect(parseTheme('light')).toBe('light');
  });

  it('falls back to automatic for anything else', () => {
    expect(parseTheme(null)).toBe('auto');
    expect(parseTheme('auto')).toBe('auto');
    expect(parseTheme('sepia')).toBe('auto');
  });
});

describe('theme', () => {
  it('applies and saves an explicit choice', () => {
    theme.set('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(localStorage.getItem('percival.theme')).toBe('light');
    expect(theme.choice).toBe('light');
  });

  it('goes back to following Windows when set to automatic', () => {
    theme.set('dark');
    theme.set('auto');
    expect(document.documentElement.dataset['theme']).toBeUndefined();
    expect(theme.choice).toBe('auto');
  });

  it('restores the saved choice on startup', () => {
    localStorage.setItem('percival.theme', 'dark');
    theme.init();
    expect(theme.choice).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('starts automatic when nothing was saved', () => {
    theme.set('light');
    localStorage.clear();
    theme.init();
    expect(theme.choice).toBe('auto');
    expect(document.documentElement.dataset['theme']).toBeUndefined();
  });
});
