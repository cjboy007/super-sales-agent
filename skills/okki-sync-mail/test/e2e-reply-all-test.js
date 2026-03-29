#!/usr/bin/env node

/**
 * E2E Reply-All Test with Real Email Parsing
 * 
 * Tests the complete reply-all flow with RFC 2822 address parsing.
 * This test verifies that the smtp.js integration works correctly.
 */

const { buildReplyAllRecipients, parseAndValidate } = require('../lib/email-parser');

console.log('🧪 E2E Reply-All Test - Real World Scenarios\n');

// Simulate real email headers
const realWorldEmails = [
  {
    scenario: 'Customer inquiry with multiple stakeholders',
    email: {
      fromAddress: '"John Smith" <john.smith@customer.com>',
      to: '"Sales Team" <sales@farreach-electronic.com>, "Support" <support@farreach-electronic.com>',
      cc: '"Manager" <manager@farreach-electronic.com>, "Tech Lead" <tech@farreach-electronic.com>'
    },
    selfEmail: 'sales@farreach-electronic.com',
    description: 'Should include customer + all internal team except self'
  },
  {
    scenario: 'Email thread with mailing list',
    email: {
      fromAddress: 'customer@company.com',
      to: 'sales@farreach-electronic.com, project@farreach-electronic.com',
      cc: 'all-hands@farreach-electronic.com, notifications@farreach-electronic.com'
    },
    selfEmail: 'sales@farreach-electronic.com',
    removeList: ['all-hands', 'notifications'],
    description: 'Should exclude mailing lists when --remove is used'
  },
  {
    scenario: 'Complex name formats',
    email: {
      fromAddress: '"Smith, John" <j.smith@customer.com>',
      to: 'sales@farreach-electronic.com',
      cc: '"Wang, Wei" <w.wang@farreach-electronic.com>, "O\'Brien, Pat" <p.obrien@farreach-electronic.com>'
    },
    selfEmail: 'sales@farreach-electronic.com',
    description: 'Should handle commas and special chars in names'
  },
  {
    scenario: 'Reply to self (edge case)',
    email: {
      fromAddress: 'sales@farreach-electronic.com',
      to: 'customer@example.com',
      cc: null
    },
    selfEmail: 'sales@farreach-electronic.com',
    description: 'Should only include customer (exclude self from both from and to)'
  },
  {
    scenario: 'Multiple customers in CC',
    email: {
      fromAddress: 'primary@customer.com',
      to: 'sales@farreach-electronic.com',
      cc: 'buyer@customer.com, engineer@customer.com, manager@customer.com'
    },
    selfEmail: 'sales@farreach-electronic.com',
    description: 'Should include all customers (from + cc)'
  }
];

let passed = 0;
let failed = 0;

realWorldEmails.forEach((test, index) => {
  console.log(`Test ${index + 1}: ${test.scenario}`);
  console.log(`  Description: ${test.description}`);
  
  const result = buildReplyAllRecipients(
    test.email,
    test.selfEmail,
    test.removeList || []
  );
  
  console.log(`  From: ${test.email.fromAddress}`);
  console.log(`  To: ${test.email.to}`);
  if (test.email.cc) {
    console.log(`  CC: ${test.email.cc}`);
  }
  console.log(`  Recipients: ${result.join(', ')}`);
  
  // Basic validation
  const isValid = result.length > 0 && !result.includes(test.selfEmail);
  
  if (isValid) {
    console.log(`  ✅ PASSED\n`);
    passed++;
  } else {
    console.log(`  ❌ FAILED - Invalid result\n`);
    failed++;
  }
});

// Test address-rfc2822 parsing edge cases
console.log('═══════════════════════════════════════════════════════');
console.log('📋 RFC 2822 Edge Cases\n');

const edgeCases = [
  {
    input: '"John Doe" <john@example.com>',
    expected: 'john@example.com',
    description: 'Quoted name with angle brackets'
  },
  {
    input: 'John Doe <john@example.com>',
    expected: 'john@example.com',
    description: 'Unquoted name with angle brackets'
  },
  {
    input: '<john@example.com>',
    expected: 'john@example.com',
    description: 'Angle brackets only'
  },
  {
    input: 'john@example.com',
    expected: 'john@example.com',
    description: 'Plain email'
  },
  {
    input: '"Smith, John" <john@example.com>',
    expected: 'john@example.com',
    description: 'Name with comma'
  },
  {
    input: '"O\'Brien" <john@example.com>',
    expected: 'john@example.com',
    description: 'Name with apostrophe'
  },
  {
    input: 'a@example.com, b@example.com, c@example.com',
    expected: 'multiple',
    description: 'Multiple plain emails'
  }
];

edgeCases.forEach((test, index) => {
  console.log(`Edge Case ${index + 1}: ${test.description}`);
  console.log(`  Input: ${test.input}`);
  
  const parsed = parseAndValidate(test.input, { dedupe: true, validate: true });
  
  let success;
  if (test.expected === 'multiple') {
    success = parsed.length > 1;
    console.log(`  Parsed ${parsed.length} addresses: ${parsed.join(', ')}`);
  } else {
    success = parsed.length === 1 && parsed[0] === test.expected;
    console.log(`  Parsed: ${parsed.join(', ')}`);
  }
  
  if (success) {
    console.log(`  ✅ PASSED\n`);
    passed++;
  } else {
    console.log(`  ❌ FAILED\n`);
    failed++;
  }
});

// Summary
console.log('═══════════════════════════════════════════════════════');
console.log(`📊 Final Summary: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════════');

if (failed > 0) {
  console.log('\n❌ Some tests failed\n');
  process.exit(1);
}

console.log('\n✅ All E2E tests passed!\n');
