"use strict";

let JannahClient = require('jannah-client'),
  logger = require('deelogger')('TabSequence'),
  stats = require('./stats').forNamespace('tabSequence');

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
      jobDetails = jobObject.jobDetails,
      startTime = new Date();

    logger.debug('Requsting new tab', {
      jobDetails : jobDetails,
      id         : id
    });

    this._jannahClient.getNewSession({
      engine : jobDetails.engine,
      adblock : true
    }, (error, tab) => {
      if(error && error.statusCode !== 503 && error.statusCode !== 500) {
        logger.error('Failed to obtain new tab', {
          error      : error.message,
          jobDetails : jobDetails,
          id         : id
        });
        stats.increment('tabRequest.newSessionRequestFail.hardFail');

        return jobObject.callback(error);
      }

      //503 means that tab could not be allocated
      //500 some internal server error, should not keep hammering server
      if(error && (error.statusCode === 503 || error.statusCode === 500)) {
        logger.warn('Tab could not be allocated', {
          id         : id,
          jobDetails : jobDetails
        });
        stats.increment('tabRequest.newSessionRequestFail.canRetry');
        return this._executeWithDelay(jobObject);
      }

      stats.timing('tabRequest.newSession', startTime);
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
      jobDetails = job.jobDetails,
      startTime = new Date(),
      time = new Date();

    tab.setUserAgent({
      userAgent : jobDetails.userAgent
    })
    .then(() => {
      stats.timing('boarTiming.setUserAgent', time);
      time = new Date();
      return tab.setScreenSize({
        size : jobDetails.screenSize
      });
    })
    .then(() => {
      stats.timing('boarTiming.setScreenSize', time);
      time = new Date();

      return tab.open({
        url : jobDetails.targetURI,
        waitForResources : true
      });
    })
    .then((status) => {
      logger.info('Page opened with result', {
        status : status
      });

      stats.timing('boarTiming.open', time);
      time = new Date();

      if(status.success !== true) {
        stats.increment('pageOpenRequest.fail');
      } else {
        stats.increment('pageOpenRequest.success');
      }

      return tab.getScreenshot();
    })
    .then((screenshot) => {
      stats.timing('boarTiming.getScreenshot', time);
      time = new Date();

      result.screenshot = screenshot.data;

      return tab.getResources();
    })
    .then((resources) => {
      stats.timing('boarTiming.getResources', time);
      time = new Date();

      result.resources = resources.resources;
      return tab.getConsoleLog();
    })
    .then((consoleLog) => {
      stats.timing('boarTiming.getConsoleLog', time);
      time = new Date();

      result.consoleLog = consoleLog;
      return tab.getErrorLog();
    })
    .then((errorLog) => {
      stats.timing('boarTiming.getErrorLog', time);
      time = new Date();

      result.errorLog = errorLog;
      return tab.getPluginResults();
    })
    .then((pluginResults) => {
      stats.timing('boarTiming.getPluginResults', time);
      time = new Date();

      result.pluginResults = pluginResults.results;
      return tab.getRedirects();
    })
    .then((redirects) => {
      stats.timing('boarTiming.getRedirects', time);
      time = new Date();

      result.redirects = redirects.redirects;
      return tab.destroy();
    })
    .then(() => {
      logger.debug('Tab sequence executed', {
        id         : id,
        jobDetails : jobDetails
      });

      stats.increment('tabSequence.success');
      stats.timing('tabSequence.executionTime', startTime);

      stats.timing('boarTiming.destroy', time);
      time = new Date();

      job.callback(null, {
        success    : true,
        id         : id,
        result     : result,
        jobDetails : jobDetails
      });
    })
    .catch((error) => {

      job.failureCount += 1;
      job.errors.push({
        message : error.message
      });

      logger.error('Failed to execute tab sequence', {
        error        : error.message,
        jobDetails   : jobDetails,
        id           : id,
        failureCount : job.failureCount
      });

      tab.destroy().catch((error) => {
        logger.error('Failed destroy tab after failure', {
          error : error.message
        });
      });

      stats.increment('tabSequence.fail');

      if(job.failureCount >= 2) {
        stats.increment('tabSequence.hardFail');
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
