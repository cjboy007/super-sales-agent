/**
 * HTML Sanitizer Module
 * 
 * Purpose: Prevent prompt injection and XSS attacks by sanitizing HTML content
 * from emails before processing or quoting in replies/forwards.
 * 
 * Security Features:
 * - Removes dangerous tags (script, iframe, object, embed, etc.)
 * - Filters dangerous attributes (onclick, onerror, onload, etc.)
 * - Blocks dangerous URL schemes (javascript:, data:, vbscript:, etc.)
 * - Allows only safe, semantic HTML tags for email content
 * 
 * Usage:
 * const { sanitizeHtml, sanitizeEmailContent } = require('./lib/sanitize');
 * 
 * const cleanHtml = sanitizeHtml(dirtyHtml);
 * const cleanContent = sanitizeEmailContent(emailData);
 */

const sanitizeHtmlLib = require('sanitize-html');

// ==================== Configuration ====================

/**
 * Dangerous URL schemes that should be blocked
 */
const DANGEROUS_SCHEMES = [
  'javascript:',
  'data:',
  'vbscript:',
  'mhtml:',
  'x-javascript:',
  'application:',
  'blob:'
];

/**
 * Allowed HTML tags for email content
 * Focus on semantic, safe tags only
 */
const ALLOWED_TAGS = [
  // Text formatting
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr',
  'strong', 'b', 'em', 'i', 'u', 's', 'strike',
  'blockquote', 'q', 'cite',
  'code', 'pre',
  'abbr', 'acronym',
  'sub', 'sup',
  'mark', 'small',
  
  // Lists
  'ul', 'ol', 'li',
  'dl', 'dt', 'dd',
  
  // Tables
  'table', 'thead', 'tbody', 'tfoot',
  'tr', 'th', 'td',
  'caption', 'col', 'colgroup',
  
  // Links and media (with restrictions)
  'a', 'img',
  
  // Structural
  'div', 'span',
  'article', 'section', 'nav', 'aside', 'header', 'footer',
  'main', 'details', 'summary',
  
  // Email-specific
  'meta' // Only for charset, filtered by attributes
];

/**
 * Allowed attributes per tag
 */
const ALLOWED_ATTRIBUTES = {
  '*': ['class', 'style', 'title', 'lang', 'dir'],
  'a': ['href', 'name', 'target', 'rel'],
  'img': ['src', 'alt', 'width', 'height', 'loading'],
  'th': ['scope', 'colspan', 'rowspan'],
  'td': ['colspan', 'rowspan'],
  'col': ['span'],
  'colgroup': ['span'],
  'ol': ['start', 'type'],
  'li': ['value'],
  'abbr': ['title'],
  'acronym': ['title'],
  'q': ['cite'],
  'cite': ['cite'],
  'time': ['datetime'],
  'data': ['value'],
  'meta': ['charset']
};

/**
 * Allowed URL schemes for href and src attributes
 */
const ALLOWED_SCHEMES = {
  a: ['http', 'https', 'mailto', 'tel'],
  img: ['http', 'https', 'cid'], // cid for inline email images
  '*': ['http', 'https']
};

// ==================== Main Functions ====================

/**
 * Sanitize HTML content
 * 
 * @param {string} html - Raw HTML string to sanitize
 * @param {Object} options - Optional overrides for sanitize-html
 * @returns {string} - Sanitized HTML string
 */
function sanitizeHtml(html, options = {}) {
  if (!html || typeof html !== 'string') {
    return '';
  }

  const config = {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ALLOWED_SCHEMES,
    
    // Disallow data URLs by default
    allowProtocolRelative: false,
    
    // Handle srcset for images
    nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript'],
    
    // Additional security options
    parser: {
      lowerCaseAttributeNames: true,
      lowerCaseTags: true
    },
    
    // Custom attribute filter
    allowedSchemesByTag: ALLOWED_SCHEMES,
    
    // Filter out dangerous schemes
    disallowedTagsMode: 'discard',
    
    ...options
  };

  // First pass: sanitize with sanitize-html
  let sanitized = sanitizeHtmlLib(html, config);

  // Second pass: additional custom filtering for edge cases
  sanitized = filterDangerousSchemes(sanitized);
  sanitized = removeEventHandlers(sanitized);

  return sanitized;
}

/**
 * Filter dangerous URL schemes from HTML
 * 
 * @param {string} html - HTML string
 * @returns {string} - Filtered HTML string
 */
function filterDangerousSchemes(html) {
  if (!html) return html;

  let filtered = html;

  // Replace dangerous schemes in href attributes
  DANGEROUS_SCHEMES.forEach(scheme => {
    // Match href="javascript:..." or href='javascript:...'
    const hrefRegex = new RegExp(`(href|src)=["']${scheme}[^"']*["']`, 'gi');
    filtered = filtered.replace(hrefRegex, '$1="#removed-dangerous-url"');
    
    // Match url(...) in style attributes
    const urlRegex = new RegExp(`url\\(\\s*["']?${scheme}[^)]*["']?\\)`, 'gi');
    filtered = filtered.replace(urlRegex, 'url(#removed)');
  });

  return filtered;
}

