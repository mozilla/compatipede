"use strict";

let Model = require('./model'),
  logger = require('deelogger')('Model-Job'),
  async = require('async'),
  tldextract = require('tldextract'),
  topsites = require('moz-data-site-toplists');


class Job extends Model{
  constructor(couchDBSettings, dbName, saveResources) {
    super(couchDBSettings, dbName);
    this._lastSequence = null;
    this._saveResources = saveResources;
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
        },
        byDomain : {
         map : function(doc) {
           emit(doc.jobDetails.domain, doc);
         }
        },
        listDomains : {
          map : function (doc) {
            emit(doc.jobDetails.domain, null);
          },
          reduce : function (key, values) {
            return null;
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

  updateWithResult(id, details, result, callback) {
    let updateObj = {
        status : 'completed',
        jobResults : {},
        _attachments : {}
      };

    updateObj.jobResults = {
      date       : new Date(),
      resources  : this._saveResources ? result.resources : {},
      consoleLog : result.consoleLog,
      errorLog   : result.errorLog,
      redirects  : result.redirects,
      plugins    : result.pluginResults
    };

    updateObj._attachments.screenshot = {
      content_type : 'image/png',
      data : result.screenshot
    };

    updateObj.jobDetails = details;
    tldextract(details.targetURI, function handleDomainData(error, result){
      let domain = (result ? result.domain + '.' + result.tld : '');
      updateObj.jobDetails.domain = domain;
      updateObj.jobDetails.tags = topsites.countryLists(updateObj.jobDetails.domain);

      this._db.merge(id, updateObj, callback);
    }.bind(this));
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

    tldextract(jobDetails.targetURI, function handleDomainData(error, result){
      doc.jobDetails.domain = result.domain + '.' + result.tld;
      doc.jobDetails.tags = topsites.countryLists(doc.jobDetails.domain);
      this._db.save(doc, callback);
    }.bind(this));
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
