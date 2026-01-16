import { parseTradeSignal, formatTradeSignal, calculateRiskReward } from './parser';

// Test signals from Streets X
const testSignals = [
  // SOL LONG SCALP
  `SOL LONG SCALP

Leverage: 10-25x
Entry: 142.4
Stop Loss: 141.6
Take Profit: 145-148`,

  // AVAX LONG
  `AVAX LONG

Leverage: 10-25x
Entry: 13.6
Stop Loss: 13.40
Take Profit: 14.23`,

  // BTC LONG with commas
  `BTC LONG

Leverage: 10-25x
Entry: 95,093 / Current Price 95,337.89
Stop Loss: 94,861.68
Take Profit: 96,117.71`,
];

console.log('='.repeat(60));
console.log('Testing Streets X Signal Parser');
console.log('='.repeat(60));

for (const signal of testSignals) {
  console.log('\n--- Input Signal ---');
  console.log(signal);
  console.log('\n--- Parsed Result ---');

  const parsed = parseTradeSignal(signal);

  if (parsed) {
    console.log(formatTradeSignal(parsed));
    console.log(`\n📊 Risk/Reward: ${calculateRiskReward(parsed).toFixed(2)}:1`);
    console.log('\nRaw parsed object:');
    console.log(JSON.stringify(parsed, null, 2));
  } else {
    console.log('❌ Failed to parse signal');
  }

  console.log('\n' + '='.repeat(60));
}
