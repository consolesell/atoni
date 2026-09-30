import { AIPredictionResult, DecisionResult, TechnicalIndicators, TradeRecord } from '../types/trading';
import { calculateCoreRiskMetrics } from './riskEngine';

export interface GoogleDocItem {
  id: string;
  name: string;
  webViewLink: string;
  createdTime?: string;
  modifiedTime?: string;
}

export interface TradingReportData {
  symbol: string;
  currentPrice: number;
  granularity: number;
  indicators: TechnicalIndicators | null;
  decision: DecisionResult | null;
  aiPrediction: AIPredictionResult | null;
  openTrades: TradeRecord[];
  tradeHistory: TradeRecord[];
  accountMode: 'DEMO' | 'REAL';
  balance: number;
  currency: string;
  riskMetrics?: ReturnType<typeof calculateCoreRiskMetrics>;
}

/**
 * Creates a formatted Google Document with an executive trading report & quantitative journal.
 */
export async function createTradingReportDoc(
  accessToken: string,
  data: TradingReportData,
  customTitle?: string
): Promise<{ id: string; title: string; webViewLink: string }> {
  const timestamp = new Date().toLocaleString();
  const title = customTitle || `SBAgent Quant Report - ${data.symbol} (${new Date().toISOString().slice(0, 10)})`;

  // 1. Calculate or use supplied core risk metrics
  const riskMetrics = data.riskMetrics || calculateCoreRiskMetrics(data.tradeHistory, data.balance, 70);

  // 2. Create blank document in Google Docs
  const createRes = await fetch('https://docs.googleapis.com/v1/documents', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Failed to create Google Doc (${createRes.status}): ${errText}`);
  }

  const doc = await createRes.json();
  const documentId = doc.documentId;
  const webViewLink = `https://docs.google.com/document/d/${documentId}/edit`;

  // 3. Format Structured Report Content
  const regimeName = data.indicators?.regime?.type?.replace(/_/g, ' ') || 'Consolidation Equilibrium';
  const rsi = data.indicators?.rsiNow ? data.indicators.rsiNow.toFixed(1) : '50.0';
  const ma14 = data.indicators?.ma14Now ? data.indicators.ma14Now.toFixed(3) : data.currentPrice.toFixed(3);
  const ma50 = data.indicators?.ma50Now ? data.indicators.ma50Now.toFixed(3) : data.currentPrice.toFixed(3);
  const bbUpper = data.indicators?.bbNow?.upper ? data.indicators.bbNow.upper.toFixed(3) : 'N/A';
  const bbLower = data.indicators?.bbNow?.lower ? data.indicators.bbNow.lower.toFixed(3) : 'N/A';
  const atr = data.indicators?.atrNow ? data.indicators.atrNow.toFixed(3) : 'N/A';
  const mood = data.indicators?.mood?.mood || 'NEUTRAL';
  const moodRatio = data.indicators?.mood?.ratio ? `${(data.indicators.mood.ratio * 100).toFixed(1)}%` : '50.0%';
  const patternDesc = data.indicators?.pattern?.pattern ? data.indicators.pattern.pattern.replace(/_/g, ' ') : 'Neutral Equilibrium';

  const aiSignal = data.aiPrediction?.recommendation || data.decision?.action || 'HOLD';
  const aiConfidence = data.aiPrediction?.confidence_score ?? data.decision?.confidence ?? 65;
  const aiWinProb = data.aiPrediction?.ai_predicted_win_probability ? `${(data.aiPrediction.ai_predicted_win_probability * 100).toFixed(0)}%` : '62%';
  const aiReason = data.aiPrediction?.reason || 'Quantitative equilibrium observed across high-frequency tick structure.';

  const netPnL = data.tradeHistory.reduce((acc, t) => acc + (t.profit || 0), 0).toFixed(2);

  // Build text body
  let bodyText = `SBAGENT QUANTITATIVE TRADING JOURNAL & RISK AUDIT\n`;
  bodyText += `Generated: ${timestamp}\n`;
  bodyText += `Chief Architect: Givan (Kingvan) | Engine: SBAgent v3.1.0\n`;
  bodyText += `Asset: ${data.symbol} | Spot: ${data.currentPrice.toFixed(3)} | Account Mode: ${data.accountMode} (${data.currency})\n`;
  bodyText += `=========================================================================\n\n`;

  bodyText += `1. CORE RISK MANAGEMENT & PERFORMANCE METRICS\n`;
  bodyText += `-------------------------------------------------------------------------\n`;
  bodyText += `• Profit Factor (Gross P / Gross L) : ${riskMetrics.profitFactor.toFixed(2)} (Target: >= 1.65)\n`;
  bodyText += `• Gross Profits / Gross Losses     : $${riskMetrics.grossProfits.toFixed(2)} / $${riskMetrics.grossLosses.toFixed(2)}\n`;
  bodyText += `• Maximum Session Drawdown         : $${riskMetrics.maxDrawdown.toFixed(2)} (${riskMetrics.maxDrawdownPercent.toFixed(1)}%)\n`;
  bodyText += `• Trade Expectancy (Per Contract)  : ${riskMetrics.tradeExpectancy >= 0 ? '+' : ''}$${riskMetrics.tradeExpectancy.toFixed(2)}\n`;
  bodyText += `• Risk-to-Reward Payout Ratio      : ${riskMetrics.riskRewardRatio.toFixed(2)}\n`;
  bodyText += `• Total Settled Contracts          : ${riskMetrics.totalTrades} (${riskMetrics.winningTrades} Wins / ${riskMetrics.losingTrades} Losses)\n`;
  bodyText += `• Realized Win Rate                : ${(riskMetrics.winRate * 100).toFixed(1)}%\n`;
  bodyText += `• Average Win / Average Loss       : $${riskMetrics.averageWin.toFixed(2)} / $${riskMetrics.averageLoss.toFixed(2)}\n`;
  bodyText += `• Max Consecutive Wins / Losses    : ${riskMetrics.consecutiveWins} W / ${riskMetrics.consecutiveLosses} L\n`;
  bodyText += `• Dynamic Kelly Stake Sizing       : $${riskMetrics.recommendedKellyStake.toFixed(2)} (Kelly f*: ${(riskMetrics.kellyFraction * 100).toFixed(1)}%)\n`;
  bodyText += `• Account Equity Balance           : $${data.balance.toFixed(2)} ${data.currency} (Net P&L: ${Number(netPnL) >= 0 ? '+' : ''}$${netPnL})\n\n`;

  bodyText += `2. EXECUTIVE AI MARKET VERDICT & COGNITION\n`;
  bodyText += `-------------------------------------------------------------------------\n`;
  bodyText += `• Directional Recommendation       : ${aiSignal}\n`;
  bodyText += `• Strategic Confidence Score       : ${aiConfidence}%\n`;
  bodyText += `• Projected Win Probability        : ${aiWinProb}\n`;
  bodyText += `• Market Regime Classification     : ${regimeName}\n`;
  bodyText += `• Active Candlestick Pattern       : ${patternDesc}\n`;
  bodyText += `• Primary Structural Catalyst      : ${data.aiPrediction?.primary_catalyst || 'Dynamic Moving Average Test'}\n`;
  bodyText += `• Tactical Rationale               :\n  ${aiReason}\n\n`;

  if (data.aiPrediction?.risk_factors && data.aiPrediction.risk_factors.length > 0) {
    bodyText += `Key Risk Factors Evaluated:\n`;
    data.aiPrediction.risk_factors.forEach((rf, idx) => {
      bodyText += `  [${idx + 1}] ${rf}\n`;
    });
    bodyText += `\n`;
  }

  bodyText += `3. HIGH-FREQUENCY TECHNICAL INDICATORS MATRIX\n`;
  bodyText += `-------------------------------------------------------------------------\n`;
  bodyText += `• Current Spot Price               : ${data.currentPrice.toFixed(3)}\n`;
  bodyText += `• Relative Strength Index (RSI 14) : ${rsi} (${Number(rsi) > 65 ? 'Overbought' : Number(rsi) < 35 ? 'Oversold' : 'Neutral'})\n`;
  bodyText += `• Fast Dynamic Moving Average (14) : ${ma14}\n`;
  bodyText += `• Slow Baseline Moving Average (50) : ${ma50}\n`;
  bodyText += `• Bollinger Bands (20, 2)          : Upper ${bbUpper} | Lower ${bbLower}\n`;
  bodyText += `• Average True Range (ATR 14)      : ${atr}\n`;
  bodyText += `• Real-time Market Sentiment       : ${mood} (Bull/Bear Concordance: ${moodRatio})\n\n`;

  if (data.tradeHistory.length > 0) {
    bodyText += `4. RECENT CONTRACT EXECUTION LEDGER\n`;
    bodyText += `-------------------------------------------------------------------------\n`;
    data.tradeHistory.slice(0, 15).forEach((t, i) => {
      const pnl = t.profit !== undefined ? `${t.profit >= 0 ? '+' : ''}$${t.profit.toFixed(2)}` : 'Pending';
      const outcome = t.result === 'WIN' ? 'WIN' : t.result === 'LOSS' ? 'LOSS' : t.result;
      bodyText += `${i + 1}. [${new Date(t.timestamp).toLocaleTimeString()}] ${t.decision} ${t.symbol} | Stake: $${t.amount.toFixed(2)} | Outcome: ${outcome} (${pnl})\n`;
    });
    bodyText += `\n`;
  }

  bodyText += `=========================================================================\n`;
  bodyText += `SBAgent Autonomous Trading Engine • Engineered by Givan (Kingvan)\n`;
  bodyText += `Dynamic Kelly Criterion Position Sizing • Integrated Google Drive Exporter\n`;

  // 4. BatchUpdate document to write the report content
  const updateRes = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        {
          insertText: {
            location: {
              index: 1,
            },
            text: bodyText,
          },
        },
      ],
    }),
  });

  if (!updateRes.ok) {
    const errText = await updateRes.text();
    console.warn(`Failed to update doc text (${updateRes.status}):`, errText);
  }

  return { id: documentId, title, webViewLink };
}

/**
 * Lists the user's trading documents created in Google Drive.
 */
export async function listTradingDocs(accessToken: string): Promise<GoogleDocItem[]> {
  try {
    const query = encodeURIComponent("mimeType='application/vnd.google-apps.document' and trashed=false and name contains 'Deriv'");
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,webViewLink,createdTime,modifiedTime)&orderBy=modifiedTime desc&pageSize=10`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      // Fallback query for all docs if filter yields empty or restricted
      const generalUrl = `https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.document' and trashed=false&fields=files(id,name,webViewLink,createdTime,modifiedTime)&orderBy=modifiedTime desc&pageSize=10`;
      const fallbackRes = await fetch(generalUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!fallbackRes.ok) return [];
      const fallbackData = await fallbackRes.json();
      return fallbackData.files || [];
    }

    const data = await res.json();
    return data.files || [];
  } catch (err) {
    console.error('Error listing Google Docs:', err);
    return [];
  }
}
