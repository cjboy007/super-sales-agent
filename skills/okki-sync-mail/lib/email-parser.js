#!/usr/bin/env node

/**
 * Email Address Parser Utility
 * 
 * Uses address-rfc2822 library for RFC-compliant email address parsing.
 * Supports formats like:
 * - "email@example.com"
 * - "Name <email@example.com>"
 * - "\"Quoted Name\" <email@example.com>"
 * - Multiple addresses: "a@example.com, b@example.com"
 * 
 * Features:
 * - RFC 2822 compliant parsing
 * - Case-insensitive deduplication
 * - Email format validation
 * - Self-address filtering
 */

const { parse } = require('address-rfc2822');

/**
 * Parse email addresses from string (supports RFC 2822 formats)
 * @param {string} addressStr - Email address string (single or multiple)
 * @returns {Array<{name: string, email: string}>} Parsed addresses
 */
function parseAddresses(addressStr) {
  if (!addressStr || typeof addressStr !== 'string') {
    return [];
  }

  try {
    const parsed = parse(addressStr);
    return parsed.map(addr => ({
      name: addr.phrase || '',
      email: addr.address || '',
    })).filter(addr => addr.email); // Filter out invalid entries
  } catch (err) {
    console.error(`⚠️  Email parse error: ${err.message}`);
    console.error(`   Input: ${addressStr}`);
    return [];
  }
}

/**
 * Validate email format (simple regex check)
 * @param {string} email - Email address to validate
 * @returns {boolean} True if valid
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') {
    return false;
  }
  
  // RFC 5322 compliant regex (simplified but practical)
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return emailRegex.test(email);
}

/**
 * Deduplicate email addresses (case-insensitive)
 * @param {Array<string>} emails - Array of email addresses
 * @returns {Array<string>} Deduplicated emails
 */
function deduplicateEmails(emails) {
  const seen = new Set();
  const result = [];

  for (const email of emails) {
    if (!email || typeof email !== 'string') {
      continue;
    }
    
    const normalized = email.toLowerCase().trim();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(email);
    }
  }

  return result;
}

/**
 * Filter out self email from recipient list
 * @param {Array<string>} emails - Array of email addresses
 * @param {string} selfEmail - Self email to exclude
 * @returns {Array<string>} Filtered emails
 */
function filterSelf(emails, selfEmail) {
  if (!selfEmail) {
    return emails;
  }

  const selfNormalized = selfEmail.toLowerCase().trim();
  return emails.filter(email => {
    if (!email || typeof email !== 'string') {
      return false;
    }
    return email.toLowerCase().trim() !== selfNormalized;
  });
}

/**
 * Parse and validate email addresses from string
 * @param {string} addressStr - Email address string
 * @param {Object} options - Options
 * @param {string} options.selfEmail - Self email to exclude
 * @param {boolean} options.dedupe - Enable deduplication (default: true)
 * @param {boolean} options.validate - Enable validation (default: true)
 * @returns {Array<string>} Validated email addresses
 */
function parseAndValidate(addressStr, options = {}) {
  const { selfEmail, dedupe = true, validate = true } = options;

  // Parse addresses
  const parsed = parseAddresses(addressStr);
  
  // Extract email addresses
  let emails = parsed.map(addr => addr.email);

  // Validate if enabled
  if (validate) {
    emails = emails.filter(email => isValidEmail(email));
  }

  // Filter self if provided
  if (selfEmail) {
    emails = filterSelf(emails, selfEmail);
  }

  // Deduplicate if enabled
  if (dedupe) {
    emails = deduplicateEmails(emails);
  }

  return emails;
}

/**
 * Build recipient list for reply-all
 * @param {Object} originalEmail - Original email object
 * @param {string} selfEmail - Self email to exclude
 * @param {Array<string>} removeList - Emails to remove
 * @returns {Array<string>} Reply-all recipient list
 */
