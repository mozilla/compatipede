"use strict";

let cradle = require('cradle'),
  EventEmitter = require('events').EventEmitter,
  util = require('util'),
  async = require('async'),
  logger = require('deelogger')('Model');

class Model extends EventEmitter {
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
  constructor(couchDBSettings, dbName) {
    super();

    this._client = new cradle.Connection(couchDBSettings);
    this._db = this._client.database(dbName);
    this._init((error) => {
      if(error) {
        logger.error('Model', 'Failed to set up couchdb', {
          error : error.message
        });

        return this.emit('error', error);
      }

      this.emit('ready');
    });

    this._dbName = dbName;
    this._hearbeatInteral = couchDBSettings.heartbeatInterval || 30 * 1000;
  }

  _init(callback) {
    async.series([
      this._ensureDBExists.bind(this),
      this._ensureCouchDesignsExist.bind(this)
    ], callback);
  }

  _ensureDBExists(callback) {
    this._db.exists((error, exists) => {
      if(error) {
        return callback(error);
      }

      if(exists) {
        logger.debug('_ensureDBExists', 'Database already exists');
        return callback();
      }

      this._db.create(callback);
    });
  }

  _ensureCouchDesignsExist(callback) {
    callback();
  }
};

module.exports = Model;
