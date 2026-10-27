import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from './render';
import { media } from './setup';

describe('theme (design system §5)', () => {
  it('CT-THEME-01 follows the system setting by default', async () => {
    media.systemPrefersDark = true;
    await renderApp();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(screen.getByRole('button', { name: 'Switch to light mode' })).toBeInTheDocument();
  });

  it('CT-THEME-02 the top-bar toggle switches theme and remembers the choice', async () => {
    const { user, unmount } = await renderApp();
    expect(document.documentElement.dataset.theme).toBe('light');

    await user.click(screen.getByRole('button', { name: 'Switch to dark mode' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(window.localStorage.getItem('evm.theme')).toBe('dark');

    unmount();
    await renderApp();
    expect(document.documentElement.dataset.theme).toBe('dark'); // remembered
  });

  it('CT-THEME-03 Settings can return to the system setting', async () => {
    window.localStorage.setItem('evm.theme', 'dark');
    const { user } = await renderApp({ page: 'settings' });
    expect(document.documentElement.dataset.theme).toBe('dark');
    await user.click(screen.getByRole('radio', { name: /System/ }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(window.localStorage.getItem('evm.theme')).toBe('system');
  });

  it('CT-THEME-04 still works when localStorage throws', async () => {
    const { getItem, setItem } = Storage.prototype;
    const blocked = () => {
      throw new Error('blocked');
    };
    Storage.prototype.getItem = blocked;
    Storage.prototype.setItem = blocked;
    try {
      const { user } = await renderApp({ documents: [] });
      await user.click(screen.getByRole('button', { name: 'Switch to dark mode' }));
      expect(document.documentElement.dataset.theme).toBe('dark');
    } finally {
      Storage.prototype.getItem = getItem;
      Storage.prototype.setItem = setItem;
    }
  });
});
