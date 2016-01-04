"use strict";

let cradle = require('cradle'),
  EventEmitter = require('events').EventEmitter,
  util = require('util'),
  async = require('async'),
  logger = require('deelogger')('Model');
/**
 * couchDBSettings : {
 *   host
 *   port
 *   auth : {
 *     username
 *     password
 *   }
 *   heartbeatInterval //used in tests defaults to 30 * 1000
 * }
 * @param {Object}   couchDBSettings
 * @param {string}   dbName
 * @param {Function} callback
 */
function Model(couchDBSettings, dbName) {
  let self = this;

  Model.super_.call(this);

  this._client = new cradle.Connection(couchDBSettings);
  this._db = this._client.database(dbName);
  this._init((error) => {
    if(error) {
      logger.error('Model', 'Failed to set up couchdb', {
        error : error.message
      });

      return self.emit('error', error);
    }

    self.emit('ready');
  });

  this._dbName = dbName;
  this._hearbeatInteral = couchDBSettings.heartbeatInterval || 30 * 1000;
}

module.exports = Model;

util.inherits(Model, EventEmitter);

Model.prototype._init = (callback) => {
  async.series([
    this._ensureDBExists.bind(this),
    this._ensureCouchDesignsExist.bind(this)
  ], callback);
};

Model.prototype._ensureDBExists = (callback) => {
  let self = this;

  this._db.exists((error, exists) => {
    if(error) {
      return callback(error);
    }

    if(exists) {
      logger.debug('_ensureDBExists', 'Database already exists');
      return callback();
    }

    self._db.create(callback);
  });
};

Model.prototype._ensureCouchDesignsExist = (callback) => {
  callback();
};
