"use strict";

let winston = require('winston'),
  logger = new (winston.Logger)(),
  levels = ['silly', 'debug', 'verbose', 'info', 'warn', 'error'];

if(process.env.NODE_ENV !== 'test') {
  logger.add(winston.transports.Console, {
    colorize : true,
    timestamp : true,
    prettyPrint : true,
    level : 'debug'
  });
}

function Logger(prefix) {
  this._prefix = prefix;
}

levels.forEach(function(l) {
  Logger.prototype[l] = function(where, what, additional) {
    logger[l](this._prefix + ' @ ' + where + ' : ' + what, additional || '');
  };
});

module.exports = function(prefix) {
  return new Logger(prefix);
};
