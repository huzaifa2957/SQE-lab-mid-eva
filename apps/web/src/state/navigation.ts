import { useCallback, useEffect, useState } from 'react';

export const PAGES = ['projects', 'data', 'dashboard', 'insights', 'report', 'settings'] as const;
export type PageId = (typeof PAGES)[number];
export type PageParams = Readonly<Record<string, string>>;
export type Navigate = (page: PageId, params?: PageParams) => void;

interface Route {
  page: PageId;
  params: PageParams;
}

function routeFromHash(): Route {
  const [path = '', query = ''] = window.location.hash.replace(/^#\/?/, '').split('?');
  const page = (PAGES as readonly string[]).includes(path) ? (path as PageId) : 'projects';
  return { page, params: Object.fromEntries(new URLSearchParams(query)) };
}

function hashFor(page: PageId, params: PageParams = {}): string {
  const query = new URLSearchParams(params).toString();
  return `/${page}${query ? `?${query}` : ''}`;
}

/** Tiny hash router: #/data, #/dashboard?task=1.3 … (works on static hosting and in Electron). */
export function useHashRoute(): [PageId, Navigate, PageParams] {
  const [route, setRoute] = useState<Route>(routeFromHash);

  useEffect(() => {
    const onChange = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback<Navigate>((page, params = {}) => {
    const hash = hashFor(page, params);
    if (window.location.hash.replace(/^#/, '') !== hash) window.location.hash = hash;
    setRoute({ page, params });
  }, []);

  return [route.page, navigate, route.params];
}
