#!/usr/bin/env node

/**
 * Reply-All Command Simulation Test
 * 
 * Simulates the actual reply-all command flow to verify the integration
 * between smtp.js and email-parser.js works correctly.
 */

const { buildReplyAllRecipients, parseAndValidate } = require('../lib/email-parser');

console.log('🧪 Reply-All Command Simulation Test\n');

// Simulate fetchEmail() return value (as would come from IMAP)
function simulateFetchEmail(uid) {
  const mockEmails = {
    '12345': {
      messageId: '<msg-12345@example.com>',
      from: '"John Smith" <john.smith@customer.com>',
      fromAddress: 'john.smith@customer.com',
      to: '"Sales Team" <sales@farreach-electronic.com>, "Support" <support@farreach-electronic.com>',
      cc: '"Manager" <manager@farreach-electronic.com>',
      date: new Date(),
      subject: 'Inquiry about HDMI cables',
      text: 'Hi, I would like to inquire about HDMI 2.1 cables...'
    },
    '12346': {
      messageId: '<msg-12346@example.com>',
      from: 'customer@company.com',
      fromAddress: 'customer@company.com',
      to: 'sales@farreach-electronic.com, project@farreach-electronic.com',
      cc: 'all-hands@farreach-electronic.com, notifications@farreach-electronic.com',
      date: new Date(),
      subject: 'Project Update',
      text: 'Please find the project update attached...'
    }
  };
  
  return mockEmails[uid] || null;
}

// Simulate the reply-all command flow (from smtp.js)
async function simulateReplyAllCommand(uid, removeList) {
  const originalEmail = simulateFetchEmail(uid);
  
  if (!originalEmail) {
    throw new Error(`Email not found: ${uid}`);
  }
  
  const selfEmail = process.env.SMTP_USER || 'sales@farreach-electronic.com';
  
  // Parse recipients to remove (if specified)
  // Remove list can be plain text (e.g., "mailing-list") or email addresses
  const removeParsed = removeList 
    ? removeList.split(',').map(r => r.toLowerCase().trim()).filter(Boolean)
    : [];
  
  // Use RFC-compliant email parser to build reply-all recipients
  const replyAllRecipients = buildReplyAllRecipients(
    {
      fromAddress: originalEmail.fromAddress,
      to: originalEmail.to,
      cc: originalEmail.cc
    },
    selfEmail,
    removeParsed
  );
  
  return {
    uid,
    subject: `Re: ${originalEmail.subject}`,
    to: selfEmail, // Reply goes to original sender (included in CC)
    cc: replyAllRecipients.length > 0 ? replyAllRecipients.join(',') : undefined,
    recipientCount: replyAllRecipients.length,
    recipients: replyAllRecipients
  };
}

// Test scenarios
const scenarios = [
  {
    name: 'Standard reply-all (no remove)',
    uid: '12345',
    remove: null,
    expectedRecipients: ['john.smith@customer.com', 'support@farreach-electronic.com', 'manager@farreach-electronic.com'],
    description: 'Should include customer + support + manager (exclude self)'
  },
  {
    name: 'Reply-all with mailing list removal',
    uid: '12346',
    remove: 'all-hands,notifications',
    expectedRecipients: ['customer@company.com', 'project@farreach-electronic.com'],
    description: 'Should exclude mailing lists'
  }
];

async function runTests() {
  let passed = 0;
  let failed = 0;
  
  for (const scenario of scenarios) {
    console.log(`Test: ${scenario.name}`);
    console.log(`  Description: ${scenario.description}`);
    console.log(`  UID: ${scenario.uid}`);
    if (scenario.remove) {
      console.log(`  Remove: ${scenario.remove}`);
    }
    
    try {
      const result = await simulateReplyAllCommand(scenario.uid, scenario.remove);
      
      console.log(`  Subject: ${result.subject}`);
      console.log(`  CC: ${result.cc}`);
      console.log(`  Recipients (${result.recipientCount}):`);
      result.recipients.forEach(r => console.log(`    - ${r}`));
      
      // Verify recipients match expected
      const sorted = result.recipients.sort();
      const expectedSorted = scenario.expectedRecipients.sort();
      const match = JSON.stringify(sorted) === JSON.stringify(expectedSorted);
      
      if (match && result.recipientCount > 0) {
        console.log(`  ✅ PASSED\n`);
        passed++;
      } else {
        console.log(`  ❌ FAILED - Recipients mismatch`);
        console.log(`     Expected: ${expectedSorted.join(', ')}`);
        console.log(`     Got:      ${sorted.join(', ')}`);
        console.log('');
        failed++;
      }
    } catch (err) {
      console.log(`  ❌ FAILED - Error: ${err.message}\n`);
      failed++;
    }
  }
  
  // Summary
  console.log('═══════════════════════════════════════════════════════');
  console.log(`📊 Test Summary: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════════════');
  
  if (failed > 0) {
    console.log('\n❌ Some tests failed\n');
    process.exit(1);
  }
  
  console.log('\n✅ All command simulation tests passed!\n');
}

// Run tests
runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
