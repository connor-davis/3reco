import { Moon, Sun } from 'lucide-react';
import { IconButton } from '@/components/icon-button';
import { useTheme } from '@/components/providers/theme';

/** Flips light and dark. Shown in the top bar, the Preview control and auth pages. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const dark =
    theme === 'dark' ||
    (theme === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  return (
    <IconButton
      label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
    >
      {dark ? <Sun /> : <Moon />}
    </IconButton>
  );
}
