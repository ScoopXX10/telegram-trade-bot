import dotenv from 'dotenv';
import { BotConfig } from './types';

dotenv.config();

function getEnvVar(name: string, required: boolean = true): string {
  const value = process.env[name];
  if (required && !value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value || '';
}

function getEnvNumber(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (!value) return defaultValue;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

function getEnvBoolean(name: string, defaultValue: boolean): boolean {
  const value = process.env[name]?.toLowerCase();
  if (!value) return defaultValue;
  return value === 'true' || value === '1';
}

function getAllowedUserIds(): number[] {
  const value = process.env['ALLOWED_USER_IDS'];
  if (!value) return [];
  return value.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
}

export const config: BotConfig = {
  telegramToken: getEnvVar('TELEGRAM_BOT_TOKEN'),
  bitunixApiKey: getEnvVar('BITUNIX_API_KEY'),
  bitunixApiSecret: getEnvVar('BITUNIX_API_SECRET'),
  defaultLeverage: getEnvNumber('DEFAULT_LEVERAGE', 10),
  defaultPositionSizeUsdt: getEnvNumber('DEFAULT_POSITION_SIZE_USDT', 100),
  allowedUserIds: getAllowedUserIds(),
  autoExecute: getEnvBoolean('ENABLE_AUTO_EXECUTE', false),
};

// Bitunix API base URL
export const BITUNIX_API_BASE = 'https://fapi.bitunix.com';
