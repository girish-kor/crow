'use strict';

const { TFIDFRanker, resetRanker } = require('../../core/patternSelector');

const MINI_CORPUS = [
  { id: '1', intent: 'create user CRUD API with express jwt', framework: 'express', validation: 'joi',  auth: 'jwt',  db: 'mongodb',  action: 'crud',   resource: 'user' },
  { id: '2', intent: 'build product REST API with fastify zod', framework: 'fastify', validation: 'zod', auth: 'none', db: 'postgres', action: 'crud',   resource: 'product' },
  { id: '3', intent: 'add order creation endpoint express joi', framework: 'express', validation: 'joi',  auth: 'none', db: 'mysql',   action: 'create', resource: 'order' },
  { id: '4', intent: 'list all users with pagination mongodb',  framework: 'express', validation: 'joi',  auth: 'jwt',  db: 'mongodb',  action: 'list',   resource: 'user' },
  { id: '5', intent: 'delete product endpoint fastify apikey',  framework: 'fastify', validation: 'zod', auth: 'apikey', db: 'postgres', action: 'delete', resource: 'product' },
];

beforeEach(() => resetRanker());

describe('TFIDFRanker', () => {
  test('throws on empty corpus', () => {
    expect(() => new TFIDFRanker([])).toThrow();
  });

  test('constructs ranker from corpus', () => {
    const ranker = new TFIDFRanker(MINI_CORPUS);
    expect(ranker.vocab.length).toBeGreaterThan(0);
    expect(ranker.corpus.length).toBe(MINI_CORPUS.length);
  });

  test('rank returns correct number of results', () => {
    const ranker  = new TFIDFRanker(MINI_CORPUS);
    const results = ranker.rank('create user api', 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  test('rank returns results sorted by descending score', () => {
    const ranker  = new TFIDFRanker(MINI_CORPUS);
    const results = ranker.rank('user CRUD express jwt', 5);
    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i].score).toBeGreaterThanOrEqual(results[i + 1].score);
    }
  });

  test('user query returns user-related pattern first', () => {
    const ranker  = new TFIDFRanker(MINI_CORPUS);
    const results = ranker.rank('create user CRUD API with express jwt', 5);
    expect(results[0].entry.resource).toBe('user');
  });

  test('product query returns product-related pattern first', () => {
    const ranker  = new TFIDFRanker(MINI_CORPUS);
    const results = ranker.rank('build product REST API fastify zod', 5);
    expect(results[0].entry.resource).toBe('product');
  });

  test('all scores are between 0 and 1', () => {
    const ranker  = new TFIDFRanker(MINI_CORPUS);
    const results = ranker.rank('anything', 5);
    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });

  test('identical query always returns same result (deterministic)', () => {
    const ranker   = new TFIDFRanker(MINI_CORPUS);
    const query    = 'create user CRUD API with express jwt';
    const results1 = ranker.rank(query, 5).map(r => r.entry.id);
    const results2 = ranker.rank(query, 5).map(r => r.entry.id);
    expect(results1).toEqual(results2);
  });
});
