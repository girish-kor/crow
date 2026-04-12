'use strict';

const path   = require('path');
const fs     = require('fs');
const logger = require('./logger');
const { parseIntent }    = require('./intentParser');
const { selectPattern }  = require('./patternSelector');
const { generateCode }   = require('./codeGenerator');
const { formatCode }     = require('./formatter');
const config             = require('../configs/default.json');

/**
 * Full generation pipeline:
 *   intentStr → parseIntent → selectPattern → generateCode → formatCode → file
 *
 * @param {string} intentStr
 * @param {object} opts
 * @returns {Promise<{ code: string, outputPath: string, meta: object }>}
 */
async function run(intentStr, opts = {}) {
  const start = Date.now();
  logger.info({ phase: 'pipeline.start', intent: intentStr });

  // 1. Intent parsing
  const parsedIntent = parseIntent(intentStr);
  logger.info({ phase: 'intent.parsed', parsedIntent });

  // 2. Pattern selection
  const topN    = opts.topN || config.patternSelector.topN;
  const matches = selectPattern(intentStr, topN);

  if (matches.length === 0) {
    logger.warn({ phase: 'pattern.select', msg: 'No patterns matched — using defaults' });
  }

  const bestMatch = matches[0] ? matches[0].entry : buildDefaultPattern(parsedIntent);
  logger.info({ phase: 'pattern.selected', score: matches[0] ? matches[0].score : 0, pattern: bestMatch.id });

  // 3. Code generation
  const rawCode = generateCode(bestMatch, parsedIntent);
  logger.info({ phase: 'code.generated', bytes: rawCode.length });

  // 4. Formatting
  const code = await formatCode(rawCode);
  logger.info({ phase: 'code.formatted' });

  // 5. Write output
  const outputDir = opts.outputDir
    ? path.resolve(opts.outputDir)
    : path.join(__dirname, '..', config.generation.outputDir);

  fs.mkdirSync(outputDir, { recursive: true });

  const filename   = `${parsedIntent.resource}.${bestMatch.framework || parsedIntent.framework}.router.js`;
  const outputPath = path.join(outputDir, filename);

  if (!opts.dryRun) {
    fs.writeFileSync(outputPath, code, 'utf8');
    logger.info({ phase: 'output.written', outputPath });
  }

  const elapsed = Date.now() - start;
  logger.info({ phase: 'pipeline.done', elapsed_ms: elapsed });

  return {
    code,
    outputPath: opts.dryRun ? null : outputPath,
    meta: {
      intent:     intentStr,
      parsed:     parsedIntent,
      pattern:    bestMatch,
      score:      matches[0] ? matches[0].score : 0,
      elapsed_ms: elapsed,
    },
  };
}

function buildDefaultPattern(parsedIntent) {
  return {
    id:         'default',
    intent:     parsedIntent.raw,
    framework:  parsedIntent.framework,
    validation: parsedIntent.validation,
    auth:       parsedIntent.auth,
    db:         parsedIntent.db,
    action:     parsedIntent.action,
    resource:   parsedIntent.resource,
  };
}

module.exports = { run };
