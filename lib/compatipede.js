"use strict";

let jobModel, campaignModel, tabSequence, serialExecutor, args,
  JobModel = require('./models/job'),
  CampaignModel = require('./models/campaign'),
  TabSequence = require('./tabSequence'),
  SerialExecutor = require('./serialExecutor'),
  logger = require('deelogger')('compatipede'),
  async = require('async');

module.exports = function(argv) {
  let dbSettings = {
    host : argv.couchdbHost,
    port : argv.couchdbPort,
    auth : {
      username : argv.couchdbUser,
      password : argv.couchdbPassword
    }
  };

  args = argv;

  jobModel = new JobModel(dbSettings, argv.jobsDb);
  campaignModel = new CampaignModel(dbSettings, argv.campaignDb);
  tabSequence = new TabSequence(argv.masterUrl);
  serialExecutor = new SerialExecutor(argv.processId, jobModel,
    campaignModel, tabSequence);

  serialExecutor.runTime = argv.interval

  jobModel.once('ready', ready);
  campaignModel.once('ready', ready);
};

let readyCnt = 0;

function ready() {
  readyCnt += 1;

  if(readyCnt !== 2) {
    return;
  }

  execute();
}

function execute() {
  async.series([
    require('./githubDispatcher').bind(null, args),
    serialExecutor.loop.bind(serialExecutor)
  ], (error) => {
    if(error) {
      logger.error('Failed to do loop', error);
      throw error;
    }

    logger.info('All done');
    process.exit(0);
  });
}
