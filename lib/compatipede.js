"use strict";

let jobModel, campaignModel, tabSequence, serialExecutor, args, emailModel, email,
  JobModel = require('./models/job'),
  CampaignModel = require('./models/campaign'),
  EmailModel = require('./models/email'),
  Email = require('./email'),
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
  emailModel = new EmailModel(dbSettings, argv.emailDb);
  tabSequence = new TabSequence(argv.masterUrl);
  serialExecutor = new SerialExecutor(argv.processId, jobModel,
    campaignModel, tabSequence);
  email = new Email(argv.smtpString, argv.emailFrom, emailModel);
  serialExecutor.runTime = argv.interval;

  jobModel.once('ready', ready);
  campaignModel.once('ready', ready);
  emailModel.once('ready', ready);
};

let readyCnt = 0;

function ready() {
  readyCnt += 1;

  if(readyCnt !== 3) {
    return;
  }

  execute();
}

function execute() {
  async.series([
    require('./githubDispatcher').bind(null, args),
    serialExecutor.loop.bind(serialExecutor),
    (cb) => {
      email.sendRunData(serialExecutor.campaignResults, cb);
    }
  ], (error) => {
    if(error) {
      logger.error('Failed to do loop', error);
      throw error;
    }

    logger.info('All done');
    process.exit(0);
  });
}

setInterval(()=>{}, 100000000000);
