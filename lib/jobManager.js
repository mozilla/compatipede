"use strict";

let cradle = require('cradle'),
  EventEmitter = require('events').EventEmitter,
  util = require('util'),
  async = require('async'),
  uuid = require('node-uuid'),
  logger = require('./logger')('JobManager'),
  screenSizes = { //most popular screen sizes
    desktopSize : {
      width : 1366,
      height : 768
    },
    mobileSize : {
      width : 640,
      height : 1136
    }
  };

/**
 * couchDBSettings : {
 *   host
 *   port
 *   auth : {
 *     username
 *     password
 *   }
 *   db
 *   heartbeatInterval //used in tests defaults to 30 * 1000
 * }
 * @param {[type]}   couchDBSettings [description]
 * @param {Function} callback        [description]
 */
function JobManager(couchDBSettings) {
  let self = this;

  JobManager.super_.call(this);

  this._client = new cradle.Connection(couchDBSettings);
  this._db = this._client.database(couchDBSettings.db);
  this._init((error) => {
    if(error) {
      logger.error('JobManager', 'Failed to set up couchdb', {
        error : error.message
      });

      return self.emit('error', error);
    }

    self.emit('ready');
  });

  this._dbName = couchDBSettings.db;
  this._hearbeatInteral = couchDBSettings.heartbeatInterval || 30 * 1000;
  this._lastSequence = null;
}

util.inherits(JobManager, EventEmitter);

/**
 * Inits couchdb db and all the designs for views and
 * filters
 *
 * @param  {Function} callback
 */
JobManager.prototype._init = (callback) => {
  async.series([
    this._ensureDBExists.bind(this),
    this._ensureCouchDesignsExist.bind(this)
  ], callback);
};

JobManager.prototype._ensureDBExists = (callback) => {
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

JobManager.prototype._ensureCouchDesignsExist = (callback) => {
  this._db.save('_design/jannahJobs', {
    views: {
      newJobs: { //for fetching jobs with status new
        map: function (doc) {
          if(doc.status === 'new') {
            emit(doc.status, doc);
          }
        }
      }
    },
    filters : {
      newJob : function(doc) { //for _change listener
        return doc.status === 'new';
      }
    }
  }, callback);
};

JobManager.prototype.updateWithResult = (id, result, callback) => {
  let resultId = uuid.v4(), //each result has an id, that way job can be re run
    updateObj = {
      status : 'completed',
      jobResults : {},
      _attachments : {}
    };

  updateObj.jobResults[resultId] = {
    date      : new Date(),
    resources : result.resources
  };

  updateObj._attachments[resultId] = {
    content_type : 'image/png',
    data : result.screenshot
  };

  this._db.merge(id, updateObj, callback);
};

JobManager.prototype.markAsInvalid = (id, callback) => {
  this._db.merge(id, {
    status : 'invalid'
  }, callback);
};

JobManager.prototype.addFromGithubIssue = (githubIssue, callback) => {
  let self = this;

  async.map(['webkit', 'gecko'], (engine, cb) => {
    let id = 'github-' + githubIssue.id + '-' + engine,
      doc = {
        status : 'new',
        created : new Date(),
        jobDetails : {
          engine : engine,
          targetURI : githubIssue.url,
          screenSize : githubIssue.forMobile ?
            screenSizes.mobileSize : screenSizes.desktopSize,
          userAgent : githubIssue.userAgent,
        },
        github : {
          issueUrl : githubIssue.issueUrl,
          id       : githubIssue.id,
          number   : githubIssue.number
        }
      };

    //by default connection is using cradle forcenew option,
    //it allows to skip fetching and using rev number it will fetch
    //it whenever put fails, but it also means that there is no way
    //how to check if document already exists, it won't return an error
    //so manual check is required
    self._db.head(id, (err, res, status) => {
      if(err) {
        return cb(err);
      }

      if(status !== 404) {
        logger.debug('addFromGithubIssue', 'Job for issue ' + githubIssue.number + ' already exists');
        return cb();
      }

      self._db.save(id, doc, (error) => {
        cb(error);
      });
    });
  }, callback);
};

JobManager.prototype.startListening = () => {
  let feed,
    self = this,
    options = {
      filter : 'jannahJobs/newJob',
      //test are failing otherwise because mock-couch is using that value
      //to control interval in which changes are sent to client
      heartbeat : this._hearbeatInteral
    };

  //since value is passed as query parameter to couchdb
  //it can be set only if it has value otherwise it will
  //send garbage like string 'null' for since field
  if(this._lastSequence !== null) {
    options.since = this._lastSequence;
  }

  feed = this._db.changes(options);

  feed.on('stop', () => {
    logger.warn('startListening', 'Feed stoped');

    self.startListening();
  });

  feed.on('error', (error) => {
    logger.error('startListening', 'Feed failed with an error', {
      error : error.message
    });
  });

  feed.on('change', (change) => {
    self._lastSequence = change.seq;

    self._db.get(change.id, (error, doc) => {
      if(error) {
        return self.emit('error', error);
      }

      self.emit('newJob', doc);
    });
  });
};

module.exports = JobManager;
