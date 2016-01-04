"use strict";

let Run = require('./models/run'),
  JobQueue = require('./jobQueue'),
  logger = require('./logger')('Conductor');

module.exports = function(argv) {
  let runModel = new Run({
      host : argv.couchdbHost,
      port : argv.couchdbPort,
      auth : {
        username : argv.couchdbUser,
        password : argv.couchdbPassword
      }
    }, argv.couchdbDb),
    jobQueue = new JobQueue(argv.masterUrl);

  runModel.once('ready', () => {
    logger.info('ready', 'Run model is ready');
    runModel.startListening();
  });

  jobQueue.on('jobResult', (result) => {
    logger.info('jobResult', 'Run finished', {
      id : result.id
    });

    runModel.updateWithResult(result.id, result.result, (error) => {
      if(error) {
        logger.error('jobResult', 'Failed to update run with results', {
          id    : result.id,
          error : error.message
        });
      }
    });
  });

  jobQueue.on('failedJob', (id, errors) => {
    runModel.markAsFailed(id, errors, (error) => {
      if(error) {
        logger.error('failedJob', 'Failed to update with failed run details', {
          id : id,
          error : error.message
        });
      }
    });
  });

  runModel.on('newJob', (run) => {
    if(!run.jobDetails) {
      return runModel.markAsInvalid(run._id, (error) => {
        logger.error('markAsInvalid', 'Failed to updated run details', {
          id    : run._id,
          error : error.message
        });
      });
    }

    jobQueue.add(run._id, run.jobDetails);
  });
};

//when service starts up event loop doesn't have timers
//that would keep service live
setInterval(() => {}, 1000000);

