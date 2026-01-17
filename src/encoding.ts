import { TradeSignal } from './types';

/**
 * Encode a trade signal for use in Telegram deeplink
 * Format: symbol|side|entry|tp1,tp2,...|sl|leverage
 *
 * Example: SOLUSDT|L|142.4|145,148|141.6|10
 * Encoded: U09MVVNEVHxMfDE0Mi40fDE0NSwxNDh8MTQxLjZ8MTA
 */
export function encodeSignalForDeeplink(signal: TradeSignal): string {
  const parts = [
    signal.symbol,
    signal.side === 'LONG' ? 'L' : 'S',
    signal.entryPrice.toString(),
    signal.takeProfits.join(','),
    signal.stopLoss.toString(),
    signal.leverage?.toString() || '',
  ];

  const payload = parts.join('|');
  // Base64url encode (URL-safe, no padding)
  return Buffer.from(payload).toString('base64url');
}

/**
 * Decode a trade signal from Telegram deeplink start parameter
 */
export function decodeSignalFromDeeplink(encoded: string): TradeSignal | null {
  try {
    const payload = Buffer.from(encoded, 'base64url').toString('utf-8');
    const parts = payload.split('|');

    if (parts.length < 5) {
      console.error('Invalid deeplink: not enough parts');
      return null;
    }

    const [symbol, side, entry, tps, sl, leverage] = parts;

    // Validate required fields
    if (!symbol || !side || !entry || !tps || !sl) {
      console.error('Invalid deeplink: missing required fields');
      return null;
    }

    // Parse take profits (comma-separated)
    const takeProfits = tps.split(',').map(Number).filter(n => !isNaN(n));
    if (takeProfits.length === 0) {
      console.error('Invalid deeplink: no valid take profits');
      return null;
    }

    const entryPrice = parseFloat(entry);
    const stopLoss = parseFloat(sl);

    if (isNaN(entryPrice) || isNaN(stopLoss)) {
      console.error('Invalid deeplink: invalid entry or stop loss');
      return null;
    }

    return {
      symbol,
      side: side === 'L' ? 'LONG' : 'SHORT',
      entryPrice,
      takeProfits,
      stopLoss,
      leverage: leverage ? parseInt(leverage, 10) : undefined,
      raw: '[Decoded from deeplink]',
    };
  } catch (error) {
    console.error('Failed to decode deeplink:', error);
    return null;
  }
}

/**
 * Generate a full Telegram deeplink URL
 */
export function generateDeeplink(botUsername: string, signal: TradeSignal): string {
  const encoded = encodeSignalForDeeplink(signal);
  return `https://t.me/${botUsername}?start=${encoded}`;
}

/**
 * Check if a start parameter looks like an encoded signal
 * (as opposed to a regular /start command)
 */
export function isEncodedSignal(startParam: string | undefined): boolean {
  if (!startParam) return false;
  // Our encoded signals will be base64url which contains alphanumeric chars and -_
  // Regular start params are usually simple words
  return /^[A-Za-z0-9_-]{20,}$/.test(startParam);
}
