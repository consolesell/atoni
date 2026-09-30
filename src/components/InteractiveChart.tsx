import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Candle, TechnicalIndicators, TradeRecord, AIPredictionResult, DecisionResult, MarketRegime, TradingAgent } from '../types/trading';
import {
  Maximize2,
  Minimize2,
  RefreshCw,
  Eye,
  EyeOff,
  Sparkles,
  SlidersHorizontal,
  PenTool,
  Trash2,
  ArrowLeft,
  ChevronDown,
  TrendingUp,
  TrendingDown,
  Minus,
  Plus,
  Zap,
  Target,
  Bot,
  Crosshair,
} from 'lucide-react';
import { ChartDrawing, DrawingToolType, ChartPoint } from '../types/drawings';
import { loadChartDrawings, saveChartDrawings, FIBONACCI_LEVELS } from '../lib/chartDrawings';
import { sound } from '../lib/soundEngine';
import { generateAgentChartDrawings } from '../lib/agentChartTools';
import { AgentChartToolsConfig, DEFAULT_AGENT_CHART_CONFIG, SniperConfluenceResult } from '../types/sniper';

interface InteractiveChartProps {
  candles: Candle[];
  indicators: TechnicalIndicators | null;
  currentPrice: number;
  openTrades: TradeRecord[];
  closedTrades?: TradeRecord[];
  granularity: number;
  onGranularityChange: (g: number) => void;
  onRefresh: () => void;
  decimals?: number;
  symbol?: string;
  aiPrediction?: AIPredictionResult | null;
  onExecuteTrade?: (direction: 'CALL' | 'PUT') => void;
  stake?: number;
  onStakeChange?: (s: number) => void;
  isExecuting?: boolean;
  currency?: string;
  algorithmicDecision?: DecisionResult | null;
  regime?: MarketRegime;
  agents?: TradingAgent[];
  sniperSetup?: SniperConfluenceResult | null;
}

