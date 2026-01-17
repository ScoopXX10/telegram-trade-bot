import { Telegraf, Markup } from 'telegraf';
import { Message } from 'telegraf/types';
import { config } from './config';
import { parseTradeSignal, formatTradeSignal, calculateRiskReward } from './parser';
import { executeTrade, executeMarketTrade, formatTradeResult } from './trader';
import { createBitunixClient, BitunixClient } from './bitunix';
import { isUserRegistered, getUser, saveUser, deleteUser, getUserCount, updateUserSettings } from './user-store';
import { encodeSignalForDeeplink, decodeSignalFromDeeplink, isEncodedSignal, generateDeeplink } from './encoding';
import { TradeSignal, RegistrationState } from './types';

// Store pending signals awaiting confirmation (userId -> signal)
const pendingSignals = new Map<number, TradeSignal>();

// Store registration state for users in the middle of registering
const registrationStates = new Map<number, RegistrationState>();

// Create bot instance
const bot = new Telegraf(config.telegramToken);

/**
 * Check if user is an admin
 */
function isAdmin(userId: number | undefined): boolean {
  if (!userId) return false;
  if (config.adminUserIds.length === 0) return false;
  return config.adminUserIds.includes(userId);
}

/**
 * Check if chat is a private DM
 */
function isPrivateChat(chatType: string): boolean {
  return chatType === 'private';
}

/**
 * Check if chat is a group
 */
function isGroupChat(chatType: string): boolean {
  return chatType === 'group' || chatType === 'supergroup';
}

/**
 * Get or create a Bitunix client for a user
 */
function getUserClient(userId: number): BitunixClient | null {
  const user = getUser(userId);
  if (!user) return null;
  return createBitunixClient(user.bitunixApiKey, user.bitunixApiSecret);
}

// ============================================
// COMMAND HANDLERS
// ============================================

/**
 * Start command - handles both welcome and deeplink signals
 */
