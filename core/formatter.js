'use strict';

const prettier = require('prettier');

/**
 * Format generated source code using Prettier.
 * Falls back to original code on failure so generation is never blocked.
 */
async function formatCode(code, options = {}) {
  try {
    const formatted = await prettier.format(code, {
      parser:        'babel',
      singleQuote:   true,
      semi:          true,
      printWidth:    100,
      trailingComma: 'es5',
      tabWidth:      2,
      ...options,
    });
    return formatted;
  } catch (_err) {
    // Return unformatted code rather than failing the pipeline
    return code;
  }
}

module.exports = { formatCode };
