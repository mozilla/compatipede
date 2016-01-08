"use strict";

let async = require('async'),
  logger = require('deelogger')('SerialExecutor'),
  stats = require('./stats').forNamespace('serialExecutor');

const screenSizes = { //most popular screen sizes
    desktopSize : {
      width : 1366,
      height : 768
    },
    mobileSize : {
      width : 640,
      height : 1136
    }
  };

class SerialExecutor {
  constructor(processId, jobModel, campaignModel, tabSequence) {
    this._processId = processId;
    this._jobModel = jobModel;
    this._campaignModel = campaignModel;
    this._tabSequence = tabSequence;

    let d = new Date();

    d.setUTCHours(0);
    d.setUTCMinutes(0);
    d.setUTCSeconds(0);
    d.setUTCMilliseconds(0);

    d.setUTCDate(d.getUTCDate() - d.getUTCDay());

    this._runTime = d.getTime();
  }

  loop(callback) {
    this._campaignModel.getCampaignForRunning(this._processId, this._runTime, (error, campaign) => {
      if(error) {
        return callback(error);
      }

      if(!campaign) {
        return callback();
      }

      stats.increment('campaign.fetched');

      let startTime = new Date();

      async.series([
        this._createJobs.bind(this, campaign),
        this._executeJobs.bind(this, campaign._id, campaign.runCount),
        this._campaignModel.markAsDone.bind(this._campaignModel, campaign._id)
      ], (error) => {
        if(error) {
          logger.error('Failed to execute run', {
            error : error.stack || error,
            campaignId : campaign._id
          });

          return callback(error);
        }

        stats.timing('campaign.executionTime', startTime);

        //recursion is stoped when no other campaigns could be found
        this.loop(callback);
      });
    });
  }

  _createJobs(campaign, callback) {
    let runNumber = campaign.runCount,
      details = campaign.details,
      jobModel = this._jobModel,
      startTime = new Date();

    //if multiple engines and multiple user agents then
    //all possible combinations are created
    async.mapSeries(details.engines || [], (engine, cb) => {
      async.mapSeries(details.userAgents || [], (userAgent, cb) => {
        jobModel.createNewRun(campaign._id, runNumber, {
          engine     : engine,
          targetURI  : details.targetURI,
          userAgent  : userAgent,
          screenSize : details.type === 'mobile' ? screenSizes.mobileSize : screenSizes.desktopSize
        }, cb);
      }, cb);
    }, (error) => {
      if(error) {
        logger.error('Failed to create new jobs', {
          engines    : details.engines,
          userAgents : details.userAgents,
          id         : campaign._id,
          error      : error.stack || error
        });

        return callback(error);
      }

      logger.info('Create new runs for job', {
        engines    : details.engines,
        userAgents : details.userAgents,
        id         : campaign._id
      });

      stats.timing('jobs.creationTime', startTime);

      callback();
    });
  }

  _executeJobs(campaignId, runCount, callback) {
    let startTime = new Date();
    this._jobModel.getForCampaignExecution(campaignId, runCount, (error, jobs) => {
      async.mapSeries(jobs, (job, cb) => {
        async.waterfall([
          this._tabSequence.execute.bind(this._tabSequence, job._id, job.jobDetails),
          (result, cb) => {
            if(result.success) {
              this._jobModel.updateWithResult(result.id, result.result, cb);
            } else {
              this._jobModel.markAsFailed(result.id, result.errors, cb);
            }
          }
        ], cb);
      }, (error) => {
        stats.timing('jobs.executionTime', startTime);
        callback(error);
      });
    });
  }
}

module.exports = SerialExecutor;
