"use strict";

let Job = require('./models/job'),
  JobQueue = require('./jobQueue'),
  logger = require('deelogger')('Conductor');

module.exports = function(argv) {
  let saveResources = argv.saveResources === 'yes';

  let jobModel = new Job({
      host : argv.couchdbHost,
      port : argv.couchdbPort,
      auth : {
        username : argv.couchdbUser,
        password : argv.couchdbPassword
      }
    }, argv.couchdbDb, saveResources),
    jobQueue = new JobQueue(argv.masterUrl);

  jobModel.once('ready', () => {
    logger.info('Job model is ready');
    jobModel.startListening();
  });

  jobQueue.on('jobResult', (result) => {
    logger.info('Job finished', {
      id : result.id
    });

    jobModel.updateWithResult(result.id, result.jobDetails, result.result, (error) => {
      if(error) {
        logger.error('Failed to update job with results', {
          id    : result.id,
          error : error.message
        });
      }
    });
  });

  jobQueue.on('failedJob', (id, errors) => {
    jobModel.markAsFailed(id, errors, (error) => {
      if(error) {
        logger.error('Failed to update with failed job details', {
          id : id,
          error : error.message
        });
      }
    });
  });

  jobModel.on('newJob', (job) => {
    if(!job.jobDetails) {
      return jobModel.markAsInvalid(job._id, (error) => {
        logger.error('Failed to updated job details', {
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

