import { TradeSignal } from './types';

/**
 * Parse trade signals from various common formats
 *
 * Supported formats (from Streets X signals):
 *
 * SOL LONG SCALP
 * Leverage: 10-25x
 * Entry: 142.4
 * Stop Loss: 141.6
 * Take Profit: 145-148
 *
 * AVAX LONG
 * Leverage: 10-25x
 * Entry: 13.6
 * Stop Loss: 13.40
 * Take Profit: 14.23
 *
 * BTC LONG
 * Leverage: 10-25x
 * Entry: 95,093 / Current Price 95,337.89
 * Stop Loss: 94,861.68
 * Take Profit: 96,117.71
 */

/**
 * Clean number string - remove commas and parse
 */
function parseNumber(str: string): number {
  return parseFloat(str.replace(/,/g, ''));
}

/**
 * Parse a trade signal from a message (Streets X format)
 */
export function parseTradeSignal(message: string): TradeSignal | null {
  const lines = message.split('\n').map(l => l.trim()).filter(l => l);

  // Extract symbol and side from first line (e.g., "SOL LONG SCALP" or "BTC LONG")
  const headerLine = lines[0] || '';
  const headerMatch = headerLine.match(/^([A-Z]{2,10})\s+(LONG|SHORT)/i);

  if (!headerMatch) {
    console.log('No symbol/side found in header:', headerLine);
    return null;
  }

  let symbol = headerMatch[1].toUpperCase();
  if (!symbol.endsWith('USDT')) {
    symbol += 'USDT';
  }
  const side: 'LONG' | 'SHORT' = headerMatch[2].toUpperCase() === 'LONG' ? 'LONG' : 'SHORT';

  // Extract leverage (e.g., "Leverage: 10-25x" -> use the lower value for safety)
  let leverage: number | undefined;
  const leverageLine = lines.find(l => /leverage/i.test(l));
  if (leverageLine) {
    // Match "10-25x" or "10x" or just "10"
    const levMatch = leverageLine.match(/(\d+)(?:\s*-\s*\d+)?x?/i);
    if (levMatch) {
      leverage = parseInt(levMatch[1], 10);
    }
  }

  // Extract entry price (e.g., "Entry: 142.4" or "Entry: 95,093 / Current Price 95,337.89")
  let entryPrice: number | null = null;
  const entryLine = lines.find(l => /entry/i.test(l));
  if (entryLine) {
    // Match first number after "Entry:" (before any "/" or "Current Price")
    const entryMatch = entryLine.match(/entry[:\s]*([\d,]+\.?\d*)/i);
    if (entryMatch) {
      entryPrice = parseNumber(entryMatch[1]);
    }
  }

  // Extract stop loss (e.g., "Stop Loss: 141.6")
  let stopLoss: number | null = null;
  const slLine = lines.find(l => /stop\s*loss/i.test(l));
  if (slLine) {
    const slMatch = slLine.match(/stop\s*loss[:\s]*([\d,]+\.?\d*)/i);
    if (slMatch) {
      stopLoss = parseNumber(slMatch[1]);
    }
  }

  // Extract take profit(s) (e.g., "Take Profit: 145-148" or "Take Profit: 14.23")
  const takeProfits: number[] = [];
  const tpLine = lines.find(l => /take\s*profit/i.test(l));
  if (tpLine) {
    // Check for range format "145-148"
    const rangeMatch = tpLine.match(/take\s*profit[:\s]*([\d,]+\.?\d*)\s*-\s*([\d,]+\.?\d*)/i);
    if (rangeMatch) {
      // Use both values as TP targets
      takeProfits.push(parseNumber(rangeMatch[1]));
      takeProfits.push(parseNumber(rangeMatch[2]));
    } else {
      // Single TP value
      const singleMatch = tpLine.match(/take\s*profit[:\s]*([\d,]+\.?\d*)/i);
      if (singleMatch) {
        takeProfits.push(parseNumber(singleMatch[1]));
      }
    }
  }

  // Fallback: try generic patterns if structured format didn't work
  if (!entryPrice || takeProfits.length === 0 || !stopLoss) {
    return parseTradeSignalGeneric(message);
  }

  // Validate we have minimum required data
  if (!entryPrice) {
    console.log('Could not determine entry price');
    return null;
  }

  if (takeProfits.length === 0) {
    console.log('No take profit levels found');
    return null;
  }

  if (!stopLoss) {
    console.log('No stop loss found');
    return null;
  }

  // Sort TPs appropriately
  const sortedTPs = takeProfits.sort((a, b) => side === 'LONG' ? a - b : b - a);

  return {
    symbol,
    side,
    entryPrice,
    takeProfits: sortedTPs,
    stopLoss,
    leverage,
    raw: message,
  };
}

