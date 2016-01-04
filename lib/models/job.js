"use strict";

let Model = require('./model'),
  util = require('util'),
  logger = require('deelogger')('Model-Job');

function Job(couchDBSettings, dbName) {
  Job.super_.call(this, couchDBSettings, dbName);

  this._lastSequence = null;
}

module.exports = Job;

util.inherits(Job, Model);

/* globals emit: true */
Job.prototype._ensureCouchDesignsExist = function(callback) {
  this._db.save('_design/jannahJobs', {
    views: {
      byStatus : {
        map : function(doc) {
          if(doc.status) {
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

Job.prototype.addFromGithub = function(githubIssue, callback) {
  let self = this,
    id = 'github-' + githubIssue.id,
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
  self._db.head(id, (err, res, status) => {
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
      logger.debug('addFromGithubIssue', 'Job for issue ' + githubIssue.number + ' already exists');
      return callback();
    }

    if(githubIssue.status === 'closed') {
      self._db.merge(id, {
        status : 'closed',
        closedAt : new Date()
      }, callback);
    } else {
      self._db.save(id, doc, callback);
    }
  });
};

Job.prototype.getOpenJobs = function(callback) {
  this._db.view('jannahJobs/byStatus', {key : 'open'}, (error, results) => {
    if(error) {
      return callback(error);
    }
    callback(null, results.map((v) => v));
  });
};

Job.prototype.setRunNumber = function (id, runNumber, cb) {
  this._db.merge(id, {
    runCount : runNumber
  }, cb);
};
