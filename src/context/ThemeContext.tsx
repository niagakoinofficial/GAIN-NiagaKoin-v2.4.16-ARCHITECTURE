import React, { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode, type SetStateAction } from 'react';

type Theme = 'light' | 'dark';
type ThemePreference = Theme | 'system';

type ThemeContextType = {
  theme: Theme;
  themePreference: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
const THEME_STORAGE_KEY = 'gain_theme';

function getStoredTheme(): ThemePreference | null {
  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system' ? storedTheme : null;
  } catch {
    return null;
  }
}

function getSystemTheme(): Theme {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';

  const savedTheme = getStoredTheme();
  if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;

  const documentTheme = document.documentElement.dataset.theme;
  if (documentTheme === 'light' || documentTheme === 'dark') return documentTheme;

  return getSystemTheme();
}

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => getStoredTheme() ?? 'system');
  const updateTheme = (nextPreference: ThemePreference) => {
    setThemePreference(nextPreference);
    setTheme(nextPreference === 'system' ? getSystemTheme() : nextPreference);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextPreference);
    } catch {}
  };
  const toggleTheme = () => updateTheme(theme === 'light' ? 'dark' : 'light');

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.classList.toggle('dark', theme === 'dark');
    root.classList.toggle('light', theme === 'light');
    root.dataset.themeSource = themePreference === 'system' ? 'system' : 'user';
  }, [theme, themePreference]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) {
        const nextPreference: ThemePreference = event.newValue === 'light' || event.newValue === 'dark' || event.newValue === 'system'
          ? event.newValue
          : 'system';
        setThemePreference(nextPreference);
        setTheme(nextPreference === 'system' ? getSystemTheme() : nextPreference);
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
    const handleSystemThemeChange = (event: MediaQueryListEvent) => {
      if (themePreference === 'system') setTheme(event.matches ? 'light' : 'dark');
    };

    mediaQuery.addEventListener('change', handleSystemThemeChange);
    return () => mediaQuery.removeEventListener('change', handleSystemThemeChange);
  }, [themePreference]);

  return (
    <ThemeContext.Provider value={{ theme, themePreference, setTheme: updateTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
