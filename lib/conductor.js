"use strict";

let JobManager = require('./jobManager'),
  JobQueue = require('./jobQueue'),
  logger = require('./logger')('Conductor');

module.exports = function(argv) {
  let jobManager = new JobManager({
      host : argv.couchdbHost,
      port : argv.couchdbPort,
      auth : {
        username : argv.couchdbUser,
        password : argv.couchdbPassword
      },
      db : argv.couchdbDb
    }),
    jobQueue = new JobQueue(argv.masterUrl);

  jobManager.once('ready', () => {
    logger.info('ready', 'JobManager is ready');
    jobManager.startListening();
  });

  jobQueue.on('jobResult', (result) => {
    logger.info('jobResult', 'Job finished', {
      id : result.id
    });

    jobManager.updateWithResult(result.id, result.result, (error) => {
      if(error) {
        logger.error('jobResult', 'Failed to update job with results', {
          id    : result.id,
          error : error.message
        });
      }
    });
  });

  jobManager.on('newJob', (job) => {
    if(!job.jobDetails) {
      return jobManager.markAsInvalid(job._id, (error) => {
        logger.error('markAsInvalid', 'Failed to updated job details', {
          id    : job._id,
          error : error.message
        });
      });
    }

    jobQueue.add(job._id, job.jobDetails);
  });
};

//when service starts up event loop doesn't have timers
//that would keep service live
setInterval(() => {}, 1000000);

