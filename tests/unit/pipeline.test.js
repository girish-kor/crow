'use strict';

const path = require('path');
const fs   = require('fs');
const { parse } = require('@babel/parser');

// Ensure dataset exists before pipeline tests
const DS_PATH = path.join(__dirname, '../../patterns/dataset.json');
beforeAll(() => {
  if (!fs.existsSync(DS_PATH)) {
    // Generate a minimal in-memory dataset for tests
    const mini = Array.from({ length: 100 }, (_, i) => ({
      id:         `test_${i}`,
      intent:     `create user CRUD API with express joi jwt mongodb test${i}`,
      action:     'crud',
      resource:   ['user', 'product', 'order', 'comment', 'category'][i % 5],
      framework:  ['express', 'fastify'][i % 2],
      validation: ['joi', 'zod'][i % 2],
      auth:       ['jwt', 'none'][i % 2],
      db:         ['mongodb', 'postgres'][i % 2],
      schema:     { fields: [{ name: 'name', type: 'string', required: true }] },
      output:     { type: 'router', framework: 'express', files: ['user.express.router.js'] },
      constraints: { requiresPagination: true },
    }));
    fs.mkdirSync(path.dirname(DS_PATH), { recursive: true });
    fs.writeFileSync(DS_PATH, JSON.stringify(mini, null, 2));
  }
});

const { run } = require('../../core/pipeline');
const { resetRanker } = require('../../core/patternSelector');

beforeEach(() => resetRanker());

describe('pipeline.run()', () => {
  test('returns code, outputPath and meta for dry run', async () => {
    const result = await run('create user CRUD API with JWT auth', { dryRun: true });
    expect(typeof result.code).toBe('string');
    expect(result.code.length).toBeGreaterThan(0);
    expect(result.outputPath).toBeNull();
    expect(result.meta).toBeDefined();
    expect(result.meta.parsed.resource).toBe('user');
  });

  test('generated code is valid JavaScript', async () => {
    const { code } = await run('build product REST API with zod', { dryRun: true });
    expect(() => parse(code, { sourceType: 'script' })).not.toThrow();
  });

  test('meta contains expected fields', async () => {
    const result = await run('create order api with fastify', { dryRun: true });
    expect(result.meta).toHaveProperty('intent');
    expect(result.meta).toHaveProperty('parsed');
    expect(result.meta).toHaveProperty('pattern');
    expect(result.meta).toHaveProperty('elapsed_ms');
  });

  test('throws on invalid intent', async () => {
    await expect(run('', { dryRun: true })).rejects.toThrow();
  });

  test('pipeline is deterministic', async () => {
    const intent  = 'create user CRUD API with express joi jwt mongodb';
    const result1 = await run(intent, { dryRun: true });
    const result2 = await run(intent, { dryRun: true });
    expect(result1.code).toBe(result2.code);
    expect(result1.meta.parsed.resource).toBe(result2.meta.parsed.resource);
  });

  test('writes file to output directory when not dry run', async () => {
    const tmpDir = path.join(__dirname, '../../generated/test_output');
    fs.mkdirSync(tmpDir, { recursive: true });
    const result = await run('create category api with express', { dryRun: false, outputDir: tmpDir });
    expect(result.outputPath).not.toBeNull();
    expect(fs.existsSync(result.outputPath)).toBe(true);
    fs.unlinkSync(result.outputPath); // cleanup
  });
});
