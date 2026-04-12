'use strict';

const t          = require('@babel/types');
const _gen       = require('@babel/generator');
const { parse }  = require('@babel/parser');
const generate   = typeof _gen === 'function' ? _gen : (_gen.default || _gen);

// ── Low-level AST helpers ─────────────────────────────────────────────────────
const id    = name  => t.identifier(name);
const str   = val   => t.stringLiteral(val);
const num   = val   => t.numericLiteral(val);
const nullL = ()    => t.nullLiteral();
const arr   = items => t.arrayExpression(items);

function obj(props) {
  return t.objectExpression(
    Object.entries(props).map(([k, v]) =>
      t.objectProperty(id(k), v instanceof Object && v.type ? v : str(String(v)))
    )
  );
}

function objRaw(propNodes) { return t.objectExpression(propNodes); }
function prop(key, val)    { return t.objectProperty(id(key), val); }

function call(callee, args = []) { return t.callExpression(callee, args); }
function expr(e)   { return t.expressionStatement(e); }
function ret(e)    { return t.returnStatement(e); }
function block(stmts) { return t.blockStatement(stmts); }

function constDecl(name, init) {
  return t.variableDeclaration('const', [t.variableDeclarator(id(name), init)]);
}

function requireDecl(name, pkg) {
  return constDecl(name, call(id('require'), [str(pkg)]));
}

function requireDestructure(names, pkg) {
  return t.variableDeclaration('const', [
    t.variableDeclarator(
      t.objectPattern(names.map(n => t.objectProperty(id(n), id(n), false, true))),
      call(id('require'), [str(pkg)])
    )
  ]);
}

function asyncArrow(params, bodyStmts) {
  return t.arrowFunctionExpression(params.map(id), block(bodyStmts), true);
}

function tryCatch(tryStmts, catchParam, catchStmts) {
  return t.tryStatement(
    block(tryStmts),
    t.catchClause(id(catchParam), block(catchStmts))
  );
}

function ifStmt(test, consequent, alternate = null) {
  return t.ifStatement(test, t.isBlockStatement(consequent) ? consequent : block([consequent]), alternate);
}

// ── Response helpers ──────────────────────────────────────────────────────────
function sendJson(status, bodyNode) {
  const chained = call(
    t.memberExpression(call(t.memberExpression(id('res'), id('status')), [num(status)]), id('json')),
    [bodyNode]
  );
  return chained;
}

// ── Schema builders ───────────────────────────────────────────────────────────
const DEFAULT_FIELDS = [
  { name: 'name',        kind: 'string',  min: 2,  max: 100, required: true },
  { name: 'description', kind: 'string',  max: 500,          required: false },
  { name: 'status',      kind: 'string',  max: 50,           required: false },
];

function buildJoiSchema(resource, fields = DEFAULT_FIELDS) {
  const propNodes = fields.map(f => {
    let chain = call(t.memberExpression(id('Joi'), id('string')), []);
    if (f.min) chain = call(t.memberExpression(chain, id('min')), [num(f.min)]);
    if (f.max) chain = call(t.memberExpression(chain, id('max')), [num(f.max)]);
    if (f.required) chain = call(t.memberExpression(chain, id('required')), []);
    else            chain = call(t.memberExpression(chain, id('optional')), []);
    return t.objectProperty(id(f.name), chain);
  });

  return constDecl(
    `${resource}Schema`,
    call(t.memberExpression(id('Joi'), id('object')), [t.objectExpression(propNodes)])
  );
}

function buildZodSchema(resource, fields = DEFAULT_FIELDS) {
  const propNodes = fields.map(f => {
    let chain = call(t.memberExpression(id('z'), id('string')), []);
    if (f.min) chain = call(t.memberExpression(chain, id('min')), [num(f.min)]);
    if (f.max) chain = call(t.memberExpression(chain, id('max')), [num(f.max)]);
    if (!f.required) chain = call(t.memberExpression(chain, id('optional')), []);
    return t.objectProperty(id(f.name), chain);
  });

  return constDecl(
    `${resource}Schema`,
    call(t.memberExpression(id('z'), id('object')), [t.objectExpression(propNodes)])
  );
}

