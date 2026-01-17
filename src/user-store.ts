import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { config } from './config';

/**
 * User data structure (decrypted)
 */
export interface UserData {
  odontechId: number;
  odontechUsername?: string;
  bitunixApiKey: string;
  bitunixApiSecret: string;
  defaultLeverage?: number;
  defaultPositionSizeUsdt?: number;
  registeredAt: number;
}

/**
 * Encrypted user data as stored in JSON
 */
interface EncryptedUserData {
  odontechId: number;
  odontechUsername?: string;
  encryptedApiKey: string;
  encryptedApiSecret: string;
  defaultLeverage?: number;
  defaultPositionSizeUsdt?: number;
  registeredAt: number;
  iv: string; // Initialization vector for decryption
}

interface UserStore {
  users: Record<string, EncryptedUserData>;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const ALGORITHM = 'aes-256-gcm';

/**
 * Ensure data directory exists
 */
function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Load the user store from disk
 */
function loadStore(): UserStore {
  ensureDataDir();

  if (!fs.existsSync(USERS_FILE)) {
    return { users: {} };
  }

  try {
    const data = fs.readFileSync(USERS_FILE, 'utf-8');
    return JSON.parse(data) as UserStore;
  } catch (error) {
    console.error('Failed to load user store:', error);
    return { users: {} };
  }
}

/**
 * Save the user store to disk
 */
function saveStore(store: UserStore): void {
  ensureDataDir();
  fs.writeFileSync(USERS_FILE, JSON.stringify(store, null, 2));
}

/**
 * Encrypt a string using AES-256-GCM
 */
function encrypt(text: string, iv: Buffer): string {
  const key = Buffer.from(config.encryptionKey, 'hex');
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Append auth tag for GCM
  const authTag = cipher.getAuthTag().toString('hex');

  return encrypted + ':' + authTag;
}

/**
 * Decrypt a string using AES-256-GCM
 */
function decrypt(encryptedData: string, ivHex: string): string {
  const key = Buffer.from(config.encryptionKey, 'hex');
  const iv = Buffer.from(ivHex, 'hex');

  const [encrypted, authTag] = encryptedData.split(':');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Check if a user is registered
 */
export function isUserRegistered(odontechId: number): boolean {
  const store = loadStore();
  return odontechId.toString() in store.users;
}

/**
 * Get user data (decrypted)
 */
export function getUser(odontechId: number): UserData | null {
  const store = loadStore();
  const encrypted = store.users[odontechId.toString()];

  if (!encrypted) {
    return null;
  }

  try {
    return {
      odontechId: encrypted.odontechId,
      odontechUsername: encrypted.odontechUsername,
      bitunixApiKey: decrypt(encrypted.encryptedApiKey, encrypted.iv),
      bitunixApiSecret: decrypt(encrypted.encryptedApiSecret, encrypted.iv),
      defaultLeverage: encrypted.defaultLeverage,
      defaultPositionSizeUsdt: encrypted.defaultPositionSizeUsdt,
      registeredAt: encrypted.registeredAt,
    };
  } catch (error) {
    console.error('Failed to decrypt user data:', error);
    return null;
  }
}

/**
 * Save user data (encrypts sensitive fields)
 */
export function saveUser(userData: UserData): void {
  const store = loadStore();

  // Generate random IV for this user
  const iv = crypto.randomBytes(12); // 96 bits for GCM

  const encrypted: EncryptedUserData = {
    odontechId: userData.odontechId,
    odontechUsername: userData.odontechUsername,
    encryptedApiKey: encrypt(userData.bitunixApiKey, iv),
    encryptedApiSecret: encrypt(userData.bitunixApiSecret, iv),
    defaultLeverage: userData.defaultLeverage,
    defaultPositionSizeUsdt: userData.defaultPositionSizeUsdt,
    registeredAt: userData.registeredAt,
    iv: iv.toString('hex'),
  };

  store.users[userData.odontechId.toString()] = encrypted;
  saveStore(store);
}

/**
 * Delete a user's data
 */
export function deleteUser(odontechId: number): boolean {
  const store = loadStore();
  const key = odontechId.toString();

  if (key in store.users) {
    delete store.users[key];
    saveStore(store);
    return true;
  }

  return false;
}

/**
 * Update user settings (non-sensitive fields only)
 */
export function updateUserSettings(
  odontechId: number,
  settings: { defaultLeverage?: number; defaultPositionSizeUsdt?: number }
): boolean {
  const store = loadStore();
  const key = odontechId.toString();

  if (!(key in store.users)) {
    return false;
  }

  if (settings.defaultLeverage !== undefined) {
    store.users[key].defaultLeverage = settings.defaultLeverage;
  }

  if (settings.defaultPositionSizeUsdt !== undefined) {
    store.users[key].defaultPositionSizeUsdt = settings.defaultPositionSizeUsdt;
  }

  saveStore(store);
  return true;
}

/**
 * Get count of registered users
 */
export function getUserCount(): number {
  const store = loadStore();
  return Object.keys(store.users).length;
}
