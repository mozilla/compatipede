"use strict";

let JannahClient = require('jannah-client'),
  logger = require('./logger')('TabSequence');

class TabSequence {
  constructor(masterUrl, waitTimeout) {
      this._jannahClient = new JannahClient(masterUrl);
      this._waitTimeout = waitTimeout || 30 * 1000;
  }

  execute(id, jobDetails, callback) {
    this._requestTab({
      id           : id,
      jobDetails   : jobDetails,
      failureCount : 0,
      errors       : [],
      callback     : callback
    });
  }

  _requestTab(jobObject) {
    let id = jobObject.id,
      jobDetails = jobObject.jobDetails;

    logger.debug('_requestTab', 'Requsting new tab', {
      jobDetails : jobDetails,
      id         : id
    });

    this._jannahClient.getNewSession({
      engine : jobDetails.engine,
      adblock : true
    }, (error, tab) => {
      if(error && error.statusCode !== 503 && error.statusCode !== 500) {
        logger.error('_requestTab', 'Failed to obtain new tab', {
          error      : error.message,
          jobDetails : jobDetails,
          id         : id
        });

        return jobObject.callback(error);
      }

      //503 means that tab could not be allocated
      //500 some internal server error, should not keep hammering server
      if(error && (error.statusCode === 503 || error.statusCode === 500)) {
        logger.warn('_requestTab', 'Tab could not be allocated', {
          id         : id,
          jobDetails : jobDetails
        });

        return this._executeWithDelay(jobObject);
      }

      this._doTabSequence(jobObject, tab);
    });
  }

  _executeWithDelay(jobObject) {
    setTimeout(() => {
      this._requestTab(jobObject);
    }, this._waitTimeout);
  }

  _doTabSequence(job, tab) {
    //@XXX jobQueue has almost same functionality difference is that it emits results
    //and doesn't use callback for that
     let result = {},
      id = job.id,
      jobDetails = job.jobDetails;

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
    .then((status) => {
      logger.info('_doTabSequence', 'Page opened with result', {
        status : status
      });

      return tab.getScreenshot();
    })
    .then((screenshot) => {
      result.screenshot = screenshot.data;

      return tab.getResources();
    })
    .then((resources) => {
      result.resources = resources.resources;
      return tab.getConsoleLog();
    })
    .then((consoleLog) => {
      result.consoleLog = consoleLog;
      return tab.getErrorLog();
    })
    .then((errorLog) => {
      result.errorLog = errorLog;
      return tab.getPluginResults();
    })
    .then((pluginResults) => {
      result.pluginResults = pluginResults;
      return tab.destroy();
    })
    .then(() => {
      logger.debug('_doTabSequence', 'Tab sequence executed', {
        id         : id,
        jobDetails : jobDetails
      });

      job.callback(null, {
        success : true,
        id      : id,
        result  : result
      });
    })
    .catch((error) => {

      job.failureCount += 1;
      job.errors.push({
        message : error.message
      });

      logger.error('_doTabSequence', 'Failed to execute tab sequence', {
        error        : error.message,
        jobDetails   : jobDetails,
        id           : id,
        failureCount : job.failureCount
      });

      tab.destroy().catch((error) => {
        logger.error('_doTabSequence', 'Failed destroy tab after failure', {
          error : error.message
        });
      });

      if(job.failureCount >= 2) {
        job.callback(null, {
          success : false,
          id      : id,
          errors  : job.errors
        });
      } else {
        this._executeWithDelay(job);
      }
    });
  }
}

module.exports = TabSequence;