function buildReplyAllRecipients(originalEmail, selfEmail, removeList = []) {
  const recipients = new Set();
  const selfNormalized = selfEmail?.toLowerCase().trim();
  const removeNormalized = removeList.map(r => r.toLowerCase().trim());

  // Helper to add recipient
  const addRecipient = (email) => {
    if (!email || typeof email !== 'string') {
      return;
    }
    
    const normalized = email.toLowerCase().trim();
    
    // Skip self
    if (selfNormalized && normalized === selfNormalized) {
      return;
    }
    
    // Skip removed recipients
    if (removeNormalized.some(remove => normalized.includes(remove))) {
      return;
    }
    
    // Validate email format
    if (!isValidEmail(email)) {
      console.warn(`⚠️  Invalid email format: ${email}`);
      return;
    }
    
    recipients.add(email);
  };

  // Parse and add From address
  if (originalEmail.fromAddress || originalEmail.from) {
    const fromEmail = originalEmail.fromAddress || originalEmail.from;
    // Try to parse "Name <email>" format
    const parsedFrom = parseAddresses(fromEmail);
    if (parsedFrom.length > 0) {
      addRecipient(parsedFrom[0].email);
    } else {
      addRecipient(fromEmail);
    }
  }

  // Parse and add To recipients
  if (originalEmail.to) {
    const toParsed = parseAddresses(originalEmail.to);
    toParsed.forEach(addr => addRecipient(addr.email));
  }

  // Parse and add Cc recipients
  if (originalEmail.cc) {
    const ccParsed = parseAddresses(originalEmail.cc);
    ccParsed.forEach(addr => addRecipient(addr.email));
  }

  return Array.from(recipients);
}

/**
 * Format email addresses for display
 * @param {Array<{name: string, email: string}>} addresses - Parsed addresses
 * @param {boolean} includeName - Include name if available (default: true)
 * @returns {string} Formatted string
 */
function formatAddresses(addresses, includeName = true) {
  if (!addresses || addresses.length === 0) {
    return '';
  }

  return addresses.map(addr => {
    if (includeName && addr.name) {
      return `"${addr.name}" <${addr.email}>`;
    }
    return addr.email;
  }).join(', ');
}

// Export functions
module.exports = {
  parseAddresses,
  isValidEmail,
  deduplicateEmails,
  filterSelf,
  parseAndValidate,
  buildReplyAllRecipients,
  formatAddresses,
};

// Built-in test
if (require.main === module) {
  console.log('🧪 Running email-parser.js tests...\n');

  const tests = [
    {
      name: 'Simple email',
      input: 'customer@example.com',
      expected: ['customer@example.com']
    },
    {
      name: 'Name with email',
      input: 'John Doe <john@example.com>',
      expected: ['john@example.com']
    },
    {
      name: 'Multiple emails',
      input: 'a@example.com, b@example.com',
      expected: ['a@example.com', 'b@example.com']
    },
    {
      name: 'Mixed format',
      input: 'admin@example.com, "Support Team" <support@example.com>',
      expected: ['admin@example.com', 'support@example.com']
    },
    {
      name: 'Case insensitive dedupe',
      input: 'Test@Example.com, test@example.com',
      expected: ['Test@Example.com']
    },
    {
      name: 'With self filter',
      input: 'user@example.com, self@example.com, other@example.com',
      selfEmail: 'self@example.com',
      expected: ['user@example.com', 'other@example.com']
    }
  ];

  let passed = 0;
  let failed = 0;

  tests.forEach((test, i) => {
    const result = parseAndValidate(test.input, {
      selfEmail: test.selfEmail,
      dedupe: true,
      validate: true
    });

    const pass = JSON.stringify(result.sort()) === JSON.stringify(test.expected.sort());
    
    if (pass) {
      console.log(`✅ Test ${i+1} PASSED: ${test.name}`);
      passed++;
    } else {
      console.log(`❌ Test ${i+1} FAILED: ${test.name}`);
      console.log(`   Expected: ${JSON.stringify(test.expected)}`);
      console.log(`   Got:      ${JSON.stringify(result)}`);
      failed++;
    }
  });

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
