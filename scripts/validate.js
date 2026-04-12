'use strict';

/**
 * Validate script — runs a generation smoke-test and checks the output.
 * Used by the CI/CD pipeline: npm run validate
 */

const path   = require('path');
const fs     = require('fs');
const { parse } = require('@babel/parser');

async function main() {
  console.log('[validate] Starting CROW validation suite…\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, msg) {
    if (condition) { console.log(`  ✓ ${msg}`); passed++; }
    else           { console.error(`  ✗ ${msg}`); failed++; }
  }

  // 1. Dataset exists and is valid
  const dsPath = path.join(__dirname, '../patterns/dataset.json');
  assert(fs.existsSync(dsPath), 'Dataset file exists');

  let dataset = [];
  try {
    dataset = JSON.parse(fs.readFileSync(dsPath, 'utf8'));
    assert(true, 'Dataset is valid JSON');
  } catch (_) {
    assert(false, 'Dataset is valid JSON');
  }

  assert(dataset.length >= 3000, `Dataset has ≥ 3000 entries (got ${dataset.length})`);

  // Dedup check
  const ids = dataset.map(e => e.id);
  assert(new Set(ids).size === ids.length, 'Dataset has no duplicate IDs');

  // Schema check
  const requiredFields = ['id', 'intent', 'action', 'resource', 'framework', 'validation', 'auth', 'db'];
  const allValid = dataset.every(e => requiredFields.every(f => e[f] !== undefined));
  assert(allValid, 'All entries have required fields');

  // 2. Pipeline smoke test
  console.log('\n[validate] Running generation smoke tests…\n');
  const { run } = require('../core/pipeline');

  const testCases = [
    { intent: 'create user CRUD API with JWT auth',           expect: { resource: 'user' } },
    { intent: 'build product API with zod validation',        expect: { resource: 'product' } },
    { intent: 'generate order api with fastify',              expect: { resource: 'order' } },
    { intent: 'create comment list endpoint with pagination', expect: { resource: 'comment' } },
    { intent: 'add customer subscription management API',     expect: { resource: 'customer' } },
  ];

  for (const tc of testCases) {
    try {
      const result = await run(tc.intent, { dryRun: true });

      assert(typeof result.code === 'string' && result.code.length > 0, `Generated code for: "${tc.intent}"`);
      assert(result.meta.parsed.resource === tc.expect.resource,
        `Correct resource extracted: ${result.meta.parsed.resource} === ${tc.expect.resource}`);

      // Parse generated code
      try {
        parse(result.code, { sourceType: 'script' });
        assert(true, `Generated code is valid JS for: "${tc.intent}"`);
      } catch (parseErr) {
        assert(false, `Generated code is valid JS for: "${tc.intent}" — ${parseErr.message}`);
      }
    } catch (err) {
      assert(false, `Pipeline ran for: "${tc.intent}" — ${err.message}`);
    }
  }

  // 3. Summary
  console.log(`\n[validate] Results: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('[validate] Fatal error:', err);
  process.exit(1);
});
