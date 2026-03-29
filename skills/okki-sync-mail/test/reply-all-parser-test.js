#!/usr/bin/env node

/**
 * Reply-All Email Parser Integration Test
 * 
 * Tests the integration between smtp.js and email-parser.js
 * Verifies RFC 2822 compliant email address parsing in reply-all scenarios.
 */

const { buildReplyAllRecipients, parseAddresses, parseAndValidate } = require('../lib/email-parser');

console.log('🧪 Reply-All Integration Test\n');

// Test scenarios
const scenarios = [
  {
    name: 'Simple reply-all (plain emails)',
    original: {
      fromAddress: 'customer@example.com',
      to: 'sales@farreach.com, support@farreach.com',
      cc: 'manager@farreach.com'
    },
    selfEmail: 'sales@farreach.com',
    expected: ['customer@example.com', 'support@farreach.com', 'manager@farreach.com']
  },
  {
    name: 'Reply-all with "Name <email>" format',
    original: {
      fromAddress: 'John Doe <customer@example.com>',
      to: 'Sales Team <sales@farreach.com>, support@farreach.com',
      cc: 'Manager <manager@farreach.com>'
    },
    selfEmail: 'sales@farreach.com',
    expected: ['customer@example.com', 'support@farreach.com', 'manager@farreach.com']
  },
  {
    name: 'Reply-all with quoted names',
    original: {
      fromAddress: '"John Doe" <customer@example.com>',
      to: '"Sales Team" <sales@farreach.com>, "Support" <support@farreach.com>',
      cc: '"Manager" <manager@farreach.com>'
    },
    selfEmail: 'sales@farreach.com',
    expected: ['customer@example.com', 'support@farreach.com', 'manager@farreach.com']
  },
  {
    name: 'Reply-all with case-insensitive deduplication',
    original: {
      fromAddress: 'Customer@Example.com',
      to: 'Sales@FarReach.com, SUPPORT@farreach.com',
      cc: 'manager@farreach.com'
    },
    selfEmail: 'sales@farreach.com',
    expected: ['Customer@Example.com', 'SUPPORT@farreach.com', 'manager@farreach.com']
  },
  {
    name: 'Reply-all with remove parameter',
    original: {
      fromAddress: 'customer@example.com',
      to: 'sales@farreach.com, support@farreach.com',
      cc: 'manager@farreach.com, mailing-list@example.com'
    },
    selfEmail: 'sales@farreach.com',
    removeList: ['mailing-list'],
    expected: ['customer@example.com', 'support@farreach.com', 'manager@farreach.com']
  },
  {
    name: 'Reply-all with multiple recipients in To field',
    original: {
      fromAddress: 'customer@example.com',
      to: 'team1@example.com, team2@example.com, team3@example.com',
      cc: null
    },
    selfEmail: 'sales@farreach.com',
    expected: ['customer@example.com', 'team1@example.com', 'team2@example.com', 'team3@example.com']
  },
  {
    name: 'Reply-all when sender is in CC',
    original: {
      fromAddress: 'customer@example.com',
      to: 'other@farreach.com',
      cc: 'sales@farreach.com, manager@farreach.com'
    },
    selfEmail: 'sales@farreach.com',
    expected: ['customer@example.com', 'other@farreach.com', 'manager@farreach.com']
  }
];

let passed = 0;
let failed = 0;

scenarios.forEach((scenario, index) => {
  console.log(`Test ${index + 1}: ${scenario.name}`);
  
  const result = buildReplyAllRecipients(
    scenario.original,
    scenario.selfEmail,
    scenario.removeList || []
  );
  
  // Sort both arrays for comparison
  const resultSorted = result.sort();
  const expectedSorted = scenario.expected.sort();
  
  const match = JSON.stringify(resultSorted) === JSON.stringify(expectedSorted);
  
  if (match) {
    console.log(`  ✅ PASSED`);
    console.log(`     Recipients: ${result.join(', ')}`);
    passed++;
  } else {
    console.log(`  ❌ FAILED`);
    console.log(`     Expected: ${expectedSorted.join(', ')}`);
    console.log(`     Got:      ${resultSorted.join(', ')}`);
    failed++;
  }
  console.log('');
});

// Additional validation tests
console.log('📋 Email Validation Tests\n');

const validationTests = [
  {
    name: 'Valid email formats',
    emails: [
      'user@example.com',
      'user.name@example.com',
      'user+tag@example.com',
      'user@sub.example.com'
    ],
    allValid: true
  },
  {
    name: 'Invalid email formats',
    emails: [
      'invalid',
      '@example.com',
      'user@',
      'user @example.com'
    ],
    allValid: false
  }
];

validationTests.forEach((test, index) => {
  console.log(`Validation Test ${index + 1}: ${test.name}`);
  
  const results = test.emails.map(email => {
    const parsed = parseAddresses(email);
    return parsed.length > 0 && parsed[0].email === email;
  });
  
  const allValid = results.every(r => r === test.allValid);
  
  if (allValid) {
    console.log(`  ✅ PASSED`);
    passed++;
  } else {
    console.log(`  ❌ FAILED`);
    console.log(`     Results: ${JSON.stringify(results)}`);
    failed++;
  }
  console.log('');
});

// Summary
console.log('═══════════════════════════════════════════════════════');
console.log(`📊 Test Summary: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════════');

if (failed > 0) {
  process.exit(1);
}

console.log('\n✅ All tests passed!\n');
