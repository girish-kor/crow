'use strict';

const pino = require('pino');
const config = require('../configs/default.json');

const logger = pino({
  level: process.env.LOG_LEVEL || config.logging.level,
  transport: (process.env.NODE_ENV !== 'production' && config.logging.pretty)
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});

module.exports = logger;
