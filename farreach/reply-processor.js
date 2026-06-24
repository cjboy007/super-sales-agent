#!/usr/bin/env node
'use strict';

const shared = require('../shared/reply-processor');

async function main() {
  const args = process.argv.slice(2);
  const options = { dryRun: args.includes('--dry-run') };
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`Farreach Reply Processor\nDelegates to ../shared/reply-processor.js.\n\nUsage: node reply-processor.js [--dry-run]`);
    return;
  }
  const processor = new shared.ReplyProcessor();
  await processor.process(options);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(JSON.stringify({ success: false, error: error.message }, null, 2));
    process.exit(1);
  });
}

module.exports = shared;
