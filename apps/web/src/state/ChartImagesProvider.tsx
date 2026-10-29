import { type ReactNode, useMemo } from 'react';
import { ChartImagesContext, createChartRegistry } from './chartImages';

export function ChartImagesProvider({ children }: { children: ReactNode }) {
  const value = useMemo(createChartRegistry, []);
  return <ChartImagesContext.Provider value={value}>{children}</ChartImagesContext.Provider>;
}