bot.command('start', async (ctx) => {
  const userId = ctx.from?.id;
  const chatType = ctx.chat.type;

  if (!userId) return;

  // Only handle /start in private chats
  if (!isPrivateChat(chatType)) {
    return;
  }

  // Check for deeplink payload (signal data)
  const payload = ctx.message.text.split(' ')[1];

  if (payload && isEncodedSignal(payload)) {
    // Decode the signal from deeplink
    const signal = decodeSignalFromDeeplink(payload);

    if (!signal) {
      await ctx.reply('❌ Invalid trade signal. The link may be corrupted.');
      return;
    }

    // Check if user is registered
    if (!isUserRegistered(userId)) {
      await ctx.reply(`
⚠️ **You're not registered yet!**

To execute trades, you need to register your Bitunix API keys first.

Use /register to get started.

Your User ID: \`${userId}\`
      `, { parse_mode: 'Markdown' });
      return;
    }

    // Store the signal and show confirmation
    pendingSignals.set(userId, signal);

    const user = getUser(userId);
    const rr = calculateRiskReward(signal);
    const formatted = formatTradeSignal(signal);
    const leverage = signal.leverage || user?.defaultLeverage || config.defaultLeverage;
    const positionSize = user?.defaultPositionSizeUsdt || config.defaultPositionSizeUsdt;

    await ctx.reply(`
📈 **Incoming Trade Signal**

${formatted}

📊 Risk/Reward: ${rr.toFixed(2)}:1
💵 Position Size: $${positionSize}
⚡ Leverage: ${leverage}x

**Confirm execution:**
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
    return;
  }

  // Regular /start - show welcome message
  const isRegistered = isUserRegistered(userId);

  await ctx.reply(`
🤖 **Bitunix Trade Bot**

Welcome! I help you execute trades on Bitunix from your trading groups.

**Status:** ${isRegistered ? '✅ Registered' : '❌ Not registered'}

**Commands:**
/register - Set up your Bitunix API keys
/status - Check your registration status
/settings - View your current settings
/balance - Check your Bitunix balance
/delete - Remove your data
/help - Show help message

**How it works:**
1. Register your Bitunix API keys (one-time)
2. In trading groups, click "Place Trade" buttons
3. Confirm the trade here in DM
4. Trade executes with YOUR API keys

Your User ID: \`${userId}\`
  `, { parse_mode: 'Markdown' });
});

/**
 * Register command - start API key registration flow
 */
bot.command('register', async (ctx) => {
  const userId = ctx.from?.id;
  const chatType = ctx.chat.type;

  if (!userId) return;

  // Only allow registration in private chats
  if (!isPrivateChat(chatType)) {
    await ctx.reply('⚠️ Please use /register in a private message to me for security.');
    return;
  }

  // Check if already registered
  if (isUserRegistered(userId)) {
    await ctx.reply(`
✅ **You're already registered!**

Use /delete first if you want to update your API keys.

Use /settings to view your current configuration.
    `, { parse_mode: 'Markdown' });
    return;
  }

  // Start registration flow
  registrationStates.set(userId, { step: 'awaiting_api_key' });

  await ctx.reply(`
🔐 **API Key Registration**

Let's set up your Bitunix API keys. Your keys will be encrypted and stored securely.

**Step 1 of 2:** Please send your **Bitunix API Key**.

⚠️ Make sure your API key has **Trading** permissions enabled.

_Your message will be deleted after I receive it for security._
  `, { parse_mode: 'Markdown' });
});

/**
 * Status command - check registration status
 */
bot.command('status', async (ctx) => {
  const userId = ctx.from?.id;
  const chatType = ctx.chat.type;

  if (!userId) return;

  if (!isPrivateChat(chatType)) {
    await ctx.reply('⚠️ Please use /status in a private message to me.');
    return;
  }

  const isRegistered = isUserRegistered(userId);

  if (isRegistered) {
    const user = getUser(userId);
    await ctx.reply(`
✅ **Registration Status: Registered**

📅 Registered: ${user ? new Date(user.registeredAt).toLocaleDateString() : 'Unknown'}
⚡ Default Leverage: ${user?.defaultLeverage || config.defaultLeverage}x
💵 Default Position Size: $${user?.defaultPositionSizeUsdt || config.defaultPositionSizeUsdt}

You're ready to trade! Click "Place Trade" buttons in your trading groups.
    `, { parse_mode: 'Markdown' });
  } else {
    await ctx.reply(`
❌ **Registration Status: Not Registered**

Use /register to set up your Bitunix API keys.
    `, { parse_mode: 'Markdown' });
  }
});

/**
 * Settings command - view current settings with edit buttons
 */
bot.command('settings', async (ctx) => {
  const userId = ctx.from?.id;
  const chatType = ctx.chat.type;

  if (!userId) return;

  if (!isPrivateChat(chatType)) {
    await ctx.reply('⚠️ Please use /settings in a private message to me.');
    return;
  }

  if (!isUserRegistered(userId)) {
    await ctx.reply('❌ You need to /register first.');
    return;
  }

  const user = getUser(userId);

  await ctx.reply(`
⚙️ **Your Settings**

⚡ Default Leverage: ${user?.defaultLeverage || config.defaultLeverage}x
💵 Default Position Size: $${user?.defaultPositionSizeUsdt || config.defaultPositionSizeUsdt}
🔑 API Key: ****${user?.bitunixApiKey.slice(-4) || '????'}

**To change settings:**
• /setleverage <number> - e.g. \`/setleverage 20\`
• /setsize <amount> - e.g. \`/setsize 50\`
  `, { parse_mode: 'Markdown' });
});

/**
 * Set leverage command
 */
bot.command('setleverage', async (ctx) => {
  const userId = ctx.from?.id;
  const chatType = ctx.chat.type;

  if (!userId) return;

  if (!isPrivateChat(chatType)) {
    await ctx.reply('⚠️ Please use /setleverage in a private message to me.');
    return;
  }

  if (!isUserRegistered(userId)) {
    await ctx.reply('❌ You need to /register first.');
    return;
  }

  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    await ctx.reply('Usage: `/setleverage <number>`\n\nExample: `/setleverage 20`', { parse_mode: 'Markdown' });
    return;
  }

  const leverage = parseInt(args[1], 10);
  if (isNaN(leverage) || leverage < 1 || leverage > 125) {
    await ctx.reply('❌ Invalid leverage. Please enter a number between 1 and 125.');
    return;
  }

  const updated = updateUserSettings(userId, { defaultLeverage: leverage });

  if (updated) {
    await ctx.reply(`✅ Default leverage updated to **${leverage}x**`, { parse_mode: 'Markdown' });
  } else {
    await ctx.reply('❌ Failed to update settings. Please try again.');
  }
});