// ── Auth middleware ───────────────────────────────────────────────────────────
function buildJwtAuthFn() {
  const JWT_SECRET = t.logicalExpression('||',
    t.memberExpression(t.memberExpression(id('process'), id('env')), id('JWT_SECRET')),
    str('crow-dev-secret')
  );

  const body = [
    constDecl('authHeader', t.memberExpression(t.memberExpression(id('req'), id('headers')), id('authorization'))),
    ifStmt(
      t.logicalExpression('||',
        t.unaryExpression('!', id('authHeader')),
        t.unaryExpression('!', call(t.memberExpression(id('authHeader'), id('startsWith')), [str('Bearer ')]))
      ),
      block([ret(sendJson(401, obj({ error: str('Authorization header required') })))])
    ),
    constDecl('token', call(t.memberExpression(id('authHeader'), id('slice')), [num(7)])),
    tryCatch(
      [
        expr(t.assignmentExpression('=',
          t.memberExpression(id('req'), id('user')),
          call(t.memberExpression(id('jwt'), id('verify')), [id('token'), JWT_SECRET])
        )),
        expr(call(id('next'), [])),
      ],
      '_e',
      [ret(sendJson(401, obj({ error: str('Invalid or expired token') })))]
    ),
  ];

  return t.functionDeclaration(id('authenticate'), [id('req'), id('res'), id('next')], block(body), false, false, false, []);
}

function buildApiKeyAuthFn() {
  const body = [
    constDecl('apiKey', t.memberExpression(
      t.memberExpression(id('req'), id('headers')),
      id('x-api-key')
    )),
    constDecl('validKey', t.logicalExpression('||',
      t.memberExpression(t.memberExpression(id('process'), id('env')), id('API_KEY')),
      str('crow-dev-key')
    )),
    ifStmt(
      t.binaryExpression('!==', id('apiKey'), id('validKey')),
      block([ret(sendJson(401, obj({ error: str('Invalid API key') })))])
    ),
    expr(call(id('next'), [])),
  ];

  return t.functionDeclaration(id('authenticate'), [id('req'), id('res'), id('next')], block(body), false, false, false, []);
}

// ── Route handler bodies ──────────────────────────────────────────────────────
function listBody(resource) {
  return [
    t.variableDeclaration('const', [
      t.variableDeclarator(
        t.objectPattern([
          t.objectProperty(id('page'),  t.assignmentPattern(id('page'), num(1)), false, false),
          t.objectProperty(id('limit'), t.assignmentPattern(id('limit'), num(10)), false, false),
        ]),
        t.memberExpression(id('req'), id('query'))
      )
    ]),
    constDecl('offset', t.binaryExpression('*',
      t.parenthesizedExpression(t.binaryExpression('-', call(id('Number'), [id('page')]), num(1))),
      call(id('Number'), [id('limit')])
    )),
    expr(call(t.memberExpression(id('logger'), id('info')), [
      objRaw([prop('action', str(`list_${resource}`)), prop('page', id('page')), prop('limit', id('limit'))])
    ])),
    expr(sendJson(200, objRaw([
      prop('data',   arr([])),
      prop('total',  num(0)),
      prop('page',   call(id('Number'), [id('page')])),
      prop('limit',  call(id('Number'), [id('limit')])),
      prop('offset', id('offset')),
    ]))),
  ];
}

function getOneBody(resource) {
  return [
    t.variableDeclaration('const', [
      t.variableDeclarator(
        t.objectPattern([t.objectProperty(id('id'), id('id'), false, false)]),
        t.memberExpression(id('req'), id('params'))
      )
    ]),
    expr(call(t.memberExpression(id('logger'), id('info')), [
      objRaw([prop('action', str(`get_${resource}`)), prop('id', id('id'))])
    ])),
    expr(sendJson(200, objRaw([prop('data', nullL()), prop('id', id('id'))]))),
  ];
}

