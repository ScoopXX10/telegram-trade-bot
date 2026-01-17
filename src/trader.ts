import { BitunixClient } from './bitunix';
import { config } from './config';
import { TradeSignal, TradeResult, BitunixOrderParams } from './types';

/**
 * Calculate position quantity based on USDT size and entry price
 */
function calculateQuantity(
  positionSizeUsdt: number,
  entryPrice: number,
  leverage: number
): string {
  // Quantity = (USDT * Leverage) / Price
  const qty = (positionSizeUsdt * leverage) / entryPrice;
  // Round to appropriate decimals (8 for BTC, 4 for most others)
  return qty.toFixed(8);
}

/**
 * Generate a unique client order ID
 */
function generateClientId(): string {
  return `tg_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

/**
 * Execute a trade based on a parsed signal
 */
export async function executeTrade(
  client: BitunixClient,
  signal: TradeSignal,
  options?: {
    positionSizeUsdt?: number;
    leverage?: number;
    useMarketOrder?: boolean;
  }
): Promise<TradeResult> {
  const positionSize = options?.positionSizeUsdt || signal.positionSize || config.defaultPositionSizeUsdt;
  const leverage = options?.leverage || signal.leverage || config.defaultLeverage;
  const useMarketOrder = options?.useMarketOrder ?? false;

  try {
    // Calculate quantity
    const qty = calculateQuantity(positionSize, signal.entryPrice, leverage);

    // Determine order side (BUY for LONG, SELL for SHORT)
    const side = signal.side === 'LONG' ? 'BUY' : 'SELL';

    // Build order parameters
    const orderParams: BitunixOrderParams = {
      symbol: signal.symbol,
      side,
      orderType: useMarketOrder ? 'MARKET' : 'LIMIT',
      qty,
      tradeSide: 'OPEN',
      effect: 'GTC',
      clientId: generateClientId(),
      // Set TP to first target
      tpPrice: signal.takeProfits[0].toString(),
      tpStopType: 'MARK',
      tpOrderType: 'MARKET',
      // Set SL
      slPrice: signal.stopLoss.toString(),
      slStopType: 'MARK',
      slOrderType: 'MARKET',
    };

    // Add price for limit orders
    if (!useMarketOrder) {
      orderParams.price = signal.entryPrice.toString();
    }

    console.log('Placing order:', JSON.stringify(orderParams, null, 2));

    // Place the order using the provided client
    const response = await client.placeOrder(orderParams);

    if (response.code === 0) {
      console.log('Order placed successfully:', response.data);
      return {
        success: true,
        orderId: response.data.orderId,
        signal,
        executedAt: Date.now(),
      };
    } else {
      console.error('Order failed:', response.msg);
      return {
        success: false,
        error: response.msg || 'Unknown error',
        signal,
        executedAt: Date.now(),
      };
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Trade execution error:', errorMessage);
    return {
      success: false,
      error: errorMessage,
      signal,
      executedAt: Date.now(),
    };
  }
}

/**
 * Execute a market order immediately
 */
export async function executeMarketTrade(
  client: BitunixClient,
  signal: TradeSignal,
  positionSizeUsdt?: number
): Promise<TradeResult> {
  return executeTrade(client, signal, { positionSizeUsdt, useMarketOrder: true });
}

/**
 * Format trade result for display
 */
export function formatTradeResult(result: TradeResult): string {
  if (result.success) {
    return `
✅ **Trade Executed Successfully!**

📋 Order ID: \`${result.orderId}\`
🪙 Symbol: ${result.signal.symbol}
📊 Side: ${result.signal.side}
📍 Entry: ${result.signal.entryPrice}
🎯 TP: ${result.signal.takeProfits[0]}
🛑 SL: ${result.signal.stopLoss}
⏰ Time: ${new Date(result.executedAt).toLocaleString()}
    `.trim();
  } else {
    return `
❌ **Trade Failed**

🪙 Symbol: ${result.signal.symbol}
❗ Error: ${result.error}
⏰ Time: ${new Date(result.executedAt).toLocaleString()}
    `.trim();
  }
}
