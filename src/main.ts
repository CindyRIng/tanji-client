#!/usr/bin/env node
/**
 * tanji-client 入口
 */
import { main } from './transports/cli/index.js';

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