function createBody(resource, validation) {
  const stmts = [];

  if (validation === 'joi') {
    stmts.push(
      t.variableDeclaration('const', [
        t.variableDeclarator(
          t.objectPattern([
            t.objectProperty(id('error'), id('validationError'), false, false),
            t.objectProperty(id('value'), id('body'), false, false),
          ]),
          call(t.memberExpression(id(`${resource}Schema`), id('validate')), [t.memberExpression(id('req'), id('body'))])
        )
      ])
    );
    stmts.push(ifStmt(id('validationError'), block([
      ret(sendJson(422, objRaw([
        prop('error', str('Validation failed')),
        prop('details', t.memberExpression(id('validationError'), id('message'))),
      ])))
    ])));
  } else if (validation === 'zod') {
    stmts.push(constDecl('parseResult',
      call(t.memberExpression(id(`${resource}Schema`), id('safeParse')), [t.memberExpression(id('req'), id('body'))])
    ));
    stmts.push(ifStmt(
      t.unaryExpression('!', t.memberExpression(id('parseResult'), id('success'))),
      block([ret(sendJson(422, objRaw([
        prop('error', str('Validation failed')),
        prop('details', t.memberExpression(t.memberExpression(id('parseResult'), id('error')), id('errors'))),
      ])))])
    ));
    stmts.push(constDecl('body', t.memberExpression(id('parseResult'), id('data'))));
  } else {
    stmts.push(constDecl('body', t.memberExpression(id('req'), id('body'))));
  }

  stmts.push(
    expr(call(t.memberExpression(id('logger'), id('info')), [
      objRaw([prop('action', str(`create_${resource}`)), prop('body', id('body'))])
    ])),
    expr(sendJson(201, objRaw([prop('data', id('body')), prop('message', str(`${resource} created successfully`))])))
  );

  return stmts;
}

function updateBody(resource, validation) {
  const stmts = [
    t.variableDeclaration('const', [
      t.variableDeclarator(
        t.objectPattern([t.objectProperty(id('id'), id('id'), false, false)]),
        t.memberExpression(id('req'), id('params'))
      )
    ]),
  ];

  if (validation === 'joi') {
    stmts.push(
      t.variableDeclaration('const', [
        t.variableDeclarator(
          t.objectPattern([
            t.objectProperty(id('error'), id('validationError'), false, false),
            t.objectProperty(id('value'), id('body'), false, false),
          ]),
          call(
            t.memberExpression(
              call(t.memberExpression(id(`${resource}Schema`), id('fork')),
                [arr([str('name'), str('description'), str('status')]),
                  t.arrowFunctionExpression([id('s')], call(t.memberExpression(id('s'), id('optional')), []))]
              ),
              id('validate')
            ),
            [t.memberExpression(id('req'), id('body'))]
          )
        )
      ])
    );
    stmts.push(ifStmt(id('validationError'), block([
      ret(sendJson(422, objRaw([prop('error', str('Validation failed')), prop('details', t.memberExpression(id('validationError'), id('message')))])))
    ])));
  } else {
    stmts.push(constDecl('body', t.memberExpression(id('req'), id('body'))));
  }

  stmts.push(
    expr(call(t.memberExpression(id('logger'), id('info')), [
      objRaw([prop('action', str(`update_${resource}`)), prop('id', id('id'))])
    ])),
    expr(sendJson(200, objRaw([
      prop('data', id('body')),
      prop('id', id('id')),
      prop('message', str(`${resource} updated successfully`)),
    ])))
  );
  return stmts;
}

function deleteBody(resource) {
  return [
    t.variableDeclaration('const', [
      t.variableDeclarator(
        t.objectPattern([t.objectProperty(id('id'), id('id'), false, false)]),
        t.memberExpression(id('req'), id('params'))
      )
    ]),
    expr(call(t.memberExpression(id('logger'), id('info')), [
      objRaw([prop('action', str(`delete_${resource}`)), prop('id', id('id'))])
    ])),
    expr(sendJson(200, objRaw([prop('message', str(`${resource} deleted successfully`)), prop('id', id('id'))]))),
  ];
}

