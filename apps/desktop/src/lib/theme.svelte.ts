const THEME_KEY = 'percival.theme';

/** `auto` follows the Windows theme. */
export type ThemeChoice = 'auto' | 'dark' | 'light';

export const THEME_OPTIONS: { value: ThemeChoice; label: string; hint: string }[] = [
  { value: 'dark', label: 'Sombre', hint: 'fond sombre' },
  { value: 'light', label: 'Clair', hint: 'fond clair' },
  { value: 'auto', label: 'Automatique', hint: 'suit le thème de Windows' },
];

/** Anything unknown (nothing saved yet, or a value from another version) means automatic. */
export function parseTheme(value: string | null): ThemeChoice {
  return value === 'dark' || value === 'light' ? value : 'auto';
}

function readChoice(): ThemeChoice {
  try {
    return parseTheme(localStorage.getItem(THEME_KEY));
  } catch {
    return 'auto';
  }
}

class Theme {
  choice = $state<ThemeChoice>('auto');

  /** Applies the saved choice. Called before the app is mounted, so there is no flash. */
  init(): void {
    this.choice = readChoice();
    this.#apply();
  }

  set(choice: ThemeChoice): void {
    this.choice = choice;
    this.#apply();
    try {
      localStorage.setItem(THEME_KEY, choice);
    } catch {
      // Not critical: the choice only lasts for this session.
    }
  }

  #apply(): void {
    const root = document.documentElement;
    if (this.choice === 'auto') {
      delete root.dataset['theme'];
    } else {
      root.dataset['theme'] = this.choice;
    }
  }
}

export const theme = new Theme();
