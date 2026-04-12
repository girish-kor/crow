'use strict';

/**
 * Deterministic intent parser.
 * Converts a natural-language intent string into a structured descriptor.
 */

const ACTION_MAP = {
  list:   ['list', 'get', 'fetch', 'read', 'find', 'retrieve', 'show', 'display', 'query'],
  create: ['create', 'add', 'insert', 'post', 'new', 'build', 'make', 'generate', 'register'],
  update: ['update', 'edit', 'modify', 'patch', 'change', 'put', 'alter'],
  delete: ['delete', 'remove', 'destroy', 'drop', 'purge', 'erase'],
  crud:   ['crud', 'full', 'complete', 'all', 'everything'],
  rest:   ['rest', 'restful', 'api', 'endpoint', 'route', 'resource', 'service'],
};

const KNOWN_RESOURCES = new Set([
  'user','product','order','post','comment','category','tag','review',
  'notification','payment','address','cart','invoice','subscription','role',
  'permission','session','log','report','file','customer','employee','department',
  'project','task','ticket','article','blog','event','booking','reservation',
  'message','conversation','friend','follower','like','vote','rating','inventory',
  'warehouse','shipment','coupon','discount','profile','token','webhook','config',
  'setting','audit','metric','dashboard','feed','attachment','media','document',
  'poll','survey','form','template','workflow','pipeline','deployment','release',
]);

const FRAMEWORK_MAP = {
  express: ['express', 'expressjs'],
  fastify: ['fastify'],
  koa:     ['koa', 'koajs'],
  hapi:    ['hapi', 'hapijs'],
};

const VALIDATION_MAP = {
  joi:  ['joi'],
  zod:  ['zod'],
  yup:  ['yup'],
};

const AUTH_MAP = {
  jwt:    ['jwt', 'token', 'bearer', 'auth', 'authenticate', 'authorization', 'secured', 'protected'],
  apikey: ['apikey', 'api-key', 'api_key', 'x-api-key'],
  oauth2: ['oauth', 'oauth2'],
  none:   ['public', 'open', 'anonymous', 'no-auth', 'noauth', 'unauthenticated'],
};

const DB_MAP = {
  mongodb:  ['mongo', 'mongodb', 'mongoose', 'nosql'],
  postgres: ['postgres', 'postgresql', 'pg', 'psql'],
  mysql:    ['mysql', 'mariadb'],
  sqlite:   ['sqlite', 'sqlite3'],
  redis:    ['redis', 'cache'],
};

const FEATURE_MAP = {
  pagination:  ['paginate', 'pagination', 'paged', 'offset', 'page'],
  search:      ['search', 'filter', 'fulltext', 'fuzzy'],
  upload:      ['upload', 'multipart', 'file-upload', 'media'],
  cache:       ['cache', 'cached', 'memoize'],
  rate_limit:  ['ratelimit', 'throttle', 'rate-limit'],
  soft_delete: ['soft-delete', 'softdelete', 'archive', 'restore'],
};

function tokenize(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .split(/[\s_-]+/)
    .filter(t => t.length > 0);
}

function matchFirst(tokens, map) {
  for (const [key, keywords] of Object.entries(map)) {
    for (const tok of tokens) {
      if (keywords.includes(tok)) return key;
    }
  }
  return null;
}

function matchAll(tokens, map) {
  const results = [];
  for (const [key, keywords] of Object.entries(map)) {
    for (const tok of tokens) {
      if (keywords.includes(tok)) { results.push(key); break; }
    }
  }
  return results;
}

function extractResource(tokens) {
  // 1. Direct match in known resources
  for (const tok of tokens) {
    if (KNOWN_RESOURCES.has(tok)) return tok;
  }
  // 2. De-pluralised match
  for (const tok of tokens) {
    const singular = tok.replace(/ies$/, 'y').replace(/s$/, '');
    if (KNOWN_RESOURCES.has(singular)) return singular;
  }
  // 3. Heuristic: first noun-like token not in stopwords / action keywords
  const stopwords = new Set([
    'create','get','with','for','the','a','an','and','or','api','rest','crud',
    'endpoint','route','using','use','add','full','build','make','generate',
    'service','backend','server','node','nodejs','express','fastify',
  ]);
  for (const tok of tokens) {
    if (!stopwords.has(tok) && tok.length > 2 && /^[a-z]+$/.test(tok)) return tok;
  }
  return 'resource';
}

/**
 * Parse a free-text intent string into a structured descriptor.
 * @param {string} intentStr
 * @returns {ParsedIntent}
 */
function parseIntent(intentStr) {
  if (typeof intentStr !== 'string' || !intentStr.trim()) {
    throw new Error('Intent must be a non-empty string');
  }

  const tokens = tokenize(intentStr.trim());

  return {
    raw:        intentStr.trim(),
    tokens,
    action:     matchFirst(tokens, ACTION_MAP)     || 'crud',
    resource:   extractResource(tokens),
    framework:  matchFirst(tokens, FRAMEWORK_MAP)  || 'express',
    validation: matchFirst(tokens, VALIDATION_MAP) || 'joi',
    auth:       matchFirst(tokens, AUTH_MAP)        || 'none',
    db:         matchFirst(tokens, DB_MAP)          || 'mongodb',
    features:   matchAll(tokens, FEATURE_MAP),
  };
}

module.exports = { parseIntent, tokenize, KNOWN_RESOURCES };
