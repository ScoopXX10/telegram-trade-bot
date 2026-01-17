import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { BITUNIX_API_BASE } from './config';
import { BitunixOrderParams, BitunixResponse, BitunixOrderResponse } from './types';

/**
 * Bitunix API Client
 * Handles authentication and order placement
 */
export class BitunixClient {
  private apiKey: string;
  private apiSecret: string;
  private client: AxiosInstance;

  constructor(apiKey: string, apiSecret: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.client = axios.create({
      baseURL: BITUNIX_API_BASE,
      timeout: 10000,
    });
  }

  /**
   * Generate a 32-character random nonce
   */
  private generateNonce(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Generate signature according to Bitunix API spec:
   * 1. digest = SHA256(nonce + timestamp + api-key + queryParams + body)
   * 2. sign = SHA256(digest + secretKey)
   */
  private generateSignature(
    nonce: string,
    timestamp: string,
    queryParams: string,
    body: string
  ): string {
    // First hash: SHA256(nonce + timestamp + api-key + queryParams + body)
    const preDigest = nonce + timestamp + this.apiKey + queryParams + body;
    const digest = crypto.createHash('sha256').update(preDigest).digest('hex');

    // Second hash: SHA256(digest + secretKey)
    const sign = crypto.createHash('sha256').update(digest + this.apiSecret).digest('hex');

    return sign;
  }

  /**
   * Build headers for authenticated request
   */
  private buildHeaders(queryParams: string, body: string): Record<string, string> {
    const nonce = this.generateNonce();
    const timestamp = Date.now().toString();
    const sign = this.generateSignature(nonce, timestamp, queryParams, body);

    return {
      'api-key': this.apiKey,
      'nonce': nonce,
      'timestamp': timestamp,
      'sign': sign,
      'language': 'en-US',
      'Content-Type': 'application/json',
    };
  }

  /**
   * Place an order on Bitunix
   */
  async placeOrder(params: BitunixOrderParams): Promise<BitunixResponse<BitunixOrderResponse>> {
    const endpoint = '/api/v1/futures/trade/place_order';
    const body = JSON.stringify(params);
    const headers = this.buildHeaders('', body);

    try {
      const response = await this.client.post<BitunixResponse<BitunixOrderResponse>>(
        endpoint,
        params,
        { headers }
      );
      return response.data;
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response) {
        console.error('Bitunix API error:', error.response.data);
        return error.response.data as BitunixResponse<BitunixOrderResponse>;
      }
      throw error;
    }
  }

  /**
   * Place a position TP/SL order
   */
  async placePositionTpSl(params: {
    symbol: string;
    positionId: string;
    tpPrice?: string;
    tpStopType?: 'LAST' | 'MARK';
    tpOrderType?: 'LIMIT' | 'MARKET';
    slPrice?: string;
    slStopType?: 'LAST' | 'MARK';
    slOrderType?: 'LIMIT' | 'MARKET';
  }): Promise<BitunixResponse<unknown>> {
    const endpoint = '/api/v1/futures/tpsl/position/place_order';
    const body = JSON.stringify(params);
    const headers = this.buildHeaders('', body);

    try {
      const response = await this.client.post(endpoint, params, { headers });
      return response.data as BitunixResponse<unknown>;
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response) {
        console.error('Bitunix TP/SL API error:', error.response.data);
        return error.response.data as BitunixResponse<unknown>;
      }
      throw error;
    }
  }

  /**
   * Get current ticker price for a symbol
   */
  async getTickerPrice(symbol: string): Promise<number | null> {
    const endpoint = '/api/v1/futures/market/tickers';

    try {
      const response = await this.client.get(endpoint, {
        params: { symbol }
      });
      const data = response.data as BitunixResponse<Array<{ symbol: string; lastPrice: string }>>;
      if (data.code === 0 && data.data && data.data.length > 0) {
        const ticker = data.data.find(t => t.symbol === symbol);
        return ticker ? parseFloat(ticker.lastPrice) : null;
      }
      return null;
    } catch (error) {
      console.error('Failed to get ticker price:', error);
      return null;
    }
  }

  /**
   * Get account balance
   */
  async getBalance(): Promise<BitunixResponse<unknown>> {
    const endpoint = '/api/v1/futures/account/balance';
    const headers = this.buildHeaders('', '');

    try {
      const response = await this.client.get(endpoint, { headers });
      return response.data as BitunixResponse<unknown>;
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response) {
        return error.response.data as BitunixResponse<unknown>;
      }
      throw error;
    }
  }

  /**
   * Set leverage for a trading pair
   */
  async setLeverage(symbol: string, leverage: number): Promise<BitunixResponse<unknown>> {
    const endpoint = '/api/v1/futures/account/change_leverage';
    const params = {
      symbol,
      leverage,
      marginCoin: 'USDT',
    };
    const body = JSON.stringify(params);
    const headers = this.buildHeaders('', body);

    try {
      const response = await this.client.post(endpoint, params, { headers });
      return response.data as BitunixResponse<unknown>;
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response) {
        console.error('Bitunix set leverage error:', error.response.data);
        return error.response.data as BitunixResponse<unknown>;
      }
      throw error;
    }
  }
}

/**
 * Create a Bitunix client for a specific user's API credentials
 */
export function createBitunixClient(apiKey: string, apiSecret: string): BitunixClient {
  return new BitunixClient(apiKey, apiSecret);
}