/**
 * Generic parser for other signal formats
 */
function parseTradeSignalGeneric(message: string): TradeSignal | null {
  const text = message.toUpperCase();

  // Extract symbol
  const symbolMatch = text.match(/\b([A-Z]{2,10})(USDT|USD|PERP)?\b/i);
  if (!symbolMatch) {
    console.log('No symbol found in message');
    return null;
  }
  let symbol = symbolMatch[1];
  if (!symbol.endsWith('USDT')) {
    symbol += 'USDT';
  }

  // Extract side
  const sideMatch = text.match(/\b(LONG|SHORT|BUY|SELL)\b/i);
  if (!sideMatch) {
    console.log('No side found in message');
    return null;
  }
  const sideRaw = sideMatch[1].toUpperCase();
  const side: 'LONG' | 'SHORT' = (sideRaw === 'BUY' || sideRaw === 'LONG') ? 'LONG' : 'SHORT';

  // Extract entry
  let entryPrice: number | null = null;
  const entryMatch = message.match(/(?:entry|@|price|enter)[:\s]*([\d,]+\.?\d*)/i);
  if (entryMatch) {
    entryPrice = parseNumber(entryMatch[1]);
  }

  // Extract TPs
  const takeProfits: number[] = [];
  const tpMatches = message.matchAll(/(?:tp|take\s*profit|target)\s*\d*[:\s]*([\d,]+\.?\d*)/gi);
  for (const match of tpMatches) {
    const tp = parseNumber(match[1]);
    if (tp > 0 && !takeProfits.includes(tp)) {
      takeProfits.push(tp);
    }
  }

  // Extract SL
  let stopLoss: number | null = null;
  const slMatch = message.match(/(?:sl|stop\s*loss|stop)[:\s]*([\d,]+\.?\d*)/i);
  if (slMatch) {
    stopLoss = parseNumber(slMatch[1]);
  }

  // Extract leverage
  let leverage: number | undefined;
  const levMatch = message.match(/(?:lev|leverage)[:\s]*(\d+)/i);
  if (levMatch) {
    leverage = parseInt(levMatch[1], 10);
  }

  // Validate
  if (!entryPrice || takeProfits.length === 0 || !stopLoss) {
    console.log('Missing required fields - entry:', entryPrice, 'TPs:', takeProfits, 'SL:', stopLoss);
    return null;
  }

  return {
    symbol,
    side,
    entryPrice,
    takeProfits: takeProfits.sort((a, b) => side === 'LONG' ? a - b : b - a),
    stopLoss,
    leverage,
    raw: message,
  };
}

/**
 * Format a trade signal for display
 */
export function formatTradeSignal(signal: TradeSignal): string {
  const arrow = signal.side === 'LONG' ? '📈' : '📉';
  const tps = signal.takeProfits.map((tp, i) => `TP${i + 1}: ${tp}`).join(' | ');

  return `
${arrow} **${signal.symbol} ${signal.side}**

📍 Entry: ${signal.entryPrice}
🎯 ${tps}
🛑 SL: ${signal.stopLoss}
${signal.leverage ? `⚡ Leverage: ${signal.leverage}x` : ''}
  `.trim();
}

/**
 * Calculate risk/reward ratio
 */
export function calculateRiskReward(signal: TradeSignal): number {
  const risk = Math.abs(signal.entryPrice - signal.stopLoss);
  const reward = Math.abs(signal.takeProfits[0] - signal.entryPrice);
  return reward / risk;
}
