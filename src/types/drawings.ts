export type DrawingToolType =
  | 'none'
  | 'horizontal'
  | 'trendline'
  | 'ray'
  | 'rectangle'
  | 'fibonacci'
  | 'pricemarker';

export interface ChartPoint {
  time: number; // Unix timestamp in seconds or candle index
  price: number;
}

export interface BaseDrawing {
  id: string;
  type: DrawingToolType;
  color: string;
  symbol: string;
  createdAt: number;
  source?: 'user' | 'agent';
  agentName?: string;
  confidence?: number;
  label?: string;
  sublabel?: string;
  isRealtime?: boolean;
  notes?: string;
}

export interface HorizontalLineDrawing extends BaseDrawing {
  type: 'horizontal';
  price: number;
  label?: string;
}

export interface TrendLineDrawing extends BaseDrawing {
  type: 'trendline';
  p1: ChartPoint;
  p2: ChartPoint;
}

export interface RayDrawing extends BaseDrawing {
  type: 'ray';
  p1: ChartPoint;
  p2: ChartPoint;
}

export interface RectangleDrawing extends BaseDrawing {
  type: 'rectangle';
  p1: ChartPoint;
  p2: ChartPoint;
}

export interface FibonacciDrawing extends BaseDrawing {
  type: 'fibonacci';
  p1: ChartPoint;
  p2: ChartPoint;
}

export interface PriceMarkerDrawing extends BaseDrawing {
  type: 'pricemarker';
  price: number;
  time: number;
  label: string;
}

export type ChartDrawing =
  | HorizontalLineDrawing
  | TrendLineDrawing
  | RayDrawing
  | RectangleDrawing
  | FibonacciDrawing
  | PriceMarkerDrawing;
