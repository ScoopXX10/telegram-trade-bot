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

function getAdminUserIds(): number[] {
  const value = process.env['ADMIN_USER_IDS'];
  if (!value) return [];
  return value.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
}

export const config: BotConfig = {
  telegramToken: getEnvVar('TELEGRAM_BOT_TOKEN'),
  botUsername: getEnvVar('BOT_USERNAME'),
  encryptionKey: getEnvVar('ENCRYPTION_KEY'),
  defaultLeverage: getEnvNumber('DEFAULT_LEVERAGE', 10),
  defaultPositionSizeUsdt: getEnvNumber('DEFAULT_POSITION_SIZE_USDT', 100),
  adminUserIds: getAdminUserIds(),
};

// Bitunix API base URL
export const BITUNIX_API_BASE = 'https://fapi.bitunix.com';
