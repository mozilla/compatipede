"use strict";

let JannahClient = require('jannah-client'),
  EventEmitter = require('events').EventEmitter,
  util = require('util'),
  async = require('async'),
  logger = require('./logger')('JobQueue');

/**
 * New Tabs can be requested until master returns 503 signaling
 * that tab could not be allocated, then it has to stop and
 * wait for previosu jobs to finish
 *
 * @XXX maybe it would require more more precise backfeed to job
 * manager to stop feeding new jobs to the queue
 *
 * @param {[type]} masterUrl [description]
 */
function JobQueue(masterUrl, waitTimeout) {
  JobQueue.super_.call(this);

  this._queue = [];
  this._requestingTab = false;
  this._blocked = false;
  this._jannahClient = new JannahClient(masterUrl);

  this._waitTimeout = waitTimeout || 30 * 1000;
}

util.inherits(JobQueue, EventEmitter);

JobQueue.prototype.add = (id, jobDetails) => {
  //@XXX maybe it doesn't need to block on when requesting
  //new tab, if there is enough of capacity then tabs could
  //be requested in parallel, available tab count should be
  //monitored somewhere and based on that data it would be
  //possible to decide if tabs can be requested in parallel
  //maybe blocked flag is enough? if one fails they all will
  //start to queue and also could be beneficial to listen for
  //jobResult event to clean _blocked flag, if it queue fills
  //with jobs there might a situation where it goes in cycle
  //request - wait - request - wait ...
  if(this._requestingTab || this._blocked) {
    return this._queue.push({
      id         : id,
      jobDetails : jobDetails
    });
  }

  this._requestTab(id, jobDetails);
};

JobQueue.prototype._requestTab = (id, jobDetails) => {
  let result = {},
    self = this;

  logger.debug('_requestTab', 'Requsting new tab', {
    jobDetails : jobDetails,
    id         : id
  });

  this._requestingTab = true;

  this._jannahClient.getNewSession({
    engine : jobDetails.engine,
    adblock : false //hard coded until plugins are implemented
  }, function(error, tab) {

    self._requestingTab = false;

    if(error && error.statusCode !== 503) {
      logger.error('_requestTab', 'Failed to obtain new tab', {
        error      : error.message,
        jobDetails : jobDetails,
        id         : id
      });

      self._queue.push({
        id         : id,
        jobDetails : jobDetails
      });

      return self._processNext();
    }

    if(error && error.statusCode === 503) {
      self._queue.push({
        id         : id,
        jobDetails : jobDetails
      });

      logger.error('_requestTab', 'Tab could not be allocated', {
        id         : id,
        jobDetails : jobDetails
      });

      self._blocked = true;
      return self._processNextWithDelay();
    }

    //@XXX maybe there is a better flow control
    //setting _requestingTab and __blocked flags
    //don't allow for nice waterfall flow control
    self._blocked = false;
    self._doTabSequence(id, jobDetails, tab);
    self._processNext();
  });
};

JobQueue.prototype._processNext = () => {
  if(this._queue.length === 0) {
    return;
  }

  let job = this._queue.shift();

  this._requestTab(job.id, job.jobDetails);
};

//this one is called when there is 503 from master meaning that tab could
//not be allocated in that case it must wait for a little while before retrying
//as there is point retrying right away because other tab open get screenshot
//etc. sequence is executing and it takes atleast +- 10s for it to complete
JobQueue.prototype._processNextWithDelay = () => {
  setTimeout(this._processNext.bind(this), this._waitTimeout);
};

JobQueue.prototype._doTabSequence = (id, jobDetails, tab) => {
  let result = {},
    self = this;

  tab.setUserAgent({
    userAgent : jobDetails.userAgent
  })
  .then(() => {
    return tab.setScreenSize({
      size : jobDetails.screenSize
    });
  })
  .then(() => {
    return tab.open({
      url : jobDetails.targetURI,
      waitForResources : true
    });
  })
  .then(() => {
    return tab.getScreenshot();
  })
  .then((screenshot) => {
    result.screenshot = screenshot.data;

    return tab.getResources();
  })
  .then((resources) => {
    result.resources = resources.resources;

    return tab.destroy();
  })
  .then(() => {
    self.emit('jobResult', {
      id     : id,
      result : result
    });

    logger.debug('_doTabSequence', 'Tab sequence executed', {
      id         : id,
      jobDetails : jobDetails
    });
  })
  .catch((error) => {
    logger.error('_doTabSequence', 'Failed to execute tab sequence', {
      error      : error.message,
      jobDetails : jobDetails,
      id         : id
    });

    self.add(id, jobDetails);
  });
};

module.exports = JobQueue;
