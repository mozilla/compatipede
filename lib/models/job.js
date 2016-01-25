"use strict";

let Model = require('./model'),
  logger = require('deelogger')('Model-Job'),
  async = require('async');

class Job extends Model{
  constructor(couchDBSettings, dbName) {
    super(couchDBSettings, dbName);
    this._lastSequence = null;
  }

  /* globals emit: true */
  _ensureCouchDesignsExist(callback) {
    this._db.save('_design/jannahJobs', {
      views: {
        newJobs: { //for fetching jobs with status new
          map : function(doc) {
            if(doc.status === 'new') {
              emit(doc.status, doc);
            }
          }
        },
        completedJobs : {
          map : function(doc) {
            if(doc.status === 'completed') {
              emit(doc.status, doc);
            }
          }
        },
        failedJobs : {
          map : function(doc) {
            if(doc.status === 'failed') {
              emit(doc.status, doc);
            }
          }
        },
        byCampaign : {
          map : function(doc) {
            if(doc.jobId) {
              emit([doc.jobId, doc.runNumber], doc);
            }
          }
        },
        byCampaignDocId : {
          map : function(doc) {
            if(doc.jobId) {
              emit([doc.jobId, doc.runNumber], doc._id);
            }
          }
        }
      },
      filters : {
        newJobs : function(doc) { //for _change listener
          return doc.status === 'new';
        }
      }
    }, callback);
  }

  updateWithResult(id, result, callback) {
    let updateObj = {
        status : 'completed',
        jobResults : {},
        _attachments : {}
      };

    updateObj.jobResults = {
      date          : new Date(),
      resources     : result.resources,
      consoleLog    : result.consoleLog,
      errorLog      : result.errorLog,
      redirects     : result.redirects,
      pluginResults : result.pluginResults
    };

    updateObj._attachments.screenshot = {
      content_type : 'image/png',
      data : result.screenshot
    };

    this._db.merge(id, updateObj, callback);
  }

  markAsInvalid(id, callback) {
    this._db.merge(id, {
      status : 'invalid'
    }, callback);
  }

  markAsFailed(id, errors, callback) {
    this._db.merge(id, {
      status : 'failed',
      failure : {
        date : new Date(),
        errors : errors
      }
    }, callback);
  }

  createNewRun(jobId, runNumber, jobDetails, callback) {
    let doc = {
      status     : 'new',
      created    : new Date(),
      jobDetails : jobDetails,
      jobId      : jobId,
      runNumber  : runNumber
    };

    this._db.save(doc, callback);
  }

  startListening() {
    let feed,
      options = {
        filter : 'jannahJobs/newJobs',
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
      logger.warn('Feed stoped');

      this.startListening();
    });

    feed.on('error', (error) => {
      logger.error('Feed failed with an error', {
        error : error.message
      });
    });

    feed.on('change', (change) => {
      this._lastSequence = change.seq;

      this._db.get(change.id, (error, doc) => {
        if(error) {
          return this.emit('error', error);
        }

        this.emit('newJob', doc);
      });
    });
  }

  getForCampaignExecution(campaignId, runNumber, callback) {
    this._db.view('jannahJobs/byCampaign', {key : [campaignId, runNumber]}, (error, results) => {
      if(error) {
        return callback(error);
      }

      callback(null, results.map((r) => r));
    });
  }

  getCampaignRunResults(campaignId, runNumber, callback) {
    this._db.view('jannahJobs/byCampaignDocId', {key : [campaignId, runNumber], include_docs: false}, (error, results) => {
      async.map(results.map(r => r), (id, cb) => {
        this._db.get(id, cb);
      }, callback);
    });
  }
}

module.exports = Job;
