'use strict';

const { parse }                               = require('@babel/parser');
const { generateExpressCRUD, generateFastifyCRUD, generateCode } = require('../../core/codeGenerator');

function isValidJS(code) {
  try { parse(code, { sourceType: 'script' }); return true; }
  catch (_) { return false; }
}

describe('generateExpressCRUD()', () => {
  test('generates valid JavaScript for basic resource', () => {
    const code = generateExpressCRUD('user', {});
    expect(isValidJS(code)).toBe(true);
  });

  test('includes express require', () => {
    const code = generateExpressCRUD('product', {});
    expect(code).toContain('require("express")');
  });

  test('includes router setup', () => {
    const code = generateExpressCRUD('order', {});
    expect(code).toContain('Router');
  });

  test('includes joi schema when validation=joi', () => {
    const code = generateExpressCRUD('user', { validation: 'joi' });
    expect(code).toContain('Joi');
    expect(code).toContain('Schema');
  });

  test('includes zod schema when validation=zod', () => {
    const code = generateExpressCRUD('user', { validation: 'zod' });
    expect(code).toContain('zod');
    expect(code).toContain('Schema');
  });

  test('includes jwt auth when auth=jwt', () => {
    const code = generateExpressCRUD('user', { auth: 'jwt' });
    expect(code).toContain('jsonwebtoken');
    expect(code).toContain('authenticate');
  });

  test('does not include jwt when auth=none', () => {
    const code = generateExpressCRUD('user', { auth: 'none' });
    expect(code).not.toContain('jsonwebtoken');
  });

  test('includes all CRUD route methods', () => {
    const code = generateExpressCRUD('user', {});
    expect(code).toContain('router.get("/",');
    expect(code).toContain('router.post("/",');
    expect(code).toContain('router.put("/:id",');
    expect(code).toContain('router.delete("/:id",');
  });

  test('includes error handler', () => {
    const code = generateExpressCRUD('user', {});
    expect(code).toContain('errorHandler');
  });

  test('includes module.exports', () => {
    const code = generateExpressCRUD('user', {});
    expect(code).toContain('module.exports');
  });

  test('is deterministic — same input produces same output', () => {
    const opts  = { validation: 'joi', auth: 'jwt' };
    const code1 = generateExpressCRUD('user', opts);
    const code2 = generateExpressCRUD('user', opts);
    expect(code1).toBe(code2);
  });

  test('generates for different resources without errors', () => {
    const resources = ['product', 'order', 'comment', 'category', 'payment'];
    for (const resource of resources) {
      expect(() => generateExpressCRUD(resource, {})).not.toThrow();
      expect(isValidJS(generateExpressCRUD(resource, {}))).toBe(true);
    }
  });
});

describe('generateFastifyCRUD()', () => {
  test('generates valid JavaScript', () => {
    const code = generateFastifyCRUD('user', {});
    expect(isValidJS(code)).toBe(true);
  });

  test('includes fastify plugin pattern', () => {
    const code = generateFastifyCRUD('user', {});
    expect(code).toContain('Plugin');
    expect(code).toContain('module.exports');
  });
});

describe('generateCode()', () => {
  test('uses express by default', () => {
    const code = generateCode({ framework: 'express', validation: 'joi', auth: 'none', db: 'mongodb' }, { resource: 'user', framework: 'express', validation: 'joi', auth: 'none', db: 'mongodb', features: [] });
    expect(isValidJS(code)).toBe(true);
    expect(code).toContain('require("express")');
  });

  test('uses fastify when framework is fastify', () => {
    const code = generateCode({ framework: 'fastify', validation: 'joi', auth: 'none', db: 'mongodb' }, { resource: 'product', framework: 'fastify', validation: 'joi', auth: 'none', db: 'mongodb', features: [] });
    expect(isValidJS(code)).toBe(true);
    expect(code).toContain('Plugin');
  });
});
