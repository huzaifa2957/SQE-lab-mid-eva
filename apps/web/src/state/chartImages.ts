// Registry of rendered charts so their PNG images can be collected for the PDF report (Phase 6).

import { createContext, type RefObject, useContext, useEffect } from 'react';

export type ChartId = 's-curve' | 'cost-by-task' | 'cpi-spi-trend' | 'variance-by-category';

export interface ChartImageSource {
  toBase64Image: (type?: string, quality?: unknown) => string;
}

export interface ChartImages {
  register: (id: ChartId, getImage: () => string | null) => () => void;
  /** PNG data URL of a chart that is currently rendered, or null. */
  getImage: (id: ChartId) => string | null;
  /** PNG data URLs of every rendered chart. */
  getAll: () => Partial<Record<ChartId, string>>;
}

export const ChartImagesContext = createContext<ChartImages | null>(null);

export function useChartImages(): ChartImages {
  const value = useContext(ChartImagesContext);
  if (!value) throw new Error('useChartImages must be used inside <ChartImagesProvider>');
  return value;
}

/** Registers a chart instance (from a react-chartjs-2 ref) under `id` while it is mounted. */
export function useRegisterChart(id: ChartId, ref: RefObject<ChartImageSource | null>): void {
  const images = useContext(ChartImagesContext);
  useEffect(() => {
    if (!images) return;
    return images.register(id, () => {
      try {
        return ref.current?.toBase64Image('image/png', 1) ?? null;
      } catch {
        return null;
      }
    });
  }, [images, id, ref]);
}
