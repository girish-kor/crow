'use strict';

const { parseIntent, tokenize } = require('../../core/intentParser');

describe('tokenize()', () => {
  test('lowercases and splits on spaces', () => {
    expect(tokenize('Create User API')).toEqual(['create', 'user', 'api']);
  });

  test('strips special characters', () => {
    expect(tokenize('user-api_v2!')).toEqual(['user', 'api', 'v2']);
  });

  test('filters empty tokens', () => {
    expect(tokenize('  hello   world  ')).toEqual(['hello', 'world']);
  });
});

describe('parseIntent()', () => {
  test('throws on empty string', () => {
    expect(() => parseIntent('')).toThrow();
    expect(() => parseIntent('   ')).toThrow();
  });

  test('throws on non-string', () => {
    expect(() => parseIntent(null)).toThrow();
    expect(() => parseIntent(42)).toThrow();
  });

  test('extracts resource correctly', () => {
    expect(parseIntent('create user api').resource).toBe('user');
    expect(parseIntent('build product endpoint').resource).toBe('product');
    expect(parseIntent('generate order service').resource).toBe('order');
  });

  test('extracts action correctly', () => {
    expect(parseIntent('create user api').action).toBe('create');
    expect(parseIntent('delete user api').action).toBe('delete');
    expect(parseIntent('full user crud api').action).toBe('crud');
    expect(parseIntent('list all users').action).toBe('list');
  });

  test('extracts framework correctly', () => {
    expect(parseIntent('build user api with express').framework).toBe('express');
    expect(parseIntent('user api using fastify').framework).toBe('fastify');
    expect(parseIntent('user api').framework).toBe('express'); // default
  });

  test('extracts validation lib correctly', () => {
    expect(parseIntent('user api with joi validation').validation).toBe('joi');
    expect(parseIntent('user api with zod').validation).toBe('zod');
    expect(parseIntent('user api').validation).toBe('joi'); // default
  });

  test('extracts auth type correctly', () => {
    expect(parseIntent('user api with jwt auth').auth).toBe('jwt');
    expect(parseIntent('secured user api').auth).toBe('jwt');
    expect(parseIntent('public user api').auth).toBe('none');
    expect(parseIntent('user api with apikey').auth).toBe('apikey');
  });

  test('extracts db type correctly', () => {
    expect(parseIntent('user api with mongodb').db).toBe('mongodb');
    expect(parseIntent('user api using postgres').db).toBe('postgres');
    expect(parseIntent('user api').db).toBe('mongodb'); // default
  });

  test('extracts features correctly', () => {
    const result = parseIntent('user api with pagination and search');
    expect(result.features).toContain('pagination');
    expect(result.features).toContain('search');
  });

  test('returns raw intent and tokens', () => {
    const result = parseIntent('create user api');
    expect(result.raw).toBe('create user api');
    expect(Array.isArray(result.tokens)).toBe(true);
    expect(result.tokens.length).toBeGreaterThan(0);
  });

  test('de-pluralises resource', () => {
    expect(parseIntent('list all users').resource).toBe('user');
    expect(parseIntent('get all products').resource).toBe('product');
  });
});
