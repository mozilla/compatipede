"use strict";

let Model = require('./model'),
  logger = require('deelogger')('Model-Campaign');

class Campaign extends Model {
  constructor(couchDBSettings, dbName) {
    super(couchDBSettings, dbName);

    this._lastSequence = null;
  }

  /* globals emit: true */
  _ensureCouchDesignsExist(callback) {
    this._db.save('_design/campaigns', {
      views: {
        byStatus : {
          map : function(doc) {
            if(doc.status) {
              emit(doc.status, doc);
            }
          }
        },
        openCampaignsByLastRun : {
          map : function(doc) {
            if(doc.status === 'open' && doc.runStatus !== 'running') {
              emit(doc.lastRun || 0, doc);
            }
          }
        }
      }
    }, callback);
  }

  addFromGithub(githubIssue, callback) {
    let id = 'github-' + githubIssue.id,
      doc = {
        status       : 'open',
        created      : new Date(),
        autoTests    : [],
        autoTestable : true,
        from         : 'github',
        runCount     : 0,
        details : {
          targetURI  : githubIssue.url,
          type       : githubIssue.forMobile ? 'mobile' : 'desktop',
          userAgents : [githubIssue.userAgent], //user agent that was extracted from github issue
          engines    : [githubIssue.engine]
        },
        github : {
          issueUrl : githubIssue.issueUrl,
          id       : githubIssue.id,
          number   : githubIssue.number
        },
      };

    //by default connection is using cradle forcenew option,
    //it allows to skip fetching and using rev number it will fetch
    //it whenever put fails, but it also means that there is no way
    //how to check if document already exists, it won't return an error
    //so manual check is required
    this._db.head(id, (err, res, status) => {
      if(err) {
        return callback(err);
      }

      //there is no point in adding job documents for already closed
      //issues
      if(status === 404 && githubIssue.status === 'closed') {
        return callback();
      }

      //update on already existing document should be done only
      //if corresponding github issue gets closed
      if(status !== 404 && githubIssue.status !== 'closed') {
        logger.debug('Job for issue ' + githubIssue.number + ' already exists');
        return callback();
      }

      if(githubIssue.status === 'closed') {
        this._db.merge(id, {
          status : 'closed',
          closedAt : new Date()
        }, callback);
      } else {
        this._db.save(id, doc, callback);
      }
    });
  }

  getOpenJobs(callback) {
    this._db.view('campaigns/byStatus', {key : 'open'}, (error, results) => {
      if(error) {
        return callback(error);
      }
      callback(null, results.map((v) => v));
    });
  }

  setRunNumber(id, runNumber, cb) {
    this._db.merge(id, {
      runCount : runNumber
    }, cb);
  }

  getCampaignForRunning(processId, now, callback) {
    let db = this._db;
    db.view('campaigns/openCampaignsByLastRun', {endkey : now, limit : 1, inclusive_end: false}, (error, results) => {
      if(!results || results.length !== 1) {
        return callback();
      }

      let campaign = results[0].value;
      campaign.processId = processId;
      campaign.lastRun = now;
      campaign.runStatus = 'running';
      campaign.runCount += 1;

      db.save(campaign._id, campaign._rev, campaign, (error) => {
        //@TODO check error code to see if something else hasn't updated document
        if(error) {
          return callback(error);
        }

        callback(null, campaign);
      });
    });
  }

  markAsDone(campaignId, callback) {
    this._db.merge(campaignId, {
      runStatus : 'completed'
    }, callback);
  }

  saveComparisionBetweenVersions(campaignId, versions, results, callback) {
    this._db.merge(campaignId, {
      autoTestResultsBetweenVersions : {
        date     : new Date(),
        versions : versions,
        results  : results
      }
    }, callback);
  }
}

module.exports = Campaign;
