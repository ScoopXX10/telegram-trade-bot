# Telegram Trade Bot for Bitunix

A Telegram bot that enables one-click trade execution on Bitunix futures. Reduce latency by parsing trade signals directly in Telegram and executing them instantly.

## Features

- **One-Click Trading**: Parse trade signals and execute with a single button click
- **Smart Signal Parsing**: Supports multiple common signal formats
- **Limit & Market Orders**: Choose between limit orders at entry or instant market execution
- **TP/SL Automation**: Automatically sets take profit and stop loss
- **User Authorization**: Restrict trading to specific Telegram user IDs
- **Auto-Execute Mode**: Optional automatic trade execution without confirmation

## Setup

### 1. Create a Telegram Bot

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot` and follow the prompts
3. Copy the bot token

### 2. Get Bitunix API Keys

1. Log into [Bitunix](https://www.bitunix.com)
2. Go to API Management
3. Create a new API key with **Futures Trading** permissions
4. Copy the API Key and Secret Key

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
BITUNIX_API_KEY=your_bitunix_api_key
BITUNIX_API_SECRET=your_bitunix_api_secret

# Trading defaults
DEFAULT_LEVERAGE=10
DEFAULT_POSITION_SIZE_USDT=100

# Your Telegram user ID (find it by messaging @userinfobot)
ALLOWED_USER_IDS=123456789

# Set to true for auto-execution (BE CAREFUL!)
ENABLE_AUTO_EXECUTE=false
```

### 4. Install & Run

```bash
npm install
npm run build
npm start
```

For development:
```bash
npm run dev
```

## Usage

### Signal Formats Supported

The bot can parse these common formats:

```
BTC LONG 95000 TP 96000 97000 SL 94000

BTCUSDT Long Entry: 95000 TP1: 96000 TP2: 97000 SL: 94000

🔥 ETH SHORT @ 3500 | TP: 3400, 3300 | SL: 3600

SOL long 180 tp 185 190 sl 175 10x
```

### Bot Commands

- `/start` - Show welcome message and your user ID
- `/help` - Show supported signal formats
- `/balance` - Check your Bitunix account balance
- `/parse <signal>` - Parse a signal without executing

### Executing Trades

1. Forward or paste a trade signal to the bot
2. The bot will parse and display the trade details
3. Click **"📍 Limit Order"** or **"⚡ Market Order"** to execute
4. Click **"❌ Cancel"** to abort

## Security

- **Never share your `.env` file** - it contains your API secrets
- **Use ALLOWED_USER_IDS** - restrict who can execute trades
- **Test with small amounts first** - verify the bot works correctly
- **Auto-execute is OFF by default** - only enable if you trust your signal sources

## Project Structure

```
telegram-trade-bot/
├── src/
│   ├── index.ts      # Entry point
│   ├── bot.ts        # Telegram bot logic
│   ├── parser.ts     # Trade signal parser
│   ├── trader.ts     # Trade execution
│   ├── bitunix.ts    # Bitunix API client
│   ├── config.ts     # Configuration
│   └── types.ts      # TypeScript types
├── .env.example      # Environment template
├── package.json
└── tsconfig.json
```

## Disclaimer

This bot executes real trades with real money. Use at your own risk. Always:
- Test with small positions first
- Verify signals before executing
- Keep your API keys secure
- Never enable auto-execute without careful consideration
