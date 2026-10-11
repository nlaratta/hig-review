#!/usr/bin/env node
import { HIGReviewServer } from './server.js';
import { logger } from './utils/logger.js';

new HIGReviewServer().run().catch((error) => {
  logger.error('Fatal error', error);
  process.exit(1);
});