/**
 * Remove any remaining event handlers from HTML
 * 
 * @param {string} html - HTML string
 * @returns {string} - Filtered HTML string
 */
function removeEventHandlers(html) {
  if (!html) return html;

  // Common event handler attributes
  const eventHandlers = [
    'onclick', 'ondblclick', 'onmousedown', 'onmouseup', 'onmouseover',
    'onmousemove', 'onmouseout', 'onmouseenter', 'onmouseleave',
    'onkeydown', 'onkeypress', 'onkeyup',
    'onload', 'onunload', 'onerror', 'onabort',
    'onfocus', 'onblur', 'onchange', 'onsubmit', 'onreset',
    'onselect', 'oninput', 'oncontextmenu',
    'ondrag', 'ondragend', 'ondragenter', 'ondragleave',
    'ondragover', 'ondragstart', 'ondrop',
    'onscroll', 'onwheel', 'ontouchstart', 'ontouchmove', 'ontouchend',
    'onanimationstart', 'onanimationend', 'onanimationiteration',
    'ontransitionend', 'onmessage', 'ononline', 'onoffline',
    'onpopstate', 'onhashchange', 'onstorage',
    'oncopy', 'oncut', 'onpaste',
    'onbeforeunload', 'onresize', 'ontoggle'
  ];

  let filtered = html;

  eventHandlers.forEach(handler => {
    // Remove handler attributes (case-insensitive)
    const regex = new RegExp(`\\s*${handler}\\s*=\\s*["'][^"']*["']`, 'gi');
    filtered = filtered.replace(regex, '');
    
    // Also remove without quotes (less common but possible)
    const regexNoQuotes = new RegExp(`\\s*${handler}\\s*=\\s*[^\\s>]+`, 'gi');
    filtered = filtered.replace(regexNoQuotes, '');
  });

  return filtered;
}

/**
 * Sanitize email content specifically
 * Handles both plain text and HTML emails
 * 
 * @param {Object} emailData - Email data object
 * @param {string} emailData.body - Email body (HTML or plain text)
 * @param {string} emailData.html - HTML version of email (if available)
 * @param {string} emailData.text - Plain text version (if available)
 * @param {boolean} preferHtml - Whether to prefer HTML over plain text
 * @returns {Object} - { content: string, isHtml: boolean, sanitized: boolean }
 */
function sanitizeEmailContent(emailData, preferHtml = true) {
  if (!emailData) {
    return {
      content: '',
      isHtml: false,
      sanitized: false
    };
  }

  // Determine which version to use
  let content = '';
  let isHtml = false;

  if (preferHtml && emailData.html) {
    content = emailData.html;
    isHtml = true;
  } else if (emailData.body) {
    content = emailData.body;
    // Detect if body contains HTML tags
    isHtml = /<[a-z][\s\S]*>/i.test(content);
  } else if (emailData.text) {
    content = emailData.text;
    isHtml = false;
  }

  if (!content) {
    return {
      content: '',
      isHtml: false,
      sanitized: false
    };
  }

  // Sanitize if HTML
  let sanitizedContent = content;
  let wasSanitized = false;

  if (isHtml) {
    sanitizedContent = sanitizeHtml(content);
    wasSanitized = (sanitizedContent !== content);
  }

  return {
    content: sanitizedContent,
    isHtml,
    sanitized: wasSanitized,
    originalLength: content.length,
    sanitizedLength: sanitizedContent.length
  };
}

/**
 * Sanitize quoted content for email replies
 * Specifically designed for when quoting original email in replies
 * 
 * @param {string} quotedContent - The content being quoted
 * @param {Object} options - Sanitization options
 * @returns {string} - Sanitized quoted content safe for inclusion in reply
 */
function sanitizeQuotedContent(quotedContent, options = {}) {
  const {
    maxDepth = 3,  // Maximum nesting depth for blockquotes
    stripStyles = false,  // Remove all style attributes
    ...sanitizeOptions
  } = options;

  let sanitized = sanitizeHtml(quotedContent, sanitizeOptions);

  // Optionally strip all styles
  if (stripStyles) {
    sanitized = sanitized.replace(/\s*style\s*=\s*["'][^"']*["']/gi, '');
  }

  // Limit blockquote nesting depth
  if (maxDepth > 0) {
    sanitized = limitBlockquoteDepth(sanitized, maxDepth);
  }

  return sanitized;
}

/**
 * Limit blockquote nesting depth to prevent deeply nested quotes
 * 
 * @param {string} html - HTML string
 * @param {number} maxDepth - Maximum allowed nesting depth
 * @returns {string} - HTML with limited nesting
 */
