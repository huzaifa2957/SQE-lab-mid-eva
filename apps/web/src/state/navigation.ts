import { useCallback, useEffect, useState } from 'react';

export const PAGES = ['projects', 'data', 'dashboard', 'insights', 'report', 'settings'] as const;
export type PageId = (typeof PAGES)[number];

function pageFromHash(): PageId {
  const name = window.location.hash.replace(/^#\/?/, '');
  return (PAGES as readonly string[]).includes(name) ? (name as PageId) : 'projects';
}

/** Tiny hash router: #/data, #/projects … (works on static hosting and in Electron). */
export function useHashPage(): [PageId, (page: PageId) => void] {
  const [page, setPage] = useState<PageId>(pageFromHash);

  useEffect(() => {
    const onChange = () => setPage(pageFromHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((next: PageId) => {
    if (pageFromHash() !== next) window.location.hash = `/${next}`;
    setPage(next);
  }, []);

  return [page, navigate];
}
