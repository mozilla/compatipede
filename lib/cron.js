"use strict";

let jobModel, runModel,
  Job = require('./models/job'),
  Run = require('./models/run'),
  logger = require('./logger')('Conductor'),
  async = require('async'),
  readyCnt = 0,
  screenSizes = { //most popular screen sizes
    desktopSize : {
      width : 1366,
      height : 768
    },
    mobileSize : {
      width : 640,
      height : 1136
    }
  };

module.exports = function(argv) {
  jobModel = new Job({
    host : argv.couchdbHost,
    port : argv.couchdbPort,
    auth : {
      username : argv.couchdbUser,
      password : argv.couchdbPassword
    }
  }, argv.jobDb);
  runModel = new Run({
    host : argv.couchdbHost,
    port : argv.couchdbPort,
    auth : {
      username : argv.couchdbUser,
      password : argv.couchdbPassword
    }
  }, argv.runDb);

  jobModel.once('ready', () => {
    logger.info('ready', 'Job model is ready');
    ready();
  });

  runModel.once('ready', () => {
    logger.info('ready', 'Run model is ready');
    ready();
  });
};

function ready() {
  readyCnt += 1;

  if(readyCnt !== 2) {
    return;
  }

  jobModel.getOpenJobs((error, jobs) => {
    if(error) {
      throw error;
    }

    async.mapSeries(jobs, (job, cb) => {
      let runNumber = job.runCount + 1,
        details = job.details;

      //if multiple engines and multiple user agents then
      //all possible combinations are created
      async.mapSeries(details.engines || [], (engine, cb) => {
        async.mapSeries(details.userAgents || [], (userAgent, cb) => {
          runModel.createNewRun(job._id, runNumber, {
            engine     : engine,
            targetURI  : details.targetURI,
            userAgent  : userAgent,
            screenSize : details.type === 'mobile' ? screenSizes.mobileSize : screenSizes.desktopSize
          }, cb);
        }, cb);
      }, (error) => {
        if(error) {
          logger.error('ready', 'Failed to create new jobs', {
            engines    : details.engines,
            userAgents : details.userAgents,
            id         : job._id,
            error      : error.stack || error
          });
        } else {
          logger.info('ready', 'Create new runs for job', {
            engines    : details.engines,
            userAgents : details.userAgents,
            id         : job._id
          });
        }

        jobModel.setRunNumber(job._id, runNumber + 1, (error) => {
          if(error) {
            logger.error('ready', 'Failed to set new run number', {
              error : error.stack || error,
              id    : job._id
            });
          }

          cb();
        });
      });
    }, () => {
      logger.info('ready', 'Done creating new run jobs');
      process.exit(0);
    });
  });
}

//when service starts up event loop doesn't have timers
//that would keep service live
setInterval(() => {}, 1000000);

