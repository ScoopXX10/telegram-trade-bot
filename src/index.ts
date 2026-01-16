import { startBot } from './bot';

async function main() {
  try {
    await startBot();
  } catch (error) {
    console.error('Failed to start bot:', error);
    process.exit(1);
  }
}

main();
