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

    this._runTime = 0;
    this._accumulator = {};
  }

  set runTime(intervalString) {
    let d = new Date();

    d.setUTCMinutes(0);
    d.setUTCSeconds(0);
    d.setUTCMilliseconds(0);

    switch(intervalString) {
      case '1h': break;
      case '6h': d.setUTCHours(Math.floor(d.getUTCHours() / 4)); break;
      case '1d': d.setUTCHours(0); break;
      case '1w': d.setUTCHours(0); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); break;
    }

    this._runTime = d.getTime();
  }

  get campaignResults() {
    return this._accumulator;
  }

  loop(callback) {
    this._campaignModel.getCampaignForRunning(this._processId, this._runTime, (error, campaign) => {
      if(error) {
        logger.error('Failed to fecth campaing', error);
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
        this._campaignModel.markAsDone.bind(this._campaignModel, campaign._id),
        this._comparePreviousRunResults.bind(this, campaign)
      ], (error) => {
        if(error) {
          logger.error('Failed to execute run', {
            error : error.stack || error,
            campaignId : campaign._id
          });

          return callback();
        }

        stats.timing('campaign.executionTime', startTime);
        this._accumulator[campaign._id].step = 'done';

        //recursion is stoped when no other campaigns could be found
        process.nextTick(this.loop.bind(this, callback));
      });
    });
  }

  _createJobs(campaign, callback) {
    let runNumber = campaign.runCount,
      details = campaign.details,
      jobModel = this._jobModel,
      startTime = new Date();

    this._accumulator[campaign._id] = {
      engines : details.engines,
      userAgents : details.userAgents,
      uri : details.targetURI,
      step : 'jobCreation'
    };

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

        this._accumulator[campaign._id].error = error.message;

        return callback(error);
      }

      this._accumulator[campaign._id].step = 'done';

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
    this._accumulator[campaignId].step = 'jobExecution';

    this._jobModel.getForCampaignExecution(campaignId, runCount, (error, jobs) => {
      async.mapSeries(jobs, (job, cb) => {
        async.waterfall([
          this._tabSequence.execute.bind(this._tabSequence, job._id, job.jobDetails),
          (result, cb) => {
            if(result.success) {
              this._jobModel.updateWithResult(result.id, result.jobDetails, result.result, cb);
            } else {
              this._accumulator[campaignId].error = result.errors.map(e => e.message).join('; ');
              this._jobModel.markAsFailed(result.id, result.errors, cb);
            }
          }
        ], cb);
      }, (error) => {
        if(error) {
          logger.error('Failed to execute jobs', error);
          this._accumulator[campaignId].error = error.message;
        }
        stats.timing('jobs.executionTime', startTime);
        callback(error);
      });
    });
  }

  _comparePreviousRunResults(campaign, callback) {
    let analyzers = require('./analyzers');
    let jobModel = this._jobModel;

    this._accumulator[campaign._id].step = 'previousRunAnalyzer';

    //there is no point in comparing results between runs if only one result exists
    if(campaign.runCount <= 1) {
      logger.info('Campaign doesnt have enough runs to compare between', {
        campaignId : campaign._id,
        runCount   : campaign.runCount
      });

      return callback();
    }

    if(!campaign.autoTestable || (campaign.autoTests || []).length === 0) {
      logger.info('Campaign isnt auto testable', {
        autoTestable : campaign.autoTestable,
        autoTests    : campaign.autoTests
      });
      return callback();
    }

    let currentRunNumber = campaign.runCount,
      previousRunNumber = campaign.runCount - 1;

    async.parallel({
      lastResultJobs : jobModel.getCampaignRunResults.bind(jobModel, campaign._id, currentRunNumber),
      previousJobs : jobModel.getCampaignRunResults.bind(jobModel, campaign._id, previousRunNumber),
    }, (error, result) => {

      if(error) {
        logger.error('Failed to read jobs and their results', error);
        return callback(error);
      }

      let allJobs = (result.lastResultJobs || []).concat(result.previousJobs || []);

      //comparing results this way requires that there is something to compare against
      if(allJobs.some(r => r.status !== 'completed')) {
        logger.warn('Some results have failed', {
          campaignId        : campaign._id,
          currentRunNumber  : currentRunNumber,
          previousRunNumber : previousRunNumber
        });

        return callback();
      }

      let allResults = allJobs.map((r) => {
        let p = JSON.parse(JSON.stringify(r.jobResults));
        p.runNumber = r.runNumber;
        return p;
      });

      //auto tests can be executed in parallel, it expects that
      //auto tests have same names as in the code
      let parallel = campaign.autoTests.reduce((result, entry) => {
        if(!analyzers[entry]) {
          logger.error('Failed to find analyzer', {
            campaignId : campaign._id,
            available  : Object.keys(analyzers),
            analyser   : entry
          });

          return result;
        }

        result[entry] = (cb) => {
          let startTime = new Date();

          analyzers[entry].analyse(campaign, allResults, (error, result) => {
            if(error) {
              stats.increment('analyzers.' + entry + '.failed');
            } else {
              stats.increment('analyzers.' + entry + '.success');
            }

            stats.timing('analyzers.' + entry + '.executionTime', startTime);

            cb(error, result);
          });
        };

        return result;
      }, {});

      async.parallel(parallel, (error, results) => {
        if(error) {
          logger.error('Failed to execute analyzers', error);
          this._accumulator[campaign._id].error = error.message;
        }

        this._accumulator[campaign._id].autoTestResults = results;

        this._campaignModel.saveComparisionBetweenVersions(campaign._id, {
          version1 : currentRunNumber,
          version2 : previousRunNumber
        }, results, callback);
      });
    });
  }
}

module.exports = SerialExecutor;
