'use strict';

/**
 * Dataset seed script.
 * Generates structured, deduplicated pattern entries by combinatorial expansion
 * of resources × frameworks × validations × auth strategies × db types × actions.
 *
 * Run: node patterns/seed.js
 */

const fs   = require('fs');
const path = require('path');

const RESOURCES = [
  'user','product','order','post','comment','category','tag','review',
  'notification','payment','address','cart','invoice','subscription','role',
  'permission','session','report','file','customer','employee','department',
  'project','task','ticket','article','blog','event','booking','reservation',
  'message','conversation','follower','rating','inventory','shipment',
  'coupon','profile','webhook','metric','dashboard','attachment','document',
  'poll','survey','form','template','workflow','deployment','release','audit',
];

const FRAMEWORKS  = ['express', 'fastify', 'koa', 'hapi'];
const VALIDATIONS = ['joi', 'zod', 'yup'];
const AUTH_TYPES  = ['jwt', 'apikey', 'oauth2', 'none'];
const DB_TYPES    = ['mongodb', 'postgres', 'mysql', 'sqlite', 'redis'];
const ACTIONS     = ['crud', 'create', 'read', 'update', 'delete', 'list'];

const INTENT_TEMPLATES = {
  crud:   (r, fw, val, auth, db) => `create full ${r} CRUD API with ${fw} ${val} ${auth} and ${db}`,
  create: (r, fw, val, auth, db) => `add ${r} creation endpoint using ${fw} with ${val} validation and ${auth} auth`,
  read:   (r, fw, val, auth, db) => `build ${r} read endpoint using ${fw} ${db} database`,
  update: (r, fw, val, auth, db) => `implement ${r} update route with ${fw} and ${val}`,
  delete: (r, fw, val, auth, db) => `remove ${r} delete endpoint using ${fw}`,
  list:   (r, fw, val, auth, db) => `list all ${r}s with pagination using ${fw} and ${db}`,
};

const CONSTRAINT_TEMPLATES = {
  crud:   { requiresPagination: true,  requiresSearch: false, requiresSoftDelete: false },
  create: { requiresPagination: false, requiresSearch: false, requiresSoftDelete: false },
  read:   { requiresPagination: false, requiresSearch: true,  requiresSoftDelete: false },
  update: { requiresPagination: false, requiresSearch: false, requiresSoftDelete: false },
  delete: { requiresPagination: false, requiresSearch: false, requiresSoftDelete: true  },
  list:   { requiresPagination: true,  requiresSearch: true,  requiresSoftDelete: false },
};

const SCHEMA_FIELDS = {
  user:         [{ name: 'name', type: 'string', required: true }, { name: 'email', type: 'string', required: true }, { name: 'password', type: 'string', required: true }],
  product:      [{ name: 'title', type: 'string', required: true }, { name: 'price', type: 'number', required: true }, { name: 'stock', type: 'number', required: false }],
  order:        [{ name: 'userId', type: 'string', required: true }, { name: 'items', type: 'array', required: true }, { name: 'total', type: 'number', required: true }],
  post:         [{ name: 'title', type: 'string', required: true }, { name: 'body', type: 'string', required: true }, { name: 'authorId', type: 'string', required: true }],
  comment:      [{ name: 'text', type: 'string', required: true }, { name: 'postId', type: 'string', required: true }, { name: 'authorId', type: 'string', required: false }],
  category:     [{ name: 'name', type: 'string', required: true }, { name: 'slug', type: 'string', required: true }],
  _default:     [{ name: 'name', type: 'string', required: true }, { name: 'description', type: 'string', required: false }, { name: 'status', type: 'string', required: false }],
};

function getSchema(resource) {
  return SCHEMA_FIELDS[resource] || SCHEMA_FIELDS['_default'];
}

function buildOutputStructure(resource, action, framework, validation) {
  return {
    type:       'router',
    framework,
    validation,
    files: [`${resource}.${framework}.router.js`],
    exports:    ['router'],
    middleware: ['errorHandler'],
    endpoints:  buildEndpoints(action, resource),
  };
}