function limitBlockquoteDepth(html, maxDepth) {
  // Simple approach: count opening/closing blockquote tags
  // and flatten if exceeds max depth
  const blockquoteOpen = (html.match(/<blockquote[^>]*>/gi) || []).length;
  
  if (blockquoteOpen <= maxDepth) {
    return html;
  }

  // Replace excessive blockquotes with divs
  let depth = 0;
  let result = html;
  
  // This is a simplified approach - for production, use a proper HTML parser
  result = result.replace(/<blockquote[^>]*>/gi, (match) => {
    depth++;
    return depth <= maxDepth ? match : '<div class="flattened-quote">';
  });
  
  depth = 0;
  result = result.replace(/<\/blockquote>/gi, (match) => {
    depth++;
    return depth <= maxDepth ? match : '</div>';
  });

  return result;
}

/**
 * Validate if HTML is safe (no dangerous content detected)
 * 
 * @param {string} html - HTML to validate
 * @returns {Object} - { safe: boolean, issues: string[] }
 */
function validateHtml(html) {
  const issues = [];

  if (!html) {
    return { safe: true, issues: [] };
  }

  // Check for dangerous tags
  const dangerousTags = ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select'];
  dangerousTags.forEach(tag => {
    const regex = new RegExp(`<${tag}[\\s>]`, 'gi');
    if (regex.test(html)) {
      issues.push(`Dangerous tag detected: <${tag}>`);
    }
  });

  // Check for event handlers
  const eventHandlerRegex = /\s+on\w+\s*=/gi;
  if (eventHandlerRegex.test(html)) {
    issues.push('Event handler attributes detected');
  }

  // Check for dangerous schemes
  DANGEROUS_SCHEMES.forEach(scheme => {
    const regex = new RegExp(scheme, 'gi');
    if (regex.test(html)) {
      issues.push(`Dangerous URL scheme detected: ${scheme}`);
    }
  });

  return {
    safe: issues.length === 0,
    issues
  };
}

// ==================== Exports ====================

module.exports = {
  // Main functions
  sanitizeHtml,
  sanitizeEmailContent,
  sanitizeQuotedContent,
  
  // Validation
  validateHtml,
  
  // Utilities
  filterDangerousSchemes,
  removeEventHandlers,
  limitBlockquoteDepth,
  
  // Configuration (for advanced usage)
  DANGEROUS_SCHEMES,
  ALLOWED_TAGS,
  ALLOWED_ATTRIBUTES,
  ALLOWED_SCHEMES
};

// ==================== CLI Interface ====================

if (require.main === module) {
  // Run as CLI for testing
  const args = process.argv.slice(2);
  
  if (args[0] === 'test') {
    console.log('🧪 Running sanitize.js tests...\n');
    
    // Test 1: Script tag removal
    const test1 = '<p>Hello</p><script>alert("XSS")</script><p>World</p>';
    const result1 = sanitizeHtml(test1);
    console.log('Test 1 - Script tag removal:');
    console.log('  Input:', test1);
    console.log('  Output:', result1);
    console.log('  Pass:', !result1.includes('<script>') ? '✅' : '❌');
    console.log();
    
    // Test 2: Event handler removal
    const test2 = '<img src="x" onerror="alert(1)">';
    const result2 = sanitizeHtml(test2);
    console.log('Test 2 - Event handler removal:');
    console.log('  Input:', test2);
    console.log('  Output:', result2);
    console.log('  Pass:', !result2.includes('onerror') ? '✅' : '❌');
    console.log();
    
    // Test 3: Dangerous scheme filtering
    const test3 = '<a href="javascript:alert(1)">Click</a>';
    const result3 = sanitizeHtml(test3);
    console.log('Test 3 - Dangerous scheme filtering:');
    console.log('  Input:', test3);
    console.log('  Output:', result3);
    console.log('  Pass:', !result3.includes('javascript:') ? '✅' : '❌');
    console.log();
    
    // Test 4: Safe HTML preservation
    const test4 = '<p><strong>Hello</strong> <em>World</em></p><ul><li>Item 1</li></ul>';
    const result4 = sanitizeHtml(test4);
    console.log('Test 4 - Safe HTML preservation:');
    console.log('  Input:', test4);
    console.log('  Output:', result4);
    console.log('  Pass:', result4.includes('<strong>') && result4.includes('<em>') ? '✅' : '❌');
    console.log();
    
    // Test 5: Email content sanitization
    const test5 = {
      html: '<div><p>Hi</p><script>bad()</script><p>Bye</p></div>',
      text: 'Plain text fallback'
    };
    const result5 = sanitizeEmailContent(test5);
    console.log('Test 5 - Email content sanitization:');
    console.log('  Input HTML:', test5.html);
    console.log('  Output:', result5.content);
    console.log('  Pass:', !result5.content.includes('<script>') && result5.isHtml ? '✅' : '❌');
    console.log();
    
    console.log('✅ All tests completed\n');
  } else {
    console.log('HTML Sanitizer CLI');
    console.log('Usage: node lib/sanitize.js test');
    console.log('');
    console.log('For programmatic use:');
    console.log('  const { sanitizeHtml } = require("./lib/sanitize");');
    console.log('  const clean = sanitizeHtml(dirtyHtml);');
  }
}