// ── Route registration ────────────────────────────────────────────────────────
function routeStmt(method, path, hasAuth, handlerBodyFn) {
  const handler = asyncArrow(
    ['req', 'res', 'next'],
    [tryCatch(handlerBodyFn, 'error', [
      expr(call(t.memberExpression(id('logger'), id('error')), [id('error')])),
      expr(call(id('next'), [id('error')])),
    ])]
  );
  const args = [str(path)];
  if (hasAuth) args.push(id('authenticate'));
  args.push(handler);
  return expr(call(t.memberExpression(id('router'), id(method)), args));
}

// ── Error handler middleware ──────────────────────────────────────────────────
function buildErrorHandler() {
  const body = [
    expr(call(t.memberExpression(id('logger'), id('error')), [objRaw([
      prop('err', id('err')),
      prop('path', t.memberExpression(t.memberExpression(id('req'), id('url')), id('pathname'))),
    ])])),
    constDecl('status', t.logicalExpression('||', t.memberExpression(id('err'), id('status')), num(500))),
    expr(sendJson(500, objRaw([
      prop('error', t.logicalExpression('||', t.memberExpression(id('err'), id('message')), str('Internal server error'))),
      prop('status', id('status')),
    ]))),
  ];
  return t.functionDeclaration(
    id('errorHandler'),
    [id('err'), id('req'), id('res'), id('next')],
    block(body),
    false,
    false,
    false,
    []
  );
}

// ── Main code generation ──────────────────────────────────────────────────────
function generateExpressCRUD(resource, options = {}) {
  const { validation = 'joi', auth = 'none' } = options;
  const hasAuth = auth !== 'none';
  const stmts   = [];

  // 'use strict'
  stmts.push(expr(str('use strict')));

  // Imports
  stmts.push(requireDecl('express', 'express'));
  if (validation === 'joi') stmts.push(requireDecl('Joi', 'joi'));
  if (validation === 'zod') stmts.push(requireDestructure(['z'], 'zod'));
  if (hasAuth && auth === 'jwt')    stmts.push(requireDecl('jwt', 'jsonwebtoken'));
  stmts.push(requireDecl('pino', 'pino'));

  // Setup
  stmts.push(constDecl('router', call(t.memberExpression(id('express'), id('Router')), [])));
  stmts.push(constDecl('logger', call(id('pino'), [objRaw([prop('level', str('info'))])])));

  // Schema
  if (validation === 'joi')        stmts.push(buildJoiSchema(resource));
  else if (validation === 'zod')   stmts.push(buildZodSchema(resource));

  // Auth middleware
  if (hasAuth) {
    stmts.push(auth === 'apikey' ? buildApiKeyAuthFn() : buildJwtAuthFn());
  }

  // Routes: list, getOne, create, update, delete
  stmts.push(routeStmt('get',    '/',    hasAuth, listBody(resource)));
  stmts.push(routeStmt('get',    '/:id', hasAuth, getOneBody(resource)));
  stmts.push(routeStmt('post',   '/',    hasAuth, createBody(resource, validation)));
  stmts.push(routeStmt('put',    '/:id', hasAuth, updateBody(resource, validation)));
  stmts.push(routeStmt('delete', '/:id', hasAuth, deleteBody(resource)));

  // Error handler
  stmts.push(buildErrorHandler());
  stmts.push(expr(call(t.memberExpression(id('router'), id('use')), [id('errorHandler')])));

  // Exports
  stmts.push(expr(t.assignmentExpression('=',
    t.memberExpression(id('module'), id('exports')),
    objRaw([prop('router', id('router')), prop('errorHandler', id('errorHandler'))])
  )));

  const program  = t.program(stmts);
  const { code } = generate(program, { retainLines: false, compact: false });

  // Validate generated code is parse-able
  parse(code, { sourceType: 'script' });

  return code;
}

