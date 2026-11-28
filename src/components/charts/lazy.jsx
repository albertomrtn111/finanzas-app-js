'use client';

// Islas de gráficos con carga diferida (Tarea NF-20). Recharts solo se descarga en las páginas que
// pintan un gráfico y después de que la página ya se ve con sus cifras; mientras, un hueco del mismo alto.
// Los Server Components importan estos envoltorios, nunca recharts directamente.
import dynamic from 'next/dynamic';
import ChartPlaceholder from './ChartPlaceholder';

export const LazySavingsChart = dynamic(() => import('./SavingsChart'), { ssr: false, loading: ChartPlaceholder });
export const LazyDonutChart = dynamic(() => import('./DonutChart'), { ssr: false, loading: ChartPlaceholder });
export const LazyEvolutionChart = dynamic(() => import('./EvolutionChart'), { ssr: false, loading: ChartPlaceholder });