export const InteractiveChart: React.FC<InteractiveChartProps> = ({
  candles,
  indicators,
  currentPrice,
  openTrades,
  closedTrades = [],
  granularity,
  onGranularityChange,
  onRefresh,
  decimals = 3,
  symbol = 'Volatility 10',
  aiPrediction,
  onExecuteTrade,
  stake = 5,
  onStakeChange,
  isExecuting = false,
  currency = 'USD',
  algorithmicDecision,
  regime,
  agents,
  sniperSetup,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dimsRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

  // View & Indicator states
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showBB, setShowBB] = useState(true);
  const [showMAs, setShowMAs] = useState(true);
  const [showRSI, setShowRSI] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showAISignals, setShowAISignals] = useState(true);
  const [candleWidth, setCandleWidth] = useState(9);
  const [panOffset, setPanOffset] = useState(0); // number of candles panned backwards
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [inspectedCandle, setInspectedCandle] = useState<Candle | null>(null);

  // Menus & Toolbar popovers
  const [isIndicatorsOpen, setIsIndicatorsOpen] = useState(false);
  const [isDrawMenuOpen, setIsDrawMenuOpen] = useState(false);
  const [isAgentToolsMenuOpen, setIsAgentToolsMenuOpen] = useState(false);
  const [agentToolsConfig, setAgentToolsConfig] = useState<AgentChartToolsConfig>(DEFAULT_AGENT_CHART_CONFIG);
  const [showSniperOverlay, setShowSniperOverlay] = useState(true);
  const [activeDrawTool, setActiveDrawTool] = useState<DrawingToolType>('none');
  const [drawings, setDrawings] = useState<ChartDrawing[]>(() => loadChartDrawings(symbol));
  const [pendingDrawingStart, setPendingDrawingStart] = useState<ChartPoint | null>(null);

  // Compute live agent drawings in real-time
  const agentDrawings = useMemo(() => {
    return generateAgentChartDrawings(
      symbol,
      candles,
      indicators,
      regime || { type: 'NEUTRAL', confidence: 0.6 },
      algorithmicDecision || null,
      sniperSetup || null,
      agentToolsConfig
    );
  }, [symbol, candles, indicators, regime, algorithmicDecision, sniperSetup, agentToolsConfig]);

  const handleSaveAgentDrawingsToUser = () => {
    if (agentDrawings.length === 0) return;
    const userConverted: ChartDrawing[] = agentDrawings.map((ad) => ({
      ...ad,
      id: `user_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      source: 'user',
    }));
    handleSaveDrawings([...drawings, ...userConverted]);
    setIsAgentToolsMenuOpen(false);
    sound.play('trade');
  };

  // Timeframes in seconds
  const timeframes = [
    { label: '1m', value: 60 },
    { label: '2m', value: 120 },
    { label: '5m', value: 300 },
    { label: '15m', value: 900 },
    { label: '30m', value: 1800 },
    { label: '1h', value: 3600 },
  ];

  // Touch gesture tracker refs
  const touchStateRef = useRef<{
    startDist: number;
    startWidth: number;
    startX: number;
    startPan: number;
    lastTapTime: number;
    longPressTimer: NodeJS.Timeout | null;
  }>({
    startDist: 0,
    startWidth: 9,
    startX: 0,
    startPan: 0,
    lastTapTime: 0,
    longPressTimer: null,
  });

  // Reload drawings when symbol changes
  useEffect(() => {
    setDrawings(loadChartDrawings(symbol));
    setPanOffset(0);
  }, [symbol]);

  // Handle Fullscreen body scroll lock
  useEffect(() => {
    if (isFullscreen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isFullscreen]);

  // Save drawings helper
  const handleSaveDrawings = (newDrawings: ChartDrawing[]) => {
    setDrawings(newDrawings);
    saveChartDrawings(symbol, newDrawings);
  };

  const handleClearDrawings = () => {
    handleSaveDrawings([]);
    setActiveDrawTool('none');
    setPendingDrawingStart(null);
    sound.play('click');
  };

  // Convert canvas Y to Price
  const getPriceFromY = useCallback(
    (
      y: number,
      minPrice: number,
      priceRange: number,
      paddingTop: number,
      chartHeight: number
    ) => {
      return minPrice + ((paddingTop + chartHeight - y) / chartHeight) * priceRange;
    },
    []
  );

  // Core Drawing Function for High-DPI Canvas
  const drawChart = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = container.getBoundingClientRect();
    const cssWidth = Math.max(280, Math.floor(rect.width || 320));
    const cssHeight = isFullscreen
      ? Math.floor(window.innerHeight - (onExecuteTrade ? 130 : 54))
      : Math.max(340, Math.floor(rect.height || 380));

    const dpr = window.devicePixelRatio || 1;
    const targetWidth = Math.floor(cssWidth * dpr);
    const targetHeight = Math.floor(cssHeight * dpr);

    // Only update canvas backing buffer if dimensions changed to prevent screen blanking
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    const width = cssWidth;
    const height = cssHeight;

    // Responsive padding
    const isSmall = width < 480;
    const padding = {
      top: 24,
      right: isSmall ? 58 : 72,
      bottom: showRSI ? (isSmall ? 70 : 85) : 28,
      left: isSmall ? 8 : 14,
    };

    const chartHeight = height - padding.top - padding.bottom;
    const chartWidth = width - padding.left - padding.right;

    // Canvas background
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, width, height);

    if (!candles || candles.length === 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = '11px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Synchronizing live ticks & candles...', width / 2, height / 2);
      ctx.textAlign = 'start';
      ctx.restore();
      return;
    }

    // Visible slice of candles with panOffset
    const candleSpacing = Math.max(2, Math.floor(candleWidth * 0.3));
    const totalUnit = candleWidth + candleSpacing;
    const maxVisibleCount = Math.floor(chartWidth / totalUnit);

    const clampedPan = Math.max(0, Math.min(candles.length - 10, panOffset));
    const endIndex = candles.length - clampedPan;
    const startIndex = Math.max(0, endIndex - maxVisibleCount);
    const visibleCandles = candles.slice(startIndex, endIndex);

    if (visibleCandles.length === 0) return;

    // Price Bounds
    const anchorPrice =
      currentPrice > 0 ? currentPrice : visibleCandles[visibleCandles.length - 1]?.close || 1000;
    const validCandles = visibleCandles.filter(
      (c) => Math.abs(c.close - anchorPrice) / anchorPrice < 0.45
    );
    const boundsCandles = validCandles.length >= 3 ? validCandles : visibleCandles;

    let minPrice = Infinity;
    let maxPrice = -Infinity;

    boundsCandles.forEach((c) => {
      minPrice = Math.min(minPrice, c.low);
      maxPrice = Math.max(maxPrice, c.high);
    });

    if (currentPrice > 0) {
      minPrice = Math.min(minPrice, currentPrice);
      maxPrice = Math.max(maxPrice, currentPrice);
    }

    if (showBB && indicators?.bb) {
      indicators.bb.slice(startIndex, endIndex).forEach((b) => {
        if (b.lower && Math.abs(b.lower - anchorPrice) / anchorPrice < 0.35) {
          minPrice = Math.min(minPrice, b.lower);
        }
        if (b.upper && Math.abs(b.upper - anchorPrice) / anchorPrice < 0.35) {
          maxPrice = Math.max(maxPrice, b.upper);
        }
      });
    }

    if (showMarkers) {
      openTrades.forEach((t) => {
        if (t.entryPrice > 0 && Math.abs(t.entryPrice - anchorPrice) / anchorPrice < 0.45) {
          minPrice = Math.min(minPrice, t.entryPrice);
          maxPrice = Math.max(maxPrice, t.entryPrice);
        }
      });
      (closedTrades || []).slice(0, 10).forEach((t) => {
        if (t.entryPrice > 0 && Math.abs(t.entryPrice - anchorPrice) / anchorPrice < 0.45) {
          minPrice = Math.min(minPrice, t.entryPrice);
          maxPrice = Math.max(maxPrice, t.entryPrice);
        }
        if (t.exitPrice && Math.abs(t.exitPrice - anchorPrice) / anchorPrice < 0.45) {
          minPrice = Math.min(minPrice, t.exitPrice);
          maxPrice = Math.max(maxPrice, t.exitPrice);
        }
      });
    }

    // Safety fallback
    if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice) || minPrice >= maxPrice) {
      minPrice = anchorPrice * 0.99;
      maxPrice = anchorPrice * 1.01;
    }

    const pricePadding = (maxPrice - minPrice) * 0.08 || 0.05;
    minPrice -= pricePadding;
    maxPrice += pricePadding;
    const priceRange = maxPrice - minPrice || 1;

    const priceToY = (price: number) => {
      return padding.top + chartHeight - ((price - minPrice) / priceRange) * chartHeight;
    };

    // Horizontal Price Grid & Labels
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    ctx.font = `${isSmall ? '9px' : '11px'} JetBrains Mono, monospace`;
    ctx.fillStyle = '#64748b';

    const gridSteps = isSmall ? 4 : 6;
    for (let i = 0; i <= gridSteps; i++) {
      const p = minPrice + (priceRange * i) / gridSteps;
      const y = priceToY(p);

      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartWidth, y);
      ctx.stroke();

      ctx.fillText(p.toFixed(decimals), width - padding.right + 6, y + 4);
    }

    // Vertical Time Grid
    const timeSteps = isSmall ? 4 : 6;
    for (let i = 0; i <= timeSteps; i++) {
      const x = padding.left + (chartWidth * i) / timeSteps;
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, padding.top + chartHeight);
      ctx.stroke();
    }

    // Draw Bollinger Bands Envelope
    if (showBB && indicators?.bb) {
      const bbSlice = indicators.bb.slice(startIndex, endIndex);

      ctx.beginPath();
      let started = false;
      for (let i = 0; i < visibleCandles.length; i++) {
        const b = bbSlice[i];
        if (b && b.upper !== null) {
          const x = padding.left + i * totalUnit + candleWidth / 2;
          const y = priceToY(b.upper);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      }

      for (let i = visibleCandles.length - 1; i >= 0; i--) {
        const b = bbSlice[i];
        if (b && b.lower !== null) {
          const x = padding.left + i * totalUnit + candleWidth / 2;
          const y = priceToY(b.lower);
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(14, 165, 233, 0.05)';
      ctx.fill();

      // Upper / Lower lines
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      let upperStarted = false;
      for (let i = 0; i < visibleCandles.length; i++) {
        const b = bbSlice[i];
        if (b && b.upper !== null) {
          const x = padding.left + i * totalUnit + candleWidth / 2;
          const y = priceToY(b.upper);
          if (!upperStarted) {
            ctx.moveTo(x, y);
            upperStarted = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      }
      ctx.stroke();

      ctx.beginPath();
      let lowerStarted = false;
      for (let i = 0; i < visibleCandles.length; i++) {
        const b = bbSlice[i];
        if (b && b.lower !== null) {
          const x = padding.left + i * totalUnit + candleWidth / 2;
          const y = priceToY(b.lower);
          if (!lowerStarted) {
            ctx.moveTo(x, y);
            lowerStarted = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      }
      ctx.stroke();
    }

    // Moving Averages (MA14 & MA50)
    if (showMAs && indicators) {
      if (indicators.ma14) {
        const ma14Slice = indicators.ma14.slice(startIndex, endIndex);
        ctx.strokeStyle = '#f59e0b'; // Amber MA14
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let m14Started = false;
        ma14Slice.forEach((val, idx) => {
          if (val !== null && Math.abs(val - anchorPrice) / anchorPrice < 0.35) {
            const x = padding.left + idx * totalUnit + candleWidth / 2;
            const y = priceToY(val);
            if (!m14Started) {
              ctx.moveTo(x, y);
              m14Started = true;
            } else {
              ctx.lineTo(x, y);
            }
          }
        });
        ctx.stroke();
      }

      if (indicators.ma50) {
        const ma50Slice = indicators.ma50.slice(startIndex, endIndex);
        ctx.strokeStyle = '#a855f7'; // Purple MA50
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let m50Started = false;
        ma50Slice.forEach((val, idx) => {
          if (val !== null && Math.abs(val - anchorPrice) / anchorPrice < 0.35) {
            const x = padding.left + idx * totalUnit + candleWidth / 2;
            const y = priceToY(val);
            if (!m50Started) {
              ctx.moveTo(x, y);
              m50Started = true;
            } else {
              ctx.lineTo(x, y);
            }
          }
        });
        ctx.stroke();
      }
    }

    // Render Candlesticks
    visibleCandles.forEach((c, idx) => {
      const isUp = c.close >= c.open;
      const xCenter = padding.left + idx * totalUnit + candleWidth / 2;
      const xLeft = padding.left + idx * totalUnit;

      const yHigh = priceToY(c.high);
      const yLow = priceToY(c.low);
      const yOpen = priceToY(c.open);
      const yClose = priceToY(c.close);

      const color = isUp ? '#10b981' : '#f43f5e';
      ctx.strokeStyle = color;
      ctx.fillStyle = color;

      // Candle Wick
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(xCenter, yHigh);
      ctx.lineTo(xCenter, yLow);
      ctx.stroke();

      // Candle Body
      const bodyTop = Math.min(yOpen, yClose);
      const bodyHeight = Math.max(1.5, Math.abs(yOpen - yClose));

      ctx.fillRect(xLeft, bodyTop, candleWidth, bodyHeight);
    });

    // Spot Price Highlight Ray
    if (currentPrice > 0) {
      const ySpot = priceToY(currentPrice);
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(padding.left, ySpot);
      ctx.lineTo(padding.left + chartWidth, ySpot);
      ctx.stroke();
      ctx.setLineDash([]);

      // Spot Price Badge on Right Axis
      ctx.fillStyle = '#06b6d4';
      ctx.fillRect(width - padding.right + 2, ySpot - 9, isSmall ? 54 : 68, 18);
      ctx.fillStyle = '#020617';
      ctx.font = `bold ${isSmall ? '10px' : '11px'} JetBrains Mono, monospace`;
      ctx.fillText(currentPrice.toFixed(decimals), width - padding.right + 5, ySpot + 4);
    }

    // =========================================================================
    // HIGH-PRECISION TRADE ENTRY & EXIT VISUAL MARKERS (OPEN & CLOSED TRADES)
    // =========================================================================
    interface TradeHitZone {
      x: number;
      y: number;
      radius: number;
      trade: TradeRecord;
      label: string;
      pointType: 'ENTRY' | 'EXIT' | 'PATH';
    }
    const tradeHitZones: TradeHitZone[] = [];

    // Helper to map timestamp epoch to accurate pixel X coordinate (including candle interpolation)
    const epochToX = (epoch: number): number | null => {
      if (!visibleCandles || visibleCandles.length === 0) return null;
      const first = visibleCandles[0];
      const last = visibleCandles[visibleCandles.length - 1];
      const firstEpoch = first.epoch;
      const lastEpoch = last.epoch + granularity;

      // Search through visible candles
      for (let i = 0; i < visibleCandles.length; i++) {
        const c = visibleCandles[i];
        const nextEpoch = i < visibleCandles.length - 1 ? visibleCandles[i + 1].epoch : c.epoch + granularity;
        if (epoch >= c.epoch && epoch < nextEpoch) {
          const frac = (epoch - c.epoch) / Math.max(1, nextEpoch - c.epoch);
          return padding.left + i * totalUnit + candleWidth / 2 + frac * totalUnit;
        }
      }

      // If prior to first visible candle
      if (epoch < firstEpoch) {
        const candlesBack = (firstEpoch - epoch) / granularity;
        return padding.left - candlesBack * totalUnit;
      }

      // If forward in time (e.g. expiration horizon projection)
      if (epoch >= lastEpoch) {
        const candlesFwd = (epoch - lastEpoch) / granularity;
        return padding.left + (visibleCandles.length - 1) * totalUnit + candleWidth / 2 + candlesFwd * totalUnit;
      }

      return null;
    };

    if (showMarkers) {
      // -----------------------------------------------------------------------
      // 1. OPEN POSITIONS (ACTIVE CONTRACTS: ENTRY MARKER, RAY, & EXPIRY LINE)
      // -----------------------------------------------------------------------
      openTrades.forEach((trade) => {
        const isCall = trade.decision.includes('BUY') || trade.decision.includes('CALL');
        const color = isCall ? '#10b981' : '#f43f5e';
        const yEntry = priceToY(trade.entryPrice);
        const tradeEpoch = Math.floor(new Date(trade.timestamp).getTime() / 1000);
        const xEntry = epochToX(tradeEpoch);

        // A. Full Horizontal Entry Reference Ray
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.6;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(padding.left, yEntry);
        ctx.lineTo(padding.left + chartWidth, yEntry);
        ctx.stroke();
        ctx.setLineDash([]);

        // B. Left Entry Tag Banner
        const leftTagW = isSmall ? 82 : 96;
        ctx.fillStyle = isCall ? 'rgba(16, 185, 129, 0.95)' : 'rgba(244, 63, 94, 0.95)';
        ctx.beginPath();
        ctx.roundRect
          ? ctx.roundRect(padding.left + 4, yEntry - 10, leftTagW, 20, 4)
          : ctx.rect(padding.left + 4, yEntry - 10, leftTagW, 20);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.8;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px JetBrains Mono, monospace';
        ctx.fillText(
          `${isCall ? '▲ CALL' : '▼ PUT'} $${trade.amount.toFixed(0)}`,
          padding.left + 8,
          yEntry + 4
        );

        // C. Trailing Stop-Loss Dynamic Ratchet Line
        if (trade.trailingStopEnabled && trade.currentTrailingStopPrice) {
          const yTSL = priceToY(trade.currentTrailingStopPrice);
          if (yTSL >= padding.top && yTSL <= padding.top + chartHeight) {
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 1.6;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(padding.left, yTSL);
            ctx.lineTo(padding.left + chartWidth, yTSL);
            ctx.stroke();
            ctx.setLineDash([]);

            // TSL Tag Banner
            const tslTagW = isSmall ? 82 : 100;
            ctx.fillStyle = 'rgba(245, 158, 11, 0.95)';
            ctx.beginPath();
            ctx.roundRect
              ? ctx.roundRect(padding.left + 4, yTSL - 9, tslTagW, 18, 4)
              : ctx.rect(padding.left + 4, yTSL - 9, tslTagW, 18);
            ctx.fill();

            ctx.fillStyle = '#0f172a';
            ctx.font = 'bold 8.5px JetBrains Mono, monospace';
            const lockedTxt = trade.lockedInProfit && trade.lockedInProfit > 0 ? ` +$${trade.lockedInProfit.toFixed(1)}` : '';
            ctx.fillText(
              `🛡️ TSL ${trade.currentTrailingStopPrice.toFixed(decimals >= 3 ? 2 : decimals)}${lockedTxt}`,
              padding.left + 7,
              yTSL + 4
            );
          }
        }

        // D. Right-Axis Live ITM / OTM Unrealized PnL Tag
        const isITM = isCall ? currentPrice > trade.entryPrice : currentPrice < trade.entryPrice;
        const livePnl = isITM ? trade.amount * 0.95 : -trade.amount;
        const pnlText = `${isITM ? '▲ ITM +' : '▼ OTM -'}$${Math.abs(livePnl).toFixed(2)}`;

        ctx.fillStyle = isITM ? '#059669' : '#dc2626';
        ctx.fillRect(width - padding.right + 2, yEntry - 9, isSmall ? 58 : 72, 18);
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${isSmall ? '8px' : '9px'} JetBrains Mono, monospace`;
        ctx.fillText(pnlText, width - padding.right + 4, yEntry + 4);

        // D. Projected Expiry Timeline Target & Shaded Lifespan Corridor
        const durationSec = Math.max(30, (trade.duration || 1) * 60);
        const expiryEpoch = tradeEpoch + durationSec;
        const xExpiry = epochToX(expiryEpoch);

        if (xEntry !== null && xExpiry !== null) {
          const startX = Math.max(padding.left, Math.min(padding.left + chartWidth, xEntry));
          const endX = Math.max(padding.left, Math.min(padding.left + chartWidth, xExpiry));

          if (endX > startX) {
            ctx.fillStyle = isCall ? 'rgba(16, 185, 129, 0.06)' : 'rgba(244, 63, 94, 0.06)';
            ctx.fillRect(startX, padding.top, endX - startX, chartHeight);
          }

          // Expiry Target Vertical Marker Line
          if (xExpiry >= padding.left && xExpiry <= padding.left + chartWidth) {
            ctx.strokeStyle = 'rgba(248, 250, 252, 0.5)';
            ctx.lineWidth = 1.2;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(xExpiry, padding.top);
            ctx.lineTo(xExpiry, padding.top + chartHeight);
            ctx.stroke();
            ctx.setLineDash([]);

            // Expiry Flag Tag
            const nowSec = Math.floor(Date.now() / 1000);
            const remainingSec = Math.max(0, expiryEpoch - nowSec);
            const expLabel = remainingSec > 0 ? `EXPIRY ${remainingSec}s` : 'EXPIRY';
            ctx.fillStyle = 'rgba(30, 41, 59, 0.92)';
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.8)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect
              ? ctx.roundRect(xExpiry - 34, padding.top + 6, 68, 17, 4)
              : ctx.rect(xExpiry - 34, padding.top + 6, 68, 17);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#38bdf8';
            ctx.font = 'bold 8px JetBrains Mono, monospace';
            ctx.fillText(expLabel, xExpiry - 30, padding.top + 18);
          }
        }

        // E. Spot Entry Node on Candlestick Canvas
        if (xEntry !== null && xEntry >= padding.left - 10 && xEntry <= padding.left + chartWidth + 10) {
          const clampedX = Math.max(padding.left, Math.min(padding.left + chartWidth, xEntry));

          // Vertical anchor stem
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.2;
          ctx.setLineDash([2, 2]);
          ctx.beginPath();
          ctx.moveTo(clampedX, yEntry - 18);
          ctx.lineTo(clampedX, yEntry + 18);
          ctx.stroke();
          ctx.setLineDash([]);

          // Animated pulsating halo ring
          const pulse = (Math.sin(Date.now() / 250) + 1) / 2; // 0..1
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(clampedX, yEntry, 6 + pulse * 4, 0, Math.PI * 2);
          ctx.stroke();

          // Central solid node
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(clampedX, yEntry, 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.2;
          ctx.stroke();

          // Directional Triangle Icon (▲ CALL / ▼ PUT)
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          if (isCall) {
            ctx.moveTo(clampedX, yEntry - 2.5);
            ctx.lineTo(clampedX - 2.5, yEntry + 2);
            ctx.lineTo(clampedX + 2.5, yEntry + 2);
          } else {
            ctx.moveTo(clampedX, yEntry + 2.5);
            ctx.lineTo(clampedX - 2.5, yEntry - 2);
            ctx.lineTo(clampedX + 2.5, yEntry - 2);
          }
          ctx.closePath();
          ctx.fill();

          // Floating ENTRY Node Label
          const entryBadgeW = 56;
          ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.roundRect
            ? ctx.roundRect(clampedX - entryBadgeW / 2, yEntry - 28, entryBadgeW, 16, 4)
            : ctx.rect(clampedX - entryBadgeW / 2, yEntry - 28, entryBadgeW, 16);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#f8fafc';
          ctx.font = 'bold 8px JetBrains Mono, monospace';
          ctx.fillText(`ENTRY`, clampedX - 13, yEntry - 17);

          tradeHitZones.push({
            x: clampedX,
            y: yEntry,
            radius: 18,
            trade,
            label: 'ENTRY',
            pointType: 'ENTRY',
          });
        }
      });

      // -----------------------------------------------------------------------
      // 2. CLOSED TRADES (SETTLED ENTRY & EXIT MARKERS + TRAJECTORY VECTOR)
      // -----------------------------------------------------------------------
      if (closedTrades && closedTrades.length > 0) {
        const symbolClosed = closedTrades
          .filter((t) => !t.symbol || t.symbol === symbol)
          .slice(0, 16);

        symbolClosed.forEach((trade) => {
          const isWin = trade.result === 'WIN' || trade.profit > 0;
          const isCall = trade.decision.includes('BUY') || trade.decision.includes('CALL');
          const color = isWin ? '#10b981' : '#f43f5e';
          const tradeEpoch = Math.floor(new Date(trade.timestamp).getTime() / 1000);
          const exitEpoch = trade.holdMs
            ? tradeEpoch + Math.floor(trade.holdMs / 1000)
            : tradeEpoch + Math.max(30, (trade.duration || 1) * 60);

          const xEntry = epochToX(tradeEpoch);
          const yEntry = priceToY(trade.entryPrice);
          const exitPrice = trade.exitPrice ?? trade.entryPrice;
          const xExit = epochToX(exitEpoch);
          const yExit = priceToY(exitPrice);

          const firstEpoch = visibleCandles[0].epoch;
          const lastEpoch = visibleCandles[visibleCandles.length - 1].epoch + granularity;

          // Render if either entry or exit intersects the visible timeframe
          if (exitEpoch >= firstEpoch - granularity * 3 && tradeEpoch <= lastEpoch + granularity * 3) {
            const clampedEntryX = Math.max(
              padding.left,
              Math.min(padding.left + chartWidth, xEntry ?? padding.left)
            );
            const clampedExitX = Math.max(
              padding.left,
              Math.min(padding.left + chartWidth, xExit ?? (padding.left + chartWidth))
            );

            // A. Connecting Trajectory Line & Excursion Area
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(clampedEntryX, yEntry);
            ctx.lineTo(clampedExitX, yExit);
            ctx.lineTo(clampedExitX, yEntry);
            ctx.closePath();
            ctx.fillStyle = isWin ? 'rgba(16, 185, 129, 0.07)' : 'rgba(244, 63, 94, 0.07)';
            ctx.fill();
            ctx.restore();

            ctx.strokeStyle = color;
            ctx.lineWidth = 1.8;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(clampedEntryX, yEntry);
            ctx.lineTo(clampedExitX, yExit);
            ctx.stroke();
            ctx.setLineDash([]);

            // B. Visual ENTRY Point Marker (Origin)
            if (xEntry !== null && xEntry >= padding.left - 5 && xEntry <= padding.left + chartWidth + 5) {
              // Vertical anchor stem
              ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
              ctx.lineWidth = 1;
              ctx.setLineDash([2, 2]);
              ctx.beginPath();
              ctx.moveTo(clampedEntryX, yEntry - 10);
              ctx.lineTo(clampedEntryX, yEntry + 10);
              ctx.stroke();
              ctx.setLineDash([]);

              // Concentric entry circle
              ctx.fillStyle = '#0f172a';
              ctx.beginPath();
              ctx.arc(clampedEntryX, yEntry, 5, 0, Math.PI * 2);
              ctx.fill();

              ctx.strokeStyle = '#38bdf8';
              ctx.lineWidth = 1.8;
              ctx.beginPath();
              ctx.arc(clampedEntryX, yEntry, 4.5, 0, Math.PI * 2);
              ctx.stroke();

              ctx.fillStyle = '#38bdf8';
              ctx.beginPath();
              ctx.arc(clampedEntryX, yEntry, 2.5, 0, Math.PI * 2);
              ctx.fill();

              // Entry price micro-tag
              ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
              ctx.strokeStyle = '#38bdf8';
              ctx.lineWidth = 0.8;
              ctx.beginPath();
              ctx.roundRect
                ? ctx.roundRect(clampedEntryX - 22, yEntry + 8, 44, 13, 3)
                : ctx.rect(clampedEntryX - 22, yEntry + 8, 44, 13);
              ctx.fill();
              ctx.stroke();

              ctx.fillStyle = '#94a3b8';
              ctx.font = 'bold 7px JetBrains Mono, monospace';
              ctx.fillText(`IN @ ${trade.entryPrice.toFixed(1)}`, clampedEntryX - 19, yEntry + 17);

              tradeHitZones.push({
                x: clampedEntryX,
                y: yEntry,
                radius: 14,
                trade,
                label: 'ENTRY POINT',
                pointType: 'ENTRY',
              });
            }

            // C. Visual EXIT Point Marker (Settlement)
            if (xExit !== null && xExit >= padding.left - 5 && xExit <= padding.left + chartWidth + 5) {
              // Vertical anchor stem
              ctx.strokeStyle = color;
              ctx.lineWidth = 1;
              ctx.setLineDash([2, 2]);
              ctx.beginPath();
              ctx.moveTo(clampedExitX, yExit - 12);
              ctx.lineTo(clampedExitX, yExit + 12);
              ctx.stroke();
              ctx.setLineDash([]);

              // Outer exit node
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(clampedExitX, yExit, 5.5, 0, Math.PI * 2);
              ctx.fill();
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 1.2;
              ctx.stroke();

              // Inner checkmark or cross glyph
              ctx.fillStyle = '#ffffff';
              ctx.font = 'bold 8px JetBrains Mono, monospace';
              ctx.fillText(isWin ? '✔' : '✖', clampedExitX - 3.5, yExit + 3);

              // Exit price micro-tag
              ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
              ctx.strokeStyle = color;
              ctx.lineWidth = 0.8;
              ctx.beginPath();
              ctx.roundRect
                ? ctx.roundRect(clampedExitX - 24, yExit + 9, 48, 13, 3)
                : ctx.rect(clampedExitX - 24, yExit + 9, 48, 13);
              ctx.fill();
              ctx.stroke();

              ctx.fillStyle = isWin ? '#34d399' : '#f87171';
              ctx.font = 'bold 7px JetBrains Mono, monospace';
              ctx.fillText(`OUT @ ${exitPrice.toFixed(1)}`, clampedExitX - 21, yExit + 18);

              tradeHitZones.push({
                x: clampedExitX,
                y: yExit,
                radius: 14,
                trade,
                label: 'EXIT POINT',
                pointType: 'EXIT',
              });
            }

            // D. Midpoint Trajectory Outcome Banner
            const midX = Math.max(
              padding.left + 42,
              Math.min(padding.left + chartWidth - 42, (clampedEntryX + clampedExitX) / 2)
            );
            const midY = Math.min(yEntry, yExit) - 15;

            const outcomeLabel = `${isWin ? '✔ WIN' : '✖ LOSS'} ${trade.profit >= 0 ? '+' : ''}$${trade.profit.toFixed(2)}`;
            const pillW = isSmall ? 76 : 84;
            ctx.fillStyle = isWin ? 'rgba(5, 150, 105, 0.95)' : 'rgba(225, 29, 72, 0.95)';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.roundRect
              ? ctx.roundRect(midX - pillW / 2, midY - 9, pillW, 18, 4)
              : ctx.rect(midX - pillW / 2, midY - 9, pillW, 18);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 8.5px JetBrains Mono, monospace';
            ctx.fillText(outcomeLabel, midX - pillW / 2 + 5, midY + 4);

            tradeHitZones.push({
              x: midX,
              y: midY,
              radius: 20,
              trade,
              label: 'OUTCOME BANNER',
              pointType: 'PATH',
            });
          }
        });
      }
    }

    // AI Signal Overlay Marker on latest candle
    if (showAISignals && aiPrediction && aiPrediction.recommendation !== 'HOLD') {
      const latestCandleIdx = visibleCandles.length - 1;
      if (latestCandleIdx >= 0) {
        const xPos = padding.left + latestCandleIdx * totalUnit + candleWidth / 2;
        const isBuy = aiPrediction.recommendation === 'BUY';
        const targetCandle = visibleCandles[latestCandleIdx];
        const yPos = isBuy ? priceToY(targetCandle.high) - 22 : priceToY(targetCandle.low) + 22;

        ctx.fillStyle = isBuy ? 'rgba(16, 185, 129, 0.9)' : 'rgba(244, 63, 94, 0.9)';
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(xPos - 38, yPos - 10, 76, 20, 6) : ctx.rect(xPos - 38, yPos - 10, 76, 20);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px JetBrains Mono, monospace';
        ctx.fillText(
          `🤖 ${isBuy ? 'CALL' : 'PUT'} ${aiPrediction.confidence_score}%`,
          xPos - 33,
          yPos + 4
        );
      }
    }

    // Render User Drawings
    drawings.forEach((drawing) => {
      ctx.strokeStyle = drawing.color || '#38bdf8';
      ctx.lineWidth = 1.6;

      switch (drawing.type) {
        case 'horizontal': {
          const y = priceToY(drawing.price);
          ctx.beginPath();
          ctx.moveTo(padding.left, y);
          ctx.lineTo(padding.left + chartWidth, y);
          ctx.stroke();

          // Price label badge
          ctx.fillStyle = drawing.color || '#38bdf8';
          ctx.fillRect(width - padding.right + 2, y - 8, isSmall ? 52 : 64, 16);
          ctx.fillStyle = '#0f172a';
          ctx.font = '9px JetBrains Mono, monospace';
          ctx.fillText(drawing.price.toFixed(decimals), width - padding.right + 5, y + 4);
          break;
        }

        case 'trendline':
        case 'ray': {
          const y1 = priceToY(drawing.p1.price);
          const y2 = priceToY(drawing.p2.price);
          const x1 = padding.left + drawing.p1.time;
          const x2 = padding.left + drawing.p2.time;

          ctx.beginPath();
          ctx.moveTo(x1, y1);
          if (drawing.type === 'ray') {
            const dx = x2 - x1;
            const dy = y2 - y1;
            ctx.lineTo(x1 + dx * 10, y1 + dy * 10);
          } else {
            ctx.lineTo(x2, y2);
          }
          ctx.stroke();

          // End node circles
          ctx.fillStyle = drawing.color;
          ctx.beginPath();
          ctx.arc(x1, y1, 3, 0, Math.PI * 2);
          ctx.arc(x2, y2, 3, 0, Math.PI * 2);
          ctx.fill();
          break;
        }

        case 'rectangle': {
          const y1 = priceToY(drawing.p1.price);
          const y2 = priceToY(drawing.p2.price);
          const x1 = padding.left + drawing.p1.time;
          const x2 = padding.left + drawing.p2.time;

          const rectX = Math.min(x1, x2);
          const rectY = Math.min(y1, y2);
          const rectW = Math.abs(x2 - x1);
          const rectH = Math.abs(y2 - y1);

          ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
          ctx.fillRect(rectX, rectY, rectW, rectH);
          ctx.strokeRect(rectX, rectY, rectW, rectH);
          break;
        }

        case 'fibonacci': {
          const yBase = priceToY(drawing.p1.price);
          const yPeak = priceToY(drawing.p2.price);
          const x1 = padding.left + drawing.p1.time;
          const x2 = padding.left + drawing.p2.time;
          const deltaPrice = drawing.p2.price - drawing.p1.price;

          FIBONACCI_LEVELS.forEach((fib) => {
            const targetP = drawing.p1.price + deltaPrice * fib.level;
            const y = priceToY(targetP);

            ctx.strokeStyle = fib.color;
            ctx.setLineDash([3, 2]);
            ctx.beginPath();
            ctx.moveTo(Math.min(x1, x2), y);
            ctx.lineTo(padding.left + chartWidth, y);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.fillStyle = fib.color;
            ctx.font = '8px JetBrains Mono, monospace';
            ctx.fillText(`${fib.label}: ${targetP.toFixed(decimals)}`, Math.min(x1, x2) + 4, y - 3);
          });
          break;
        }

        case 'pricemarker': {
          const y = priceToY(drawing.price);
          const x = padding.left + drawing.time;

          ctx.fillStyle = drawing.color || '#ec4899';
          ctx.beginPath();
          ctx.arc(x, y, 4.5, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillRect(x + 6, y - 9, 78, 18);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 9px JetBrains Mono, monospace';
          ctx.fillText(drawing.label || drawing.price.toFixed(decimals), x + 10, y + 4);
          break;
        }
      }
    });

    // =========================================================================
    // REAL-TIME AGENT CHART TOOLS RENDERING (Support/Resistance, Trendlines, Fib, Order Blocks, Sniper Targets)
    // =========================================================================
    if (agentToolsConfig.enabled && agentDrawings.length > 0) {
      agentDrawings.forEach((drawing) => {
        ctx.save();
        ctx.strokeStyle = drawing.color || '#a855f7';
        ctx.lineWidth = 1.6;

        switch (drawing.type) {
          case 'horizontal': {
            const y = priceToY(drawing.price);
            ctx.setLineDash([5, 4]);
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(padding.left + chartWidth, y);
            ctx.stroke();
            ctx.setLineDash([]);

            // Neon glowing Agent Badge on right
            const labelText = drawing.label || `[Agent: ${drawing.price.toFixed(decimals)}]`;
            ctx.font = 'bold 8.5px JetBrains Mono, monospace';
            const textWidth = ctx.measureText(labelText).width;
            const badgeW = textWidth + 12;
            const badgeX = padding.left + chartWidth - badgeW - 6;

            ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
            ctx.strokeStyle = drawing.color;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect ? ctx.roundRect(badgeX, y - 8, badgeW, 16, 4) : ctx.rect(badgeX, y - 8, badgeW, 16);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = drawing.color;
            ctx.fillText(labelText, badgeX + 6, y + 3.5);
            break;
          }

          case 'trendline':
          case 'ray': {
            const y1 = priceToY(drawing.p1.price);
            const y2 = priceToY(drawing.p2.price);
            const x1 = padding.left + (drawing.p1.time - startIndex) * totalUnit + candleWidth / 2;
            const x2 = padding.left + (drawing.p2.time - startIndex) * totalUnit + candleWidth / 2;

            ctx.setLineDash([6, 3]);
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            if (drawing.type === 'ray') {
              const dx = x2 - x1;
              const dy = y2 - y1;
              ctx.lineTo(x1 + dx * 6, y1 + dy * 6);
            } else {
              ctx.lineTo(x2, y2);
            }
            ctx.stroke();
            ctx.setLineDash([]);

            // Draw node circles & Agent Label
            ctx.fillStyle = drawing.color;
            ctx.beginPath();
            ctx.arc(x1, y1, 3.5, 0, Math.PI * 2);
            ctx.arc(x2, y2, 3.5, 0, Math.PI * 2);
            ctx.fill();

            if (drawing.label) {
              ctx.font = 'bold 8px JetBrains Mono, monospace';
              ctx.fillStyle = drawing.color;
              ctx.fillText(drawing.label, Math.min(x1, x2) + 6, Math.min(y1, y2) - 4);
            }
            break;
          }

          case 'fibonacci': {
            const x1 = Math.max(padding.left, padding.left + (drawing.p1.time - startIndex) * totalUnit);
            const deltaPrice = drawing.p2.price - drawing.p1.price;

            // Highlight Golden Pocket (0.5 to 0.618 zone)
            const y50 = priceToY(drawing.p1.price + deltaPrice * 0.5);
            const y618 = priceToY(drawing.p1.price + deltaPrice * 0.618);
            const gpTop = Math.min(y50, y618);
            const gpH = Math.abs(y618 - y50);

            ctx.fillStyle = 'rgba(251, 191, 36, 0.12)';
            ctx.fillRect(x1, gpTop, chartWidth - (x1 - padding.left), gpH);

            FIBONACCI_LEVELS.forEach((fib) => {
              const targetP = drawing.p1.price + deltaPrice * fib.level;
              const y = priceToY(targetP);

              ctx.strokeStyle = fib.color;
              ctx.setLineDash([4, 3]);
              ctx.beginPath();
              ctx.moveTo(x1, y);
              ctx.lineTo(padding.left + chartWidth, y);
              ctx.stroke();
              ctx.setLineDash([]);

              ctx.fillStyle = fib.color;
              ctx.font = 'bold 8px JetBrains Mono, monospace';
              const label =
                fib.level === 0.618
                  ? `★ GOLDEN POCKET 61.8%: ${targetP.toFixed(decimals)}`
                  : `${fib.label}: ${targetP.toFixed(decimals)}`;
              ctx.fillText(label, x1 + 6, y - 3);
            });
            break;
          }

          case 'rectangle': {
            const y1 = priceToY(drawing.p1.price);
            const y2 = priceToY(drawing.p2.price);
            const x1 = padding.left + (drawing.p1.time - startIndex) * totalUnit;
            const x2 = padding.left + (drawing.p2.time - startIndex) * totalUnit + candleWidth;

            const rx = Math.max(padding.left, Math.min(x1, x2));
            const ry = Math.min(y1, y2);
            const rw = Math.min(chartWidth - (rx - padding.left), Math.abs(x2 - x1));
            const rh = Math.max(2, Math.abs(y2 - y1));

            // Soft translucent fill for Order Blocks & FVGs
            const isBull =
              (drawing.color || '').includes('10b981') ||
              (drawing.label || '').includes('Demand') ||
              (drawing.label || '').includes('TP');
            ctx.fillStyle = isBull ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)';
            ctx.fillRect(rx, ry, rw, rh);

            ctx.strokeStyle = drawing.color;
            ctx.setLineDash([4, 2]);
            ctx.strokeRect(rx, ry, rw, rh);
            ctx.setLineDash([]);

            if (drawing.label) {
              ctx.fillStyle = drawing.color;
              ctx.font = 'bold 8px JetBrains Mono, monospace';
              ctx.fillText(drawing.label, rx + 4, ry + 11);
            }
            break;
          }
        }
        ctx.restore();
      });
    }

    // =========================================================================
    // REAL-TIME SNIPER ENTRY & EXITS TARGET OVERLAY (Reticle, TP & SL Projections)
    // =========================================================================
    if (showSniperOverlay && sniperSetup && sniperSetup.direction !== 'NEUTRAL') {
      ctx.save();
      const yOpt = priceToY(sniperSetup.optimalEntryPrice);
      const yTP = priceToY(sniperSetup.takeProfitPrice);
      const ySL = priceToY(sniperSetup.stopLossPrice);
      const latestCandleX = padding.left + (visibleCandles.length - 1) * totalUnit + candleWidth / 2;

      // 1. Shaded Risk/Reward Zones
      // Take-Profit Zone (Emerald translucent)
      const tpTop = Math.min(yOpt, yTP);
      const tpH = Math.max(2, Math.abs(yTP - yOpt));
      ctx.fillStyle = 'rgba(16, 185, 129, 0.08)';
      ctx.fillRect(padding.left, tpTop, chartWidth, tpH);

      // Stop-Loss Zone (Rose translucent)
      const slTop = Math.min(yOpt, ySL);
      const slH = Math.max(2, Math.abs(ySL - yOpt));
      ctx.fillStyle = 'rgba(239, 68, 68, 0.08)';
      ctx.fillRect(padding.left, slTop, chartWidth, slH);

      // 2. Optimal Entry Line (Cyan dashed)
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(padding.left, yOpt);
      ctx.lineTo(padding.left + chartWidth, yOpt);
      ctx.stroke();

      // Optimal Entry Pulsating Crosshair Reticle at latest candle
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(latestCandleX, yOpt, 7, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(latestCandleX, yOpt, 2, 0, Math.PI * 2);
      ctx.fillStyle = '#22d3ee';
      ctx.fill();

      // Crosshair Reticle Spikes
      ctx.beginPath();
      ctx.moveTo(latestCandleX - 11, yOpt);
      ctx.lineTo(latestCandleX - 5, yOpt);
      ctx.moveTo(latestCandleX + 5, yOpt);
      ctx.lineTo(latestCandleX + 11, yOpt);
      ctx.moveTo(latestCandleX, yOpt - 11);
      ctx.lineTo(latestCandleX, yOpt - 5);
      ctx.moveTo(latestCandleX, yOpt + 5);
      ctx.lineTo(latestCandleX, yOpt + 11);
      ctx.stroke();

      // Optimal Entry Tag
      const entryText = `🎯 SNIPER ENTRY: $${sniperSetup.optimalEntryPrice.toFixed(decimals)} (${sniperSetup.score}%)`;
      ctx.font = 'bold 8.5px JetBrains Mono, monospace';
      const entryW = ctx.measureText(entryText).width + 12;
      ctx.fillStyle = 'rgba(8, 51, 68, 0.95)';
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(padding.left + 8, yOpt - 9, entryW, 18, 4) : ctx.rect(padding.left + 8, yOpt - 9, entryW, 18);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#22d3ee';
      ctx.fillText(entryText, padding.left + 14, yOpt + 3.5);

      // 3. Take-Profit Target Line (Emerald)
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      ctx.moveTo(padding.left, yTP);
      ctx.lineTo(padding.left + chartWidth, yTP);
      ctx.stroke();

      const tpText = `🎯 SNIPER TP: $${sniperSetup.takeProfitPrice.toFixed(decimals)} (+1.8 ATR | R:R ${sniperSetup.riskRewardRatio}:1)`;
      const tpW = ctx.measureText(tpText).width + 12;
      ctx.fillStyle = 'rgba(6, 78, 59, 0.95)';
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(padding.left + 8, yTP - 9, tpW, 18, 4) : ctx.rect(padding.left + 8, yTP - 9, tpW, 18);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#34d399';
      ctx.fillText(tpText, padding.left + 14, yTP + 3.5);

      // 4. Stop-Loss Invalidation Line (Rose)
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(padding.left, ySL);
      ctx.lineTo(padding.left + chartWidth, ySL);
      ctx.stroke();

      const slText = `🛑 SNIPER SL: $${sniperSetup.stopLossPrice.toFixed(decimals)} (-0.75 ATR)`;
      const slW = ctx.measureText(slText).width + 12;
      ctx.fillStyle = 'rgba(127, 29, 29, 0.95)';
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(padding.left + 8, ySL - 9, slW, 18, 4) : ctx.rect(padding.left + 8, ySL - 9, slW, 18);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#f87171';
      ctx.fillText(slText, padding.left + 14, ySL + 3.5);

      ctx.restore();
    }

    // Sub-Panel: RSI (14)
    if (showRSI && indicators?.rsi) {
      const rsiSlice = indicators.rsi.slice(startIndex, endIndex);
      const rsiHeight = isSmall ? 48 : 58;
      const rsiTop = height - padding.bottom + (isSmall ? 10 : 16);

      ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
      ctx.fillRect(padding.left, rsiTop, chartWidth, rsiHeight);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.strokeRect(padding.left, rsiTop, chartWidth, rsiHeight);

      // 70 & 30 Lines
      const y70 = rsiTop + rsiHeight - (rsiHeight * 70) / 100;
      const y30 = rsiTop + rsiHeight - (rsiHeight * 30) / 100;
      const y50 = rsiTop + rsiHeight - (rsiHeight * 50) / 100;

      ctx.strokeStyle = 'rgba(244, 63, 94, 0.35)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(padding.left, y70);
      ctx.lineTo(padding.left + chartWidth, y70);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(16, 185, 129, 0.35)';
      ctx.beginPath();
      ctx.moveTo(padding.left, y30);
      ctx.lineTo(padding.left + chartWidth, y30);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.beginPath();
      ctx.moveTo(padding.left, y50);
      ctx.lineTo(padding.left + chartWidth, y50);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px JetBrains Mono, monospace';
      const curRSI = indicators.rsiNow ? indicators.rsiNow.toFixed(1) : '--';
      ctx.fillText(`RSI(14): ${curRSI}`, padding.left + 6, rsiTop + 12);
      ctx.fillText('70', width - padding.right + 5, y70 + 3);
      ctx.fillText('30', width - padding.right + 5, y30 + 3);

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      let started = false;
      rsiSlice.forEach((val, idx) => {
        if (val !== null) {
          const x = padding.left + idx * totalUnit + candleWidth / 2;
          const y = rsiTop + rsiHeight - (rsiHeight * val) / 100;
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      });
      ctx.stroke();
    }

    // Crosshair & Inspection Tooltip
    if (mousePos && mousePos.x >= padding.left && mousePos.x <= padding.left + chartWidth) {
      const x = mousePos.x;
      const y = Math.max(padding.top, Math.min(padding.top + chartHeight, mousePos.y));

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, padding.top + chartHeight);
      ctx.stroke();

      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartWidth, y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Crosshair Price Tag
      const hoverPrice = getPriceFromY(y, minPrice, priceRange, padding.top, chartHeight);
      ctx.fillStyle = '#334155';
      ctx.fillRect(width - padding.right + 2, y - 8, isSmall ? 54 : 68, 16);
      ctx.fillStyle = '#f8fafc';
      ctx.font = `${isSmall ? '9px' : '10px'} JetBrains Mono, monospace`;
      ctx.fillText(hoverPrice.toFixed(decimals), width - padding.right + 5, y + 4);

      // Find hovered candle
      const candleIndex = Math.floor((x - padding.left) / totalUnit);
      if (candleIndex >= 0 && candleIndex < visibleCandles.length) {
        const hc = visibleCandles[candleIndex];
        setInspectedCandle(hc);
      }

      // Check trade marker hit inspection
      let hoveredTradeHit: TradeHitZone | null = null;
      for (const hz of tradeHitZones) {
        const dist = Math.hypot(x - hz.x, y - hz.y);
        if (dist <= hz.radius) {
          hoveredTradeHit = hz;
          break;
        }
      }

      // If a trade marker is hovered, render HUD Trade Detail Card
      if (hoveredTradeHit) {
        const t = hoveredTradeHit.trade;
        const isCall = t.decision.includes('BUY') || t.decision.includes('CALL');
        const isWin = t.result === 'WIN' || t.profit > 0;
        const statusColor = t.result === 'PENDING' ? (isCall ? '#10b981' : '#f43f5e') : isWin ? '#10b981' : '#f43f5e';
        const cardW = isSmall ? 180 : 210;
        const cardH = 92;
        const cardX = Math.max(padding.left + 6, Math.min(padding.left + chartWidth - cardW - 6, x + 12));
        const cardY = Math.max(padding.top + 6, Math.min(padding.top + chartHeight - cardH - 6, y - 46));

        ctx.fillStyle = 'rgba(11, 15, 25, 0.96)';
        ctx.strokeStyle = statusColor;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.roundRect
          ? ctx.roundRect(cardX, cardY, cardW, cardH, 6)
          : ctx.rect(cardX, cardY, cardW, cardH);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 9.5px JetBrains Mono, monospace';
        ctx.fillText(`${isCall ? '▲ CALL / RISE' : '▼ PUT / FALL'} [${t.mode || 'SIM'}]`, cardX + 8, cardY + 16);

        ctx.fillStyle = statusColor;
        ctx.font = 'bold 8.5px JetBrains Mono, monospace';
        const statusText = t.result === 'PENDING' ? `ACTIVE (${hoveredTradeHit.label})` : `${t.result} (${hoveredTradeHit.label})`;
        ctx.fillText(statusText, cardX + 8, cardY + 30);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '8.5px JetBrains Mono, monospace';
        const pnlStr = t.result === 'PENDING'
          ? (isCall ? (currentPrice > t.entryPrice ? `+$${(t.amount * 0.95).toFixed(2)} (ITM)` : `-$${t.amount.toFixed(2)} (OTM)`) : (currentPrice < t.entryPrice ? `+$${(t.amount * 0.95).toFixed(2)} (ITM)` : `-$${t.amount.toFixed(2)} (OTM)`))
          : `${t.profit >= 0 ? '+' : ''}$${t.profit.toFixed(2)}`;
        ctx.fillText(`Stake: $${t.amount.toFixed(2)} | PnL: ${pnlStr}`, cardX + 8, cardY + 44);
        ctx.fillText(`Entry: ${t.entryPrice.toFixed(decimals)} | Exit: ${(t.exitPrice ?? currentPrice).toFixed(decimals)}`, cardX + 8, cardY + 58);
        ctx.fillText(`Strategy: ${t.agent || 'Consensus'}`, cardX + 8, cardY + 72);
        ctx.fillText(`Time: ${new Date(t.timestamp).toLocaleTimeString()}`, cardX + 8, cardY + 84);
      }
    }

    ctx.restore();
  }, [
    candles,
    indicators,
    currentPrice,
    openTrades,
    closedTrades,
    showBB,
    showMAs,
    showRSI,
    showMarkers,
    showAISignals,
    candleWidth,
    panOffset,
    mousePos,
    decimals,
    aiPrediction,
    drawings,
    getPriceFromY,
    isFullscreen,
    onExecuteTrade,
    granularity,
    symbol,
  ]);

  // Continuous live render effect
  useEffect(() => {
    let animId = requestAnimationFrame(() => {
      drawChart();
    });
    return () => {
      cancelAnimationFrame(animId);
    };
  }, [drawChart]);

  // Zero-blanking ResizeObserver and orientation listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let rafId: number | null = null;
    const scheduleDraw = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        drawChart();
      });
    };

    scheduleDraw();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver((entries) => {
        if (!entries || entries.length === 0) return;
        window.requestAnimationFrame(() => {
          const entry = entries[0];
          if (entry && entry.contentRect && entry.contentRect.width === 0 && entry.contentRect.height === 0) {
            return;
          }
          scheduleDraw();
        });
      });
      ro.observe(container);
    }

    const onWinResize = () => {
      scheduleDraw();
    };

    window.addEventListener('resize', onWinResize, { passive: true });
    window.addEventListener('orientationchange', onWinResize, { passive: true });

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (ro) ro.disconnect();
      window.removeEventListener('resize', onWinResize);
      window.removeEventListener('orientationchange', onWinResize);
    };
  }, [drawChart]);

  // Touch Gesture Handlers for mobile pan & pinch
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const t = touchStateRef.current;
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const now = Date.now();
      t.startX = touch.clientX;
      t.startPan = panOffset;

      // Double tap reset
      if (now - t.lastTapTime < 300) {
        setCandleWidth(9);
        setPanOffset(0);
        sound.play('click');
      }
      t.lastTapTime = now;

      // Long press crosshair trigger
      if (t.longPressTimer) clearTimeout(t.longPressTimer);
      t.longPressTimer = setTimeout(() => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          setMousePos({ x: touch.clientX - rect.left, y: touch.clientY - rect.top });
          sound.play('click');
        }
      }, 450);
    } else if (e.touches.length === 2) {
      if (t.longPressTimer) clearTimeout(t.longPressTimer);
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      t.startDist = Math.hypot(dx, dy);
      t.startWidth = candleWidth;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const t = touchStateRef.current;
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const diffX = touch.clientX - t.startX;
      if (Math.abs(diffX) > 8 && t.longPressTimer) {
        clearTimeout(t.longPressTimer);
      }

      // Pan chart through history
      const deltaCandles = Math.round(diffX / (candleWidth + 3));
      setPanOffset(Math.max(0, t.startPan + deltaCandles));

      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        setMousePos({ x: touch.clientX - rect.left, y: touch.clientY - rect.top });
      }
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const scale = dist / (t.startDist || 1);
      const newWidth = Math.max(4, Math.min(26, Math.round(t.startWidth * scale)));
      setCandleWidth(newWidth);
    }
  };

  const handleTouchEnd = () => {
    const t = touchStateRef.current;
    if (t.longPressTimer) clearTimeout(t.longPressTimer);
  };

  // Canvas Click / Tap to place drawings
  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (activeDrawTool === 'none') return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Relative price calculation
    const anchorPrice = currentPrice > 0 ? currentPrice : candles[candles.length - 1]?.close || 1000;
    const minPrice = anchorPrice * 0.985;
    const maxPrice = anchorPrice * 1.015;
    const priceRange = maxPrice - minPrice;
    const chartHeight = rect.height - 24 - (showRSI ? 75 : 28);
    const clickedPrice = minPrice + ((rect.height - (showRSI ? 75 : 28) - y) / chartHeight) * priceRange;

    const point: ChartPoint = {
      time: x,
      price: clickedPrice,
    };

    if (activeDrawTool === 'horizontal') {
      const newD: ChartDrawing = {
        id: `draw_${Date.now()}`,
        type: 'horizontal',
        price: clickedPrice,
        color: '#38bdf8',
        symbol,
        createdAt: Date.now(),
      };
      handleSaveDrawings([...drawings, newD]);
      setActiveDrawTool('none');
      sound.play('click');
    } else if (activeDrawTool === 'pricemarker') {
      const newD: ChartDrawing = {
        id: `draw_${Date.now()}`,
        type: 'pricemarker',
        price: clickedPrice,
        time: x,
        label: clickedPrice.toFixed(decimals),
        color: '#ec4899',
        symbol,
        createdAt: Date.now(),
      };
      handleSaveDrawings([...drawings, newD]);
      setActiveDrawTool('none');
      sound.play('click');
    } else if (!pendingDrawingStart) {
      setPendingDrawingStart(point);
      sound.play('click');
    } else {
      // Complete two-point drawing
      const base = {
        id: `draw_${Date.now()}`,
        color: activeDrawTool === 'fibonacci' ? '#fbbf24' : '#38bdf8',
        symbol,
        createdAt: Date.now(),
        p1: pendingDrawingStart,
        p2: point,
      };

      let completeD: ChartDrawing;
      if (activeDrawTool === 'trendline') {
        completeD = { ...base, type: 'trendline' };
      } else if (activeDrawTool === 'ray') {
        completeD = { ...base, type: 'ray' };
      } else if (activeDrawTool === 'rectangle') {
        completeD = { ...base, type: 'rectangle' };
      } else {
        completeD = { ...base, type: 'fibonacci' };
      }

      handleSaveDrawings([...drawings, completeD]);
      setPendingDrawingStart(null);
      setActiveDrawTool('none');
      sound.play('trade');
    }
  };

  return (
    <div
      className={`flex flex-col bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl backdrop-blur-md overflow-hidden transition-all duration-200 ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none border-none bg-slate-950 h-dvh w-screen' : 'w-full'
      }`}
    >
      {/* Fullscreen Header (Only shown when Fullscreen is active) */}
      {isFullscreen && (
        <div className="flex items-center justify-between px-3 py-2 bg-slate-950 border-b border-slate-800/80 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsFullscreen(false)}
              className="p-2 -ml-1 text-slate-400 hover:text-white rounded-lg active:bg-slate-800"
              aria-label="Exit Fullscreen"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex flex-col">
              <span className="font-extrabold text-xs tracking-wider text-slate-100 font-sans uppercase">
                {symbol}
              </span>
              <span className="text-[10px] text-cyan-400 font-mono font-bold">
                {currentPrice ? currentPrice.toFixed(decimals) : '--'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsFullscreen(false)}
              className="px-3 py-1.5 text-xs font-mono font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg flex items-center gap-1"
            >
              <Minimize2 className="w-3.5 h-3.5" />
              <span>Exit</span>
            </button>
          </div>
        </div>
      )}

      {/* Floating Compact Chart Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 px-3 py-2 bg-slate-950/70 border-b border-slate-800/60 text-xs shrink-0">
        {/* Left: Timeframe pills */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
          {timeframes.map((tf) => (
            <button
              key={tf.value}
              onClick={() => {
                onGranularityChange(tf.value);
                sound.play('click');
              }}
              className={`px-2 py-1 rounded-md font-mono text-[11px] font-semibold transition-all shrink-0 ${
                granularity === tf.value
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm shadow-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>

        {/* Right: Actions (Indicators, Draw, AI, Fullscreen, Refresh) */}
        <div className="flex items-center gap-1 relative">
          {/* Agent Tools Popover Trigger */}
          <button
            onClick={() => {
              setIsAgentToolsMenuOpen(!isAgentToolsMenuOpen);
              setIsIndicatorsOpen(false);
              setIsDrawMenuOpen(false);
            }}
            className={`px-2 py-1 rounded-md font-mono text-[11px] font-medium flex items-center gap-1 transition-all ${
              isAgentToolsMenuOpen || agentToolsConfig.enabled
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
            }`}
            title="Trading Agents Autonomous Real-Time Chart Tools"
          >
            <Bot className="w-3 h-3 text-purple-400" />
            <span className="hidden sm:inline">Agent Tools</span>
            {agentDrawings.length > 0 && (
              <span className="px-1 rounded bg-purple-500/30 text-[9px] text-purple-300 font-bold">
                {agentDrawings.length}
              </span>
            )}
          </button>

          {/* Sniper HUD Overlay Toggle */}
          {sniperSetup && (
            <button
              onClick={() => {
                setShowSniperOverlay(!showSniperOverlay);
                sound.play('click');
              }}
              className={`px-2 py-1 rounded-md font-mono text-[11px] font-medium flex items-center gap-1 transition-all ${
                showSniperOverlay
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40 border border-transparent'
              }`}
              title="Toggle Real-Time Sniper Entry and Exit Target Projections"
            >
              <Crosshair className="w-3 h-3 text-cyan-400" />
              <span className="hidden sm:inline">Sniper</span>
              <span
                className={`px-1 rounded text-[9px] font-bold ${
                  sniperSetup.isPrimed
                    ? 'bg-emerald-500/30 text-emerald-300 animate-pulse'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {sniperSetup.score}%
              </span>
            </button>
          )}

          {/* Indicators dropdown trigger */}
          <button
            onClick={() => {
              setIsIndicatorsOpen(!isIndicatorsOpen);
              setIsDrawMenuOpen(false);
              setIsAgentToolsMenuOpen(false);
            }}
            className={`px-2 py-1 rounded-md font-mono text-[11px] font-medium flex items-center gap-1 transition-all ${
              isIndicatorsOpen
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
            }`}
          >
            <SlidersHorizontal className="w-3 h-3 text-cyan-400" />
            <span className="hidden sm:inline">Indicators</span>
          </button>

          {/* Draw menu trigger */}
          <button
            onClick={() => {
              setIsDrawMenuOpen(!isDrawMenuOpen);
              setIsIndicatorsOpen(false);
            }}
            className={`px-2 py-1 rounded-md font-mono text-[11px] font-medium flex items-center gap-1 transition-all ${
              isDrawMenuOpen || activeDrawTool !== 'none'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
            }`}
          >
            <PenTool className="w-3 h-3 text-sky-400" />
            <span className="hidden sm:inline">Draw</span>
            {drawings.length > 0 && (
              <span className="px-1 rounded bg-sky-500/30 text-[9px] text-sky-300 font-bold">
                {drawings.length}
              </span>
            )}
          </button>

          {/* AI Signals toggle */}
          <button
            onClick={() => {
              setShowAISignals(!showAISignals);
              sound.play('click');
            }}
            className={`px-2 py-1 rounded-md font-mono text-[11px] font-medium flex items-center gap-1 transition-all ${
              showAISignals
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40 border border-transparent'
            }`}
            title="Toggle AI Signals"
          >
            <Sparkles className="w-3 h-3 text-emerald-400" />
            <span className="hidden sm:inline">AI</span>
          </button>

          {/* Trade Markers toggle */}
          <button
            onClick={() => {
              setShowMarkers(!showMarkers);
              sound.play('click');
            }}
            className={`px-2 py-1 rounded-md font-mono text-[11px] font-medium flex items-center gap-1 transition-all ${
              showMarkers
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40 border border-transparent'
            }`}
            title="Toggle Trade Entry & Exit Markers"
          >
            <Target className="w-3 h-3 text-amber-400" />
            <span className="hidden sm:inline">Markers</span>
            {(openTrades.length > 0 || (closedTrades && closedTrades.length > 0)) && (
              <span className="px-1 rounded bg-amber-500/30 text-[9px] text-amber-300 font-bold">
                {openTrades.length + (closedTrades?.length || 0)}
              </span>
            )}
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={() => {
              setIsFullscreen(!isFullscreen);
              sound.play('toggle');
            }}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors"
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            aria-label="Fullscreen toggle"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {/* Refresh Stream */}
          <button
            onClick={onRefresh}
            className="p-1.5 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded-md transition-colors"
            title="Reload Candlesticks"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          {/* Indicators Popover */}
          {isIndicatorsOpen && (
            <div className="absolute top-full right-0 mt-1 z-30 w-48 p-2 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl flex flex-col gap-1 text-[11px] font-mono">
              <span className="text-[10px] text-slate-500 px-2 font-bold uppercase">Indicators</span>
              <button
                onClick={() => setShowBB(!showBB)}
                className={`flex items-center justify-between px-2 py-1.5 rounded-lg ${
                  showBB ? 'bg-sky-500/20 text-sky-300' : 'text-slate-400 hover:bg-slate-800'
                }`}
              >
                <span>Bollinger Bands</span>
                <span className="w-2 h-2 rounded-full bg-sky-400" />
              </button>
              <button
                onClick={() => setShowMAs(!showMAs)}
                className={`flex items-center justify-between px-2 py-1.5 rounded-lg ${
                  showMAs ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:bg-slate-800'
                }`}
              >
                <span>MA (14/50)</span>
                <span className="w-2 h-2 rounded-full bg-amber-400" />
              </button>
              <button
                onClick={() => setShowRSI(!showRSI)}
                className={`flex items-center justify-between px-2 py-1.5 rounded-lg ${
                  showRSI ? 'bg-indigo-500/20 text-indigo-300' : 'text-slate-400 hover:bg-slate-800'
                }`}
              >
                <span>RSI (14)</span>
                <span className="w-2 h-2 rounded-full bg-indigo-400" />
              </button>
              <button
                onClick={() => setShowMarkers(!showMarkers)}
                className={`flex items-center justify-between px-2 py-1.5 rounded-lg ${
                  showMarkers ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-400 hover:bg-slate-800'
                }`}
              >
                <span>Order Markers</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
              </button>
            </div>
          )}

          {/* Draw Menu Popover */}
          {isDrawMenuOpen && (
            <div className="absolute top-full right-0 mt-1 z-30 w-52 p-2 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl flex flex-col gap-1 text-[11px] font-mono">
              <div className="flex items-center justify-between px-2 py-0.5 border-b border-slate-800 pb-1">
                <span className="text-[10px] text-slate-500 font-bold uppercase">Drawing Tools</span>
                {activeDrawTool !== 'none' && (
                  <button
                    onClick={() => setActiveDrawTool('none')}
                    className="text-[10px] text-rose-400 hover:underline"
                  >
                    Cancel
                  </button>
                )}
              </div>
              <button
                onClick={() => {
                  setActiveDrawTool('horizontal');
                  setIsDrawMenuOpen(false);
                }}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-left ${
                  activeDrawTool === 'horizontal' ? 'bg-sky-500/20 text-sky-300' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <span>✚</span> Horizontal Line
              </button>
              <button
                onClick={() => {
                  setActiveDrawTool('trendline');
                  setIsDrawMenuOpen(false);
                }}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-left ${
                  activeDrawTool === 'trendline' ? 'bg-sky-500/20 text-sky-300' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <span>╱</span> Trend Line
              </button>
              <button
                onClick={() => {
                  setActiveDrawTool('ray');
                  setIsDrawMenuOpen(false);
                }}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-left ${
                  activeDrawTool === 'ray' ? 'bg-sky-500/20 text-sky-300' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <span>↗</span> Ray
              </button>
              <button
                onClick={() => {
                  setActiveDrawTool('rectangle');
                  setIsDrawMenuOpen(false);
                }}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-left ${
                  activeDrawTool === 'rectangle' ? 'bg-sky-500/20 text-sky-300' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <span>▱</span> Rectangle
              </button>
              <button
                onClick={() => {
                  setActiveDrawTool('fibonacci');
                  setIsDrawMenuOpen(false);
                }}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-left ${
                  activeDrawTool === 'fibonacci' ? 'bg-sky-500/20 text-sky-300' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <span>⌁</span> Fibonacci
              </button>
              <button
                onClick={() => {
                  setActiveDrawTool('pricemarker');
                  setIsDrawMenuOpen(false);
                }}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-left ${
                  activeDrawTool === 'pricemarker' ? 'bg-sky-500/20 text-sky-300' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <span>⌖</span> Price Marker
              </button>
              {drawings.length > 0 && (
                <button
                  onClick={handleClearDrawings}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 border-t border-slate-800 mt-1"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear All Drawings</span>
                </button>
              )}
            </div>
          )}

          {/* Agent Tools Menu Popover */}
          {isAgentToolsMenuOpen && (
            <div className="absolute top-full right-0 mt-1 z-30 w-64 p-2.5 bg-slate-900/95 border border-purple-500/40 rounded-xl shadow-2xl backdrop-blur-xl flex flex-col gap-1.5 text-[11px] font-mono">
              <div className="flex items-center justify-between px-2 py-0.5 border-b border-slate-800 pb-1.5">
                <div className="flex items-center gap-1.5 text-purple-300 font-bold">
                  <Bot className="w-3.5 h-3.5 text-purple-400" />
                  <span>AGENT REAL-TIME TOOLS</span>
                </div>
                <button
                  type="button"
                  onClick={() => setAgentToolsConfig((prev) => ({ ...prev, enabled: !prev.enabled }))}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    agentToolsConfig.enabled
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {agentToolsConfig.enabled ? 'ON' : 'OFF'}
                </button>
              </div>

              <div className="flex flex-col gap-1 pt-1">
                <button
                  type="button"
                  onClick={() =>
                    setAgentToolsConfig((prev) => ({
                      ...prev,
                      showSupportResistance: !prev.showSupportResistance,
                    }))
                  }
                  className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-left transition-all ${
                    agentToolsConfig.showSupportResistance
                      ? 'bg-purple-500/10 text-purple-200'
                      : 'text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span>Key S/R Levels</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-sans">Structure</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setAgentToolsConfig((prev) => ({
                      ...prev,
                      showTrendlines: !prev.showTrendlines,
                    }))
                  }
                  className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-left transition-all ${
                    agentToolsConfig.showTrendlines
                      ? 'bg-purple-500/10 text-purple-200'
                      : 'text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-cyan-400" />
                    <span>Dynamic Trendlines</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-sans">Trend</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setAgentToolsConfig((prev) => ({
                      ...prev,
                      showFibonacci: !prev.showFibonacci,
                    }))
                  }
                  className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-left transition-all ${
                    agentToolsConfig.showFibonacci
                      ? 'bg-purple-500/10 text-purple-200'
                      : 'text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span>Fibonacci Golden Pocket</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-sans">0.618</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setAgentToolsConfig((prev) => ({
                      ...prev,
                      showOrderBlocks: !prev.showOrderBlocks,
                    }))
                  }
                  className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-left transition-all ${
                    agentToolsConfig.showOrderBlocks
                      ? 'bg-purple-500/10 text-purple-200'
                      : 'text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-teal-400" />
                    <span>Order Blocks & FVG</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-sans">Scalper</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setAgentToolsConfig((prev) => ({
                      ...prev,
                      showSniperTargets: !prev.showSniperTargets,
                    }))
                  }
                  className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-left transition-all ${
                    agentToolsConfig.showSniperTargets
                      ? 'bg-purple-500/10 text-purple-200'
                      : 'text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-400" />
                    <span>Sniper TP/SL Targets</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-sans">Risk Box</span>
                </button>
              </div>

              {agentDrawings.length > 0 && (
                <div className="pt-1.5 border-t border-slate-800 flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">
                    {agentDrawings.length} Active Real-Time Tools
                  </span>
                  <button
                    type="button"
                    onClick={handleSaveAgentDrawingsToUser}
                    className="text-[10px] text-purple-300 hover:text-purple-100 bg-purple-950/60 px-2 py-1 rounded border border-purple-800 hover:bg-purple-900 transition-all font-bold"
                  >
                    Save to My Tools
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Canvas Area */}
      <div
        ref={containerRef}
        className="relative flex-1 w-full min-h-[320px] sm:min-h-[380px] cursor-crosshair overflow-hidden chart-touch-area"
        onMouseMove={(e) => {
          const rect = canvasRef.current?.getBoundingClientRect();
          if (rect) {
            setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
          }
        }}
        onMouseLeave={() => {
          setMousePos(null);
          setInspectedCandle(null);
        }}
        onClick={handleCanvasClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <canvas ref={canvasRef} className="w-full h-full block" />

        {/* Legend Overlay at Top Left */}
        <div className="absolute top-2.5 left-2.5 sm:left-3 flex flex-wrap items-center gap-2 text-[10px] sm:text-[11px] font-mono pointer-events-none bg-slate-950/75 backdrop-blur-md px-2 py-1 rounded-lg border border-slate-800/80">
          <div className="flex items-center gap-1 text-slate-300">
            <span className="text-slate-400">SPOT:</span>
            <span className="font-bold text-cyan-300">
              {currentPrice ? currentPrice.toFixed(decimals) : '--'}
            </span>
          </div>
          {indicators?.ma14Now && (
            <div className="hidden sm:flex items-center gap-1 text-amber-400">
              <span>MA14:</span>
              <span>{indicators.ma14Now.toFixed(decimals)}</span>
            </div>
          )}
          {indicators?.pattern && indicators.pattern.pattern !== 'NONE' && (
            <div className="flex items-center gap-1 text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/50">
              <span>🕯️ {indicators.pattern.pattern}</span>
            </div>
          )}
          {activeDrawTool !== 'none' && (
            <div className="flex items-center gap-1 text-sky-400 bg-sky-950/80 px-1.5 py-0.5 rounded border border-sky-800/80">
              <span>✏️ Tap to place {activeDrawTool}</span>
            </div>
          )}
        </div>

        {/* Inspected Candle Tooltip */}
        {inspectedCandle && (
          <div className="absolute bottom-2 left-2.5 sm:left-3 pointer-events-none bg-slate-950/90 backdrop-blur-md px-2.5 py-1 rounded-lg border border-slate-800 text-[10px] font-mono flex items-center gap-2 text-slate-300">
            <span>O: {inspectedCandle.open.toFixed(decimals)}</span>
            <span>H: {inspectedCandle.high.toFixed(decimals)}</span>
            <span>L: {inspectedCandle.low.toFixed(decimals)}</span>
            <span
              className={
                inspectedCandle.close >= inspectedCandle.open ? 'text-emerald-400' : 'text-rose-400'
              }
            >
              C: {inspectedCandle.close.toFixed(decimals)}
            </span>
          </div>
        )}
      </div>

      {/* Fullscreen Bottom Sticky Trading Bar */}
      {isFullscreen && onExecuteTrade && (
        <div className="p-3 bg-slate-950 border-t border-slate-800/80 flex items-center justify-between gap-3 shrink-0 pb-safe">
          {/* Stake Stepper */}
          {onStakeChange && (
            <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800 font-mono">
              <button
                onClick={() => onStakeChange(Math.max(1, stake - 1))}
                className="w-8 h-8 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center hover:bg-slate-700"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <div className="px-2 text-xs font-bold text-white text-center min-w-[50px]">
                ${stake}
              </div>
              <button
                onClick={() => onStakeChange(stake + 1)}
                className="w-8 h-8 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center hover:bg-slate-700"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Large Execution Touch Targets */}
          <div className="flex-1 grid grid-cols-2 gap-2.5">
            <button
              onClick={() => onExecuteTrade('CALL')}
              disabled={isExecuting}
              className="min-h-[48px] px-3 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-mono font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-900/30 active:scale-98 transition-all disabled:opacity-50"
            >
              <TrendingUp className="w-4 h-4" />
              <span>CALL ↑ RISE</span>
            </button>
            <button
              onClick={() => onExecuteTrade('PUT')}
              disabled={isExecuting}
              className="min-h-[48px] px-3 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white font-mono font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-lg shadow-rose-900/30 active:scale-98 transition-all disabled:opacity-50"
            >
              <TrendingDown className="w-4 h-4" />
              <span>PUT ↓ FALL</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