function generateFastifyCRUD(resource, options = {}) {
  const { validation = 'joi', auth = 'none' } = options;
  const hasAuth = auth !== 'none';
  const stmts   = [];

  stmts.push(expr(str('use strict')));
  stmts.push(requireDecl('pino', 'pino'));
  if (validation === 'joi') stmts.push(requireDecl('Joi', 'joi'));
  if (validation === 'zod') stmts.push(requireDestructure(['z'], 'zod'));
  if (hasAuth) stmts.push(requireDecl('jwt', 'jsonwebtoken'));

  stmts.push(constDecl('logger', call(id('pino'), [objRaw([prop('level', str('info'))])])));
  if (validation === 'joi') stmts.push(buildJoiSchema(resource));
  else if (validation === 'zod') stmts.push(buildZodSchema(resource));

  // Fastify plugin
  const pluginBody = [
    // GET /
    expr(call(t.memberExpression(id('fastify'), id('get')), [
      str(`/${resource}s`),
      asyncArrow(['request', 'reply'], [
        tryCatch(
          [
            constDecl('{ page = 1, limit = 10 }', t.memberExpression(id('request'), id('query'))),
            expr(call(t.memberExpression(id('logger'), id('info')), [objRaw([prop('action', str(`list_${resource}`))])])),
            expr(call(t.memberExpression(id('reply'), id('send')), [objRaw([prop('data', arr([])), prop('page', id('page')), prop('limit', id('limit'))])])),
          ],
          'error',
          [expr(call(t.memberExpression(id('reply'), id('status')), [num(500)])), expr(call(t.memberExpression(id('reply'), id('send')), [objRaw([prop('error', t.memberExpression(id('error'), id('message')))])]))]
        )
      ])
    ])),
    // POST /
    expr(call(t.memberExpression(id('fastify'), id('post')), [
      str(`/${resource}s`),
      asyncArrow(['request', 'reply'], [
        tryCatch(
          [
            constDecl('body', t.memberExpression(id('request'), id('body'))),
            expr(call(t.memberExpression(id('logger'), id('info')), [objRaw([prop('action', str(`create_${resource}`)), prop('body', id('body'))])])),
            expr(call(t.memberExpression(id('reply'), id('status')), [num(201)])),
            expr(call(t.memberExpression(id('reply'), id('send')), [objRaw([prop('data', id('body')), prop('message', str(`${resource} created`))])])),
          ],
          'error',
          [expr(call(t.memberExpression(id('reply'), id('status')), [num(500)])), expr(call(t.memberExpression(id('reply'), id('send')), [objRaw([prop('error', t.memberExpression(id('error'), id('message')))])]))]
        )
      ])
    ])),
    expr(call(id('done'), [])),
  ];

  const pluginFn = t.functionDeclaration(
    id(`${resource}Plugin`),
    [id('fastify'), id('_options'), id('done')],
    block(pluginBody),
    false,
    false,
    false,
    []
  );

  stmts.push(pluginFn);
  stmts.push(expr(t.assignmentExpression('=',
    t.memberExpression(id('module'), id('exports')),
    id(`${resource}Plugin`)
  )));

  const program  = t.program(stmts);
  const { code } = generate(program, { retainLines: false, compact: false });
  parse(code, { sourceType: 'script' });
  return code;
}

/**
 * Main entry point for code generation.
 * @param {object} pattern   - best-match pattern from dataset
 * @param {object} parsedIntent - output of intentParser.parseIntent()
 * @returns {string}  Generated JavaScript source code
 */
function generateCode(pattern, parsedIntent) {
  const resource  = parsedIntent.resource;
  const framework = pattern.framework || parsedIntent.framework || 'express';
  const opts      = {
    validation: pattern.validation || parsedIntent.validation || 'joi',
    auth:       pattern.auth       || parsedIntent.auth       || 'none',
    db:         pattern.db         || parsedIntent.db         || 'mongodb',
    features:   parsedIntent.features || [],
  };

  switch (framework) {
    case 'fastify': return generateFastifyCRUD(resource, opts);
    default:        return generateExpressCRUD(resource, opts);
  }
}

module.exports = { generateCode, generateExpressCRUD, generateFastifyCRUD };