function buildEndpoints(action, resource) {
  const base = [{ method: 'GET', path: `/${resource}s`, handler: `list${cap(resource)}` }];
  if (['crud', 'create'].includes(action)) base.push({ method: 'POST',   path: `/${resource}s`,     handler: `create${cap(resource)}` });
  if (['crud', 'read']  .includes(action)) base.push({ method: 'GET',    path: `/${resource}s/:id`, handler: `get${cap(resource)}` });
  if (['crud', 'update'].includes(action)) base.push({ method: 'PUT',    path: `/${resource}s/:id`, handler: `update${cap(resource)}` });
  if (['crud', 'delete'].includes(action)) base.push({ method: 'DELETE', path: `/${resource}s/:id`, handler: `delete${cap(resource)}` });
  return base;
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function makeId(parts) {
  return parts.join('_').replace(/[^a-z0-9_]/gi, '_').toLowerCase();
}

// ── Deduplication ─────────────────────────────────────────────────────────────
const seen = new Set();

function dedup(entry) {
  const key = entry.id;
  if (seen.has(key)) return null;
  seen.add(key);
  return entry;
}

// ── Edge-case intents ─────────────────────────────────────────────────────────
const EDGE_CASES = [
  { intent: 'create api without authentication',              framework: 'express', validation: 'joi', auth: 'none',   db: 'mongodb',  action: 'crud',   resource: 'resource' },
  { intent: 'build user api missing email field',             framework: 'express', validation: 'joi', auth: 'jwt',    db: 'mongodb',  action: 'create', resource: 'user' },
  { intent: 'generate product api with nested variants',      framework: 'fastify', validation: 'zod', auth: 'jwt',    db: 'postgres', action: 'crud',   resource: 'product' },
  { intent: 'create order api with invalid schema types',     framework: 'express', validation: 'zod', auth: 'apikey', db: 'mysql',    action: 'create', resource: 'order' },
  { intent: 'build api with empty resource name',             framework: 'express', validation: 'joi', auth: 'none',   db: 'sqlite',   action: 'crud',   resource: 'item' },
  { intent: 'generate user list endpoint without pagination', framework: 'express', validation: 'joi', auth: 'jwt',    db: 'mongodb',  action: 'list',   resource: 'user' },
  { intent: 'create deeply nested comment thread api',        framework: 'fastify', validation: 'zod', auth: 'jwt',    db: 'postgres', action: 'crud',   resource: 'comment' },
  { intent: 'build product api with redis cache layer',       framework: 'express', validation: 'joi', auth: 'jwt',    db: 'redis',    action: 'read',   resource: 'product' },
  { intent: 'add soft delete to user entity',                 framework: 'express', validation: 'joi', auth: 'jwt',    db: 'postgres', action: 'delete', resource: 'user' },
  { intent: 'generate report api with date range filter',     framework: 'express', validation: 'zod', auth: 'oauth2', db: 'postgres', action: 'list',   resource: 'report' },
];

// ── Main generator ────────────────────────────────────────────────────────────
function generateDataset(targetSize = 5000) {
  const entries = [];
  let counter   = 0;

  // Combinatorial entries
  outer:
  for (const resource of RESOURCES) {
    for (const framework of FRAMEWORKS) {
      for (const validation of VALIDATIONS) {
        for (const auth of AUTH_TYPES) {
          for (const db of DB_TYPES) {
            for (const action of ACTIONS) {
              if (entries.length >= targetSize) break outer;

              const intentFn = INTENT_TEMPLATES[action];
              const intent   = intentFn(resource, framework, validation, auth, db);
              const id       = makeId([resource, framework, validation, auth, db, action, String(counter++)]);

              const entry = dedup({
                id,
                intent,
                action,
                resource,
                framework,
                validation,
                auth,
                db,
                schema:      { fields: getSchema(resource) },
                output:      buildOutputStructure(resource, action, framework, validation),
                constraints: CONSTRAINT_TEMPLATES[action],
              });

              if (entry) entries.push(entry);
            }
          }
        }
      }
    }
  }

  // Append edge cases (deduplicated)
  for (const ec of EDGE_CASES) {
    const id = makeId([ec.resource, ec.framework, ec.validation, ec.auth, ec.action, 'edge', String(counter++)]);
    const entry = dedup({ id, ...ec,
      schema:      { fields: getSchema(ec.resource) },
      output:      buildOutputStructure(ec.resource, ec.action, ec.framework, ec.validation),
      constraints: CONSTRAINT_TEMPLATES[ec.action],
    });
    if (entry) entries.push(entry);
  }

  return entries;
}

// ── Entry point ───────────────────────────────────────────────────────────────
const TARGET_SIZE  = parseInt(process.env.DATASET_SIZE || '5000', 10);
const OUT_PATH     = path.join(__dirname, 'dataset.json');

console.log(`[CROW seed] Generating ${TARGET_SIZE} dataset entries…`);
const dataset = generateDataset(TARGET_SIZE);
console.log(`[CROW seed] Generated ${dataset.length} unique entries`);

fs.writeFileSync(OUT_PATH, JSON.stringify(dataset, null, 2), 'utf8');
console.log(`[CROW seed] Written → ${OUT_PATH}`);
