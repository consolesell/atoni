import { z } from 'zod';

// Deriv WebSocket Inbound Message Schemas
export const DerivCandleSchema = z.object({
  epoch: z.number(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
});

export const DerivAuthorizeResponseSchema = z.object({
  msg_type: z.literal('authorize'),
  authorize: z.object({
    loginid: z.string(),
    balance: z.number().optional(),
    currency: z.string().optional(),
    is_virtual: z.union([z.number(), z.boolean()]).optional(),
    email: z.string().optional(),
    fullname: z.string().optional(),
    account_list: z.array(
      z.object({
        loginid: z.string(),
        is_virtual: z.union([z.number(), z.boolean()]).optional(),
        currency: z.string().optional(),
      })
    ).optional(),
  }).optional(),
  error: z.object({
    code: z.string().optional(),
    message: z.string().optional(),
  }).optional(),
});

export const DerivProposalOpenContractSchema = z.object({
  contract_id: z.union([z.string(), z.number()]).optional(),
  is_valid_to_sell: z.union([z.number(), z.boolean()]).optional(),
  is_expired: z.union([z.number(), z.boolean()]).optional(),
  is_sold: z.union([z.number(), z.boolean()]).optional(),
  profit: z.number().optional(),
  payout: z.number().optional(),
  status: z.string().optional(),
  current_spot: z.number().optional(),
  exit_tick: z.number().optional(),
  barrier: z.string().optional(),
});

// Gemini AI Prediction Payload Schema
export const GeminiPredictionPayloadSchema = z.object({
  symbol: z.string(),
  currentPrice: z.number(),
  decision: z.string(),
  compositeSignal: z.number(),
  regime: z.object({
    type: z.string(),
    confidence: z.number(),
    description: z.string().optional(),
  }),
  indicators: z.object({
    ma14: z.number().nullable().optional(),
    ma50: z.number().nullable().optional(),
    rsi: z.number().nullable().optional(),
    bb: z.any().optional(),
    volatility: z.number().optional(),
    pattern: z.any().optional(),
    mtf: z.any().optional(),
    mood: z.any().optional(),
  }),
  recentCandles: z.array(z.any()).optional(),
  activeAgent: z.string().optional(),
});

// Gemini Tool Call Execution Schema
export const GeminiToolCallSchema = z.object({
  tool: z.enum([
    'rotate_symbol',
    'tighten_stop',
    'adjust_stake_mode',
    'execute_trade',
    'export_journal',
    'propose_sbagent_update',
  ]),
  arguments: z.record(z.string(), z.any()),
});

// Trade Record Schema (for Firestore & Local Validation)
export const TradeRecordSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  mode: z.enum(['SIMULATION', 'LIVE']),
  symbol: z.string(),
  amount: z.number().positive(),
  decision: z.string(),
  result: z.enum(['WIN', 'LOSS', 'PENDING', 'SOLD']),
  profit: z.number(),
  payout: z.number().optional(),
  confidence: z.number(),
  compositeSignal: z.number().optional(),
  agent: z.string(),
  regime: z.string(),
  duration: z.number(),
  durationUnit: z.enum(['ticks', 'seconds', 'minutes']).optional(),
  isSniperTrade: z.boolean().optional(),
  confluenceScore: z.number().optional(),
  entryPrice: z.number(),
  exitPrice: z.number().optional(),
  targetPrice: z.number().optional(),
  stopPrice: z.number().optional(),
  exitReason: z.string().optional(),
  contract_id: z.union([z.string(), z.number()]).optional(),
});