/**
 * Set position size command
 */
bot.command('setsize', async (ctx) => {
  const userId = ctx.from?.id;
  const chatType = ctx.chat.type;

  if (!userId) return;

  if (!isPrivateChat(chatType)) {
    await ctx.reply('⚠️ Please use /setsize in a private message to me.');
    return;
  }

  if (!isUserRegistered(userId)) {
    await ctx.reply('❌ You need to /register first.');
    return;
  }

  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    await ctx.reply('Usage: `/setsize <amount>`\n\nExample: `/setsize 50`', { parse_mode: 'Markdown' });
    return;
  }

  const size = parseFloat(args[1]);
  if (isNaN(size) || size < 1 || size > 100000) {
    await ctx.reply('❌ Invalid position size. Please enter a number between 1 and 100000.');
    return;
  }

  const updated = updateUserSettings(userId, { defaultPositionSizeUsdt: size });

  if (updated) {
    await ctx.reply(`✅ Default position size updated to **$${size}**`, { parse_mode: 'Markdown' });
  } else {
    await ctx.reply('❌ Failed to update settings. Please try again.');
  }
});

/**
 * Balance command - check Bitunix balance
 */
bot.command('balance', async (ctx) => {
  const userId = ctx.from?.id;
  const chatType = ctx.chat.type;

  if (!userId) return;

  if (!isPrivateChat(chatType)) {
    await ctx.reply('⚠️ Please use /balance in a private message to me.');
    return;
  }

  if (!isUserRegistered(userId)) {
    await ctx.reply('❌ You need to /register first.');
    return;
  }

  await ctx.reply('⏳ Fetching balance...');

  try {
    const client = getUserClient(userId);
    if (!client) {
      await ctx.reply('❌ Failed to load your API keys. Please /register again.');
      return;
    }

    const balance = await client.getBalance();

    if (balance.code === 0) {
      await ctx.reply(`💰 **Balance**\n\n\`${JSON.stringify(balance.data, null, 2)}\``, {
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
 * Delete command - remove user data
 */
bot.command('delete', async (ctx) => {
  const userId = ctx.from?.id;
  const chatType = ctx.chat.type;

  if (!userId) return;

  if (!isPrivateChat(chatType)) {
    await ctx.reply('⚠️ Please use /delete in a private message to me.');
    return;
  }

  if (!isUserRegistered(userId)) {
    await ctx.reply('ℹ️ You have no data to delete.');
    return;
  }

  const deleted = deleteUser(userId);

  if (deleted) {
    await ctx.reply(`
✅ **Data Deleted**

Your API keys and settings have been removed.

Use /register if you want to set up again.
    `, { parse_mode: 'Markdown' });
  } else {
    await ctx.reply('❌ Failed to delete data. Please try again.');
  }
});

/**
 * Help command
 */
bot.command('help', async (ctx) => {
  await ctx.reply(`
📚 **Bitunix Trade Bot Help**

**For Traders:**
1. Use /register to set up your Bitunix API keys (one-time)
2. In trading groups, click "Place Trade" buttons on signals
3. Confirm trades here in DM
4. Your API keys are encrypted and only used when you confirm trades

**Commands:**
/register - Set up your API keys
/status - Check registration status
/settings - View your settings
/balance - Check Bitunix balance
/delete - Remove your data
/help - Show this message

**Signal Formats Supported:**
\`SOL LONG Entry: 142 TP: 145 SL: 140\`
\`BTC LONG 95000 TP 96000 SL 94000\`
\`BTCUSDT Long Entry: 95000 TP1: 96000 SL: 94000\`

**Security:**
- Your API keys are encrypted with AES-256
- Keys are only decrypted when executing trades
- You can delete your data anytime with /delete
  `, { parse_mode: 'Markdown' });
});

/**
 * Admin stats command
 */
bot.command('stats', async (ctx) => {
  const userId = ctx.from?.id;

  if (!isAdmin(userId)) {
    return; // Silently ignore for non-admins
  }

  const userCount = getUserCount();

  await ctx.reply(`
📊 **Bot Statistics**

👥 Registered Users: ${userCount}
  `, { parse_mode: 'Markdown' });
});

// ============================================
// CALLBACK QUERY HANDLER (Button presses)
// ============================================

bot.on('callback_query', async (ctx) => {
  const callbackQuery = ctx.callbackQuery;
  if (!('data' in callbackQuery)) return;

  const data = callbackQuery.data;
  const userId = callbackQuery.from.id;

  // Check if user is registered
  if (!isUserRegistered(userId)) {
    await ctx.answerCbQuery('⚠️ Please /register first to execute trades.');
    return;
  }

  const signal = pendingSignals.get(userId);
  if (!signal) {
    await ctx.answerCbQuery('⚠️ No pending signal. Click "Place Trade" in the group again.');
    return;
  }

  const client = getUserClient(userId);
  if (!client) {
    await ctx.answerCbQuery('❌ Failed to load API keys. Please /register again.');
    return;
  }

  const user = getUser(userId);

  if (data === 'execute_limit') {
    // Check current price before placing limit order
    const currentPrice = await client.getTickerPrice(signal.symbol);

    if (currentPrice) {
      const isLong = signal.side === 'LONG';
      const wouldExecuteImmediately = isLong
        ? currentPrice <= signal.entryPrice
        : currentPrice >= signal.entryPrice;

      if (wouldExecuteImmediately) {
        await ctx.answerCbQuery('⚠️ Price check needed!');
        await ctx.editMessageText(`
⚠️ **Price Warning**

Current ${signal.symbol} price: **$${currentPrice}**
Your entry price: **$${signal.entryPrice}**

${isLong
  ? `Since current price ($${currentPrice}) ≤ entry ($${signal.entryPrice}), a LIMIT BUY would execute immediately at market price.`
  : `Since current price ($${currentPrice}) ≥ entry ($${signal.entryPrice}), a LIMIT SELL would execute immediately at market price.`
}

**What would you like to do?**
        `, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('⚡ Execute at Market', 'execute_market')],
            [Markup.button.callback('❌ Cancel', 'cancel')],
          ]),
        });
        return;
      }
    }

    await ctx.answerCbQuery('⏳ Placing limit order...');
    const result = await executeTrade(client, signal, {
      positionSizeUsdt: user?.defaultPositionSizeUsdt,
      leverage: user?.defaultLeverage,
      useMarketOrder: false,
    });
    await ctx.editMessageText(formatTradeResult(result), { parse_mode: 'Markdown' });
    pendingSignals.delete(userId);

  } else if (data === 'execute_market') {
    await ctx.answerCbQuery('⏳ Placing market order...');
    const result = await executeMarketTrade(client, signal, user?.defaultPositionSizeUsdt);
    await ctx.editMessageText(formatTradeResult(result), { parse_mode: 'Markdown' });
    pendingSignals.delete(userId);

  } else if (data === 'cancel') {
    await ctx.answerCbQuery('Trade cancelled.');
    await ctx.editMessageText('❌ Trade cancelled.');
    pendingSignals.delete(userId);
  }
});

// ============================================
// TEXT MESSAGE HANDLER
// ============================================

bot.on('text', async (ctx) => {
  const message = ctx.message;
  const text = message.text;
  const userId = ctx.from?.id;
  const chatType = ctx.chat.type;

  if (!userId) return;

  // Skip commands
  if (text.startsWith('/')) return;

  // Handle registration flow in private chat
  if (isPrivateChat(chatType)) {
    const regState = registrationStates.get(userId);

    if (regState) {
      // Delete the user's message containing API key for security
      try {
        await ctx.deleteMessage();
      } catch {
        // May fail if bot doesn't have permission, that's ok
      }

      if (regState.step === 'awaiting_api_key') {
        // Validate API key format (basic check)
        if (text.length < 10) {
          await ctx.reply('❌ That doesn\'t look like a valid API key. Please try again.');
          return;
        }

        // Store API key and move to next step
        registrationStates.set(userId, {
          step: 'awaiting_api_secret',
          apiKey: text.trim(),
        });

        await ctx.reply(`
✅ API Key received!

**Step 2 of 2:** Now please send your **Bitunix API Secret**.

_Your message will be deleted after I receive it for security._
        `, { parse_mode: 'Markdown' });
        return;
      }

      if (regState.step === 'awaiting_api_secret' && regState.apiKey) {
        // Validate API secret format (basic check)
        if (text.length < 10) {
          await ctx.reply('❌ That doesn\'t look like a valid API secret. Please try again.');
          return;
        }

        // Save the user
        saveUser({
          odontechId: userId,
          odontechUsername: ctx.from?.username,
          bitunixApiKey: regState.apiKey,
          bitunixApiSecret: text.trim(),
          defaultLeverage: config.defaultLeverage,
          defaultPositionSizeUsdt: config.defaultPositionSizeUsdt,
          registeredAt: Date.now(),
        });

        // Clear registration state
        registrationStates.delete(userId);

        await ctx.reply(`
✅ **Registration Complete!**

Your API keys have been encrypted and saved securely.

**You're ready to trade!**
Click "Place Trade" buttons in your trading groups to execute trades.

⚙️ Default Settings:
- Leverage: ${config.defaultLeverage}x
- Position Size: $${config.defaultPositionSizeUsdt}
        `, { parse_mode: 'Markdown' });
        return;
      }
    }

    // In private chat but not in registration flow - ignore random messages
    return;
  }

  // Handle group messages - look for trade signals
  if (isGroupChat(chatType)) {
    // Try to parse as trade signal
    const signal = parseTradeSignal(text);

    if (!signal) {
      // Not a valid signal, ignore silently
      return;
    }

    // Generate deeplink for the "Place Trade" button
    const deeplink = generateDeeplink(config.botUsername, signal);
    const rr = calculateRiskReward(signal);
    const formatted = formatTradeSignal(signal);

    // Reply with parsed signal and "Place Trade" button
    await ctx.reply(`
${formatted}

📊 Risk/Reward: ${rr.toFixed(2)}:1
    `, {
      parse_mode: 'Markdown',
      reply_parameters: { message_id: message.message_id },
      ...Markup.inlineKeyboard([
        [Markup.button.url('📲 Place Trade', deeplink)],
      ]),
    });
  }
});

// ============================================
// ERROR HANDLER
// ============================================

bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  ctx.reply('❌ An error occurred. Please try again.').catch(() => {});
});

// ============================================
// START BOT
// ============================================

export async function startBot() {
  console.log('🤖 Starting Telegram Trade Bot...');
  console.log(`   Bot Username: @${config.botUsername}`);
  console.log(`   Default leverage: ${config.defaultLeverage}x`);
  console.log(`   Default position size: $${config.defaultPositionSizeUsdt}`);
  console.log(`   Admin users: ${config.adminUserIds.length > 0 ? config.adminUserIds.join(', ') : 'None'}`);
  console.log(`   Registered users: ${getUserCount()}`);

  await bot.launch();
  console.log('✅ Bot is running!');

  // Graceful shutdown
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

export { bot };
