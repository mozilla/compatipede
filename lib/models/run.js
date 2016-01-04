"use strict";

let Model = require('./model'),
  util = require('util'),
  uuid = require('node-uuid'),
  logger = require('deelogger')('Model-Run');

function Run(couchDBSettings, dbName) {
  Run.super_.call(this, couchDBSettings, dbName);

  this._lastSequence = null;
}

module.exports = Run;

util.inherits(Run, Model);

/* globals emit: true */
Run.prototype._ensureCouchDesignsExist = (callback) => {
  this._db.save('_design/jannahRuns', {
    views: {
      newRuns: { //for fetching jobs with status new
        map : function(doc) {
          if(doc.status === 'new') {
            emit(doc.status, doc);
          }
        }
      },
      completedRuns : {
        map : function(doc) {
          if(doc.status === 'completed') {
            emit(doc.status, doc);
          }
        }
      },
      failedRuns : {
        map : function(doc) {
          if(doc.status === 'failed') {
            emit(doc.status, doc);
          }
        }
      },
      byJobId : {
        map : function(doc) {
          if(doc.jobId) {
            emit(doc.jobId, doc);
          }
        }
      }
    },
    filters : {
      newRun : function(doc) { //for _change listener
        return doc.status === 'new';
      }
    }
  }, callback);
};

Run.prototype.updateWithResult = (id, result, callback) => {
  let updateObj = {
      status : 'completed',
      jobResults : {},
      _attachments : {}
    };

  updateObj.jobResults = {
    date       : new Date(),
    resources  : result.resources,
    consoleLog : result.consoleLog,
    errorLog   : result.errorLog
  };

  updateObj._attachments.screenshot = {
    content_type : 'image/png',
    data : result.screenshot
  };

  this._db.merge(id, updateObj, callback);
};

Run.prototype.markAsInvalid = (id, callback) => {
  this._db.merge(id, {
    status : 'invalid'
  }, callback);
};

Run.prototype.markAsFailed = (id, errors, callback) => {
  let errorContent = {};
  errorContent[uuid.v4()] = {
    date : new Date(),
    errors : errors
  };

  this._db.merge(id, {
    status : 'failed',
    failures : errorContent
  }, callback);
};

Run.prototype.createNewRun = function(jobId, runNumber, jobDetails, callback) {
  let doc = {
    status     : 'new',
    created    : new Date(),
    jobDetails : jobDetails,
    jobId      : jobId,
    runNumber  : runNumber
  };

  this._db.save(doc, callback);
};

Run.prototype.startListening = () => {
  let feed,
    self = this,
    options = {
      filter : 'jannahRuns/newRun',
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

module.exports = Run;
