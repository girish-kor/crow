#!/usr/bin/env node
'use strict';

const { Command } = require('commander');
const path        = require('path');
const fs          = require('fs');
const { run }     = require('../core/pipeline');
const config      = require('../configs/default.json');

const pkg     = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
const program = new Command();

program
  .name('crow')
  .description('Deterministic Node.js backend code synthesis engine')
  .version(pkg.version);

// ── crow generate ─────────────────────────────────────────────────────────────
program
  .command('generate <intent>')
  .alias('g')
  .description('Generate a Node.js backend module from a natural-language intent')
  .option('-o, --output <dir>',        'Output directory',                     config.generation.outputDir)
  .option('-f, --framework <name>',    'Force framework (express|fastify|koa)', '')
  .option('-v, --validation <name>',   'Force validation lib (joi|zod|yup)',    '')
  .option('-a, --auth <type>',         'Force auth type (jwt|apikey|none)',     '')
  .option('-d, --db <type>',           'Force db type (mongodb|postgres|...)',  '')
  .option('--dry-run',                 'Print code without writing file',       false)
  .option('--topn <n>',                'Number of pattern candidates',          '5')
  .action(async (intent, opts) => {
    try {
      const result = await run(intent, {
        outputDir: opts.output,
        dryRun:    opts.dryRun,
        topN:      parseInt(opts.topn, 10),
        overrides: {
          framework:  opts.framework  || undefined,
          validation: opts.validation || undefined,
          auth:       opts.auth       || undefined,
          db:         opts.db         || undefined,
        },
      });

      if (opts.dryRun) {
        console.log('\n── Generated Code ──────────────────────────────────────────\n');
        console.log(result.code);
        console.log('\n────────────────────────────────────────────────────────────');
      } else {
        console.log(`✓ Generated → ${result.outputPath}`);
      }

      console.log(`  Resource:   ${result.meta.parsed.resource}`);
      console.log(`  Framework:  ${result.meta.pattern.framework || result.meta.parsed.framework}`);
      console.log(`  Validation: ${result.meta.pattern.validation || result.meta.parsed.validation}`);
      console.log(`  Auth:       ${result.meta.pattern.auth || result.meta.parsed.auth}`);
      console.log(`  Match score: ${(result.meta.score * 100).toFixed(1)}%`);
      console.log(`  Elapsed:    ${result.meta.elapsed_ms}ms`);
    } catch (err) {
      console.error('✗ Generation failed:', err.message);
      if (process.env.DEBUG) console.error(err.stack);
      process.exit(1);
    }
  });

// ── crow list-patterns ────────────────────────────────────────────────────────
program
  .command('list-patterns [query]')
  .alias('lp')
  .description('List available patterns, optionally filtered by query')
  .option('-n, --count <n>', 'Number of patterns to show', '10')
  .action((query, opts) => {
    const dsPath = path.join(__dirname, '../patterns/dataset.json');
    if (!fs.existsSync(dsPath)) {
      console.error('✗ Dataset not found. Run: npm run seed');
      process.exit(1);
    }

    const dataset = JSON.parse(fs.readFileSync(dsPath, 'utf8'));
    const n       = parseInt(opts.count, 10);

    let entries = dataset;
    if (query) {
      const q = query.toLowerCase();
      entries = dataset.filter(e => e.intent.toLowerCase().includes(q) || e.resource.includes(q));
    }

    console.log(`\n Patterns in dataset (${dataset.length} total):\n`);
    entries.slice(0, n).forEach((e, i) => {
      console.log(`  ${String(i + 1).padStart(3)}. [${e.framework}/${e.validation}/${e.auth}] ${e.intent}`);
    });
    if (entries.length > n) {
      console.log(`  … and ${entries.length - n} more`);
    }
  });

// ── crow stats ────────────────────────────────────────────────────────────────
program
  .command('stats')
  .description('Show dataset statistics')
  .action(() => {
    const dsPath = path.join(__dirname, '../patterns/dataset.json');
    if (!fs.existsSync(dsPath)) {
      console.error('✗ Dataset not found. Run: npm run seed');
      process.exit(1);
    }

    const dataset  = JSON.parse(fs.readFileSync(dsPath, 'utf8'));
    const count    = (key) => [...new Set(dataset.map(e => e[key]))].length;
    const dist     = (key) => {
      const freq = {};
      dataset.forEach(e => { freq[e[key]] = (freq[e[key]] || 0) + 1; });
      return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k}:${v}`).join(', ');
    };

    console.log('\n── CROW Dataset Stats ──────────────────────────────────────');
    console.log(`  Total entries : ${dataset.length}`);
    console.log(`  Resources     : ${count('resource')} unique`);
    console.log(`  Frameworks    : ${dist('framework')}`);
    console.log(`  Validations   : ${dist('validation')}`);
    console.log(`  Auth types    : ${dist('auth')}`);
    console.log(`  DB types      : ${dist('db')}`);
    console.log(`  Actions       : ${dist('action')}`);
    console.log('────────────────────────────────────────────────────────────\n');
  });

// ── crow validate ─────────────────────────────────────────────────────────────
program
  .command('validate <file>')
  .description('Validate a generated file is syntactically correct')
  .action((file) => {
    const { parse } = require('@babel/parser');
    const absPath   = path.resolve(file);
    if (!fs.existsSync(absPath)) {
      console.error(`✗ File not found: ${absPath}`);
      process.exit(1);
    }
    try {
      const code = fs.readFileSync(absPath, 'utf8');
      parse(code, { sourceType: 'script' });
      console.log(`✓ ${absPath} is valid JavaScript`);
    } catch (err) {
      console.error(`✗ Parse error in ${absPath}: ${err.message}`);
      process.exit(1);
    }
  });

program.parse(process.argv);
