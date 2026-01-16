import { Telegraf, Context, Markup } from 'telegraf';
import { Message } from 'telegraf/types';
import { config } from './config';
import { parseTradeSignal, formatTradeSignal, calculateRiskReward } from './parser';
import { executeTrade, executeMarketTrade, formatTradeResult } from './trader';
import { TradeSignal } from './types';

// Store pending signals awaiting confirmation
const pendingSignals = new Map<number, TradeSignal>();

// Create bot instance
const bot = new Telegraf(config.telegramToken);

/**
 * Check if user is authorized to execute trades
 */
function isAuthorized(userId: number | undefined): boolean {
  if (!userId) return false;
  // If no allowed users configured, allow all
  if (config.allowedUserIds.length === 0) return true;
  return config.allowedUserIds.includes(userId);
}

/**
 * Extract user ID from context
 */
function getUserId(ctx: Context): number | undefined {
  return ctx.from?.id;
}

/**
 * Start command handler
 */
bot.command('start', async (ctx) => {
  const userId = getUserId(ctx);
  const isAuth = isAuthorized(userId);

  await ctx.reply(`
🤖 **Bitunix Trade Bot**

Welcome! I help you execute trades on Bitunix with one click.

**Commands:**
/help - Show this help message
/balance - Check your Bitunix balance
/parse <signal> - Parse a trade signal without executing

**How to use:**
1. Forward or paste a trade signal
2. I'll parse it and show you the details
3. Click "Execute Trade" to place the order

${isAuth ? '✅ You are authorized to execute trades' : '⚠️ You are not authorized to execute trades'}

Your User ID: \`${userId}\`
  `, { parse_mode: 'Markdown' });
});

/**
 * Help command
 */
bot.command('help', async (ctx) => {
  await ctx.reply(`
📚 **Trade Signal Formats**

I can parse these formats:

\`BTC LONG 95000 TP 96000 97000 SL 94000\`

\`BTCUSDT Long Entry: 95000 TP1: 96000 TP2: 97000 SL: 94000\`

\`🔥 ETH SHORT @ 3500 | TP: 3400, 3300 | SL: 3600\`

**Required info:**
- Symbol (BTC, ETH, etc.)
- Side (LONG/SHORT)
- Entry price
- Take profit (at least one)
- Stop loss

**Optional:**
- Leverage (e.g., "10x")
- Multiple take profits
  `, { parse_mode: 'Markdown' });
});

/**
 * Balance command
 */
bot.command('balance', async (ctx) => {
  if (!isAuthorized(getUserId(ctx))) {
    await ctx.reply('⚠️ You are not authorized to use this bot.');
    return;
  }

  await ctx.reply('⏳ Fetching balance...');

  try {
    const { bitunixClient } = await import('./bitunix');
    const balance = await bitunixClient.getBalance();

    if (balance.code === 0) {
      await ctx.reply(`💰 Balance fetched successfully!\n\n\`${JSON.stringify(balance.data, null, 2)}\``, {
        parse_mode: 'Markdown'
      });
    } else {
      await ctx.reply(`❌ Failed to fetch balance: ${balance.msg}`);
    }
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    await ctx.reply(`❌ Error: ${errorMsg}`);
  }
});

/**
 * Parse command - parse without executing
 */
bot.command('parse', async (ctx) => {
  const message = ctx.message as Message.TextMessage;
  const text = message.text.replace('/parse', '').trim();

  if (!text) {
    await ctx.reply('Please provide a trade signal to parse.\n\nExample: `/parse BTC LONG 95000 TP 96000 SL 94000`', {
      parse_mode: 'Markdown'
    });
    return;
  }

  const signal = parseTradeSignal(text);

  if (!signal) {
    await ctx.reply('❌ Could not parse trade signal. Please check the format.');
    return;
  }

  const rr = calculateRiskReward(signal);
  const formatted = formatTradeSignal(signal);

  await ctx.reply(`
✅ **Signal Parsed Successfully**

${formatted}

📊 Risk/Reward: ${rr.toFixed(2)}:1
  `, { parse_mode: 'Markdown' });
});

