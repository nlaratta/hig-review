#!/usr/bin/env node
import { AppleHIGServer } from './server.js';
import { logger } from './utils/logger.js';

new AppleHIGServer().run().catch((error) => {
  logger.error('Fatal error', error);
  process.exit(1);
});
