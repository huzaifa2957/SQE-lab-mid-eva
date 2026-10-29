import { type ReactNode, useMemo, useRef } from 'react';
import { type ChartId, type ChartImages, ChartImagesContext } from './chartImages';

export function ChartImagesProvider({ children }: { children: ReactNode }) {
  const getters = useRef(new Map<ChartId, () => string | null>());

  const value = useMemo<ChartImages>(
    () => ({
      register(id, getImage) {
        getters.current.set(id, getImage);
        return () => {
          if (getters.current.get(id) === getImage) getters.current.delete(id);
        };
      },
      getImage: (id) => getters.current.get(id)?.() ?? null,
      getAll() {
        const all: Partial<Record<ChartId, string>> = {};
        for (const [id, get] of getters.current) {
          const image = get();
          if (image) all[id] = image;
        }
        return all;
      },
    }),
    [],
  );

  return <ChartImagesContext.Provider value={value}>{children}</ChartImagesContext.Provider>;
}
