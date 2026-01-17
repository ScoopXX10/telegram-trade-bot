// Trade signal parsed from Telegram messages
export interface TradeSignal {
  symbol: string;        // e.g., "BTCUSDT"
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  takeProfits: number[]; // Can have multiple TPs
  stopLoss: number;
  leverage?: number;
  positionSize?: number; // in USDT
  raw: string;           // Original message for reference
}

// Bitunix order parameters
export interface BitunixOrderParams {
  symbol: string;
  side: 'BUY' | 'SELL';
  orderType: 'LIMIT' | 'MARKET';
  qty: string;
  price?: string;
  tradeSide: 'OPEN' | 'CLOSE';
  effect?: 'GTC' | 'IOC' | 'FOK' | 'POST_ONLY';
  clientId?: string;
  reduceOnly?: boolean;
  // TP/SL parameters
  tpPrice?: string;
  tpStopType?: 'LAST' | 'MARK';
  tpOrderType?: 'LIMIT' | 'MARKET';
  tpOrderPrice?: string;
  slPrice?: string;
  slStopType?: 'LAST' | 'MARK';
  slOrderType?: 'LIMIT' | 'MARKET';
  slOrderPrice?: string;
}

// Bitunix API response
export interface BitunixResponse<T = unknown> {
  code: number;
  msg: string;
  data: T;
}

export interface BitunixOrderResponse {
  orderId: string;
  clientId: string;
}

// Trade execution result
export interface TradeResult {
  success: boolean;
  orderId?: string;
  error?: string;
  signal: TradeSignal;
  executedAt: number;
}

// Bot configuration
export interface BotConfig {
  telegramToken: string;
  botUsername: string;
  encryptionKey: string;
  defaultLeverage: number;
  defaultPositionSizeUsdt: number;
  adminUserIds: number[]; // Admins can manage the bot
}

// Registration state for multi-step registration flow
export interface RegistrationState {
  step: 'awaiting_api_key' | 'awaiting_api_secret';
  apiKey?: string;
}