/**
 * Handle callback queries (button presses)
 */
bot.on('callback_query', async (ctx) => {
  const callbackQuery = ctx.callbackQuery;
  if (!('data' in callbackQuery)) return;

  const data = callbackQuery.data;
  const userId = callbackQuery.from.id;

  if (!isAuthorized(userId)) {
    await ctx.answerCbQuery('⚠️ You are not authorized to execute trades.');
    return;
  }

  const signal = pendingSignals.get(userId);
  if (!signal) {
    await ctx.answerCbQuery('⚠️ No pending signal found. Please send a new signal.');
    return;
  }

  if (data === 'execute_limit') {
    await ctx.answerCbQuery('⏳ Placing limit order...');
    const result = await executeTrade(signal);
    await ctx.editMessageText(formatTradeResult(result), { parse_mode: 'Markdown' });
    pendingSignals.delete(userId);
  } else if (data === 'execute_market') {
    await ctx.answerCbQuery('⏳ Placing market order...');
    const result = await executeMarketTrade(signal);
    await ctx.editMessageText(formatTradeResult(result), { parse_mode: 'Markdown' });
    pendingSignals.delete(userId);
  } else if (data === 'cancel') {
    await ctx.answerCbQuery('Trade cancelled.');
    await ctx.editMessageText('❌ Trade cancelled.');
    pendingSignals.delete(userId);
  }
});

/**
 * Handle text messages - try to parse as trade signals
 */
bot.on('text', async (ctx) => {
  const message = ctx.message;
  const text = message.text;
  const userId = getUserId(ctx);

  // Skip commands
  if (text.startsWith('/')) return;

  // Try to parse as trade signal
  const signal = parseTradeSignal(text);

  if (!signal) {
    // Not a valid signal, ignore
    return;
  }

  const rr = calculateRiskReward(signal);
  const formatted = formatTradeSignal(signal);

  if (!isAuthorized(userId)) {
    await ctx.reply(`
${formatted}

📊 Risk/Reward: ${rr.toFixed(2)}:1

⚠️ You are not authorized to execute trades.
Your User ID: \`${userId}\`
    `, { parse_mode: 'Markdown' });
    return;
  }

  // Store pending signal
  if (userId) {
    pendingSignals.set(userId, signal);
  }

  // Auto-execute if enabled
  if (config.autoExecute) {
    await ctx.reply('⏳ Auto-executing trade...');
    const result = await executeTrade(signal);
    await ctx.reply(formatTradeResult(result), { parse_mode: 'Markdown' });
    if (userId) {
      pendingSignals.delete(userId);
    }
    return;
  }

  // Show confirmation with buttons
  await ctx.reply(`
${formatted}

📊 Risk/Reward: ${rr.toFixed(2)}:1
💵 Position Size: $${config.defaultPositionSizeUsdt}
⚡ Leverage: ${signal.leverage || config.defaultLeverage}x

**Choose execution method:**
  `, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [
        Markup.button.callback('📍 Limit Order', 'execute_limit'),
        Markup.button.callback('⚡ Market Order', 'execute_market'),
      ],
      [Markup.button.callback('❌ Cancel', 'cancel')],
    ]),
  });
});

/**
 * Error handler
 */
bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  ctx.reply('❌ An error occurred. Please try again.');
});

/**
 * Start the bot
 */
export async function startBot() {
  console.log('🤖 Starting Telegram Trade Bot...');
  console.log(`   Auto-execute: ${config.autoExecute ? 'ENABLED' : 'DISABLED'}`);
  console.log(`   Default leverage: ${config.defaultLeverage}x`);
  console.log(`   Default position size: $${config.defaultPositionSizeUsdt}`);
  console.log(`   Allowed users: ${config.allowedUserIds.length > 0 ? config.allowedUserIds.join(', ') : 'ALL'}`);

  await bot.launch();
  console.log('✅ Bot is running!');

  // Graceful shutdown
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

export { bot };
