"use strict";

let SerialExecutor = require('../../lib/serialExecutor'),
  CampaignModel = require('../../lib/models/campaign'),
  JobModel = require('../../lib/models/job'),
  TabSequence = require('../../lib/tabSequence'),
  should = require('should');

describe('serialExecutor', () => {
  let tabSequence, jobModel, campaignModel, serialExecutor;

  beforeEach(() => {
    jobModel = new JobModel({
      host : 'localhost',
      port : 5999,
      auth : {
        username : 'couch',
        password : 'test'
      }
    }, 'compatipede-jobs');

    campaignModel = new CampaignModel({
      host : 'localhost',
      port : 5999,
      auth : {
        username : 'couch',
        password : 'test'
      }
    }, 'compatipede-campaigns');

    campaignModel.on('error', ()=>{});
    jobModel.on('error', ()=>{});

    tabSequence = new TabSequence('http://master:6666');

    serialExecutor = new SerialExecutor('someProcessId', jobModel, campaignModel, tabSequence);
  });

  describe('loop', () => {
    let cb;
    beforeEach(() => {
      cb = () => {
        throw new Error('should not be called');
      };

      campaignModel.getCampaignForRunning = (processId, time, callback) => {
        callback(null, {
          _id      : 'campaignId',
          runCount : 666
        });
      };
    });

    it('should fetch next available campaign', (done) => {
      campaignModel.getCampaignForRunning = (processId, time, callback) => {
        let d = new Date();

        d.setUTCHours(0);
        d.setUTCMinutes(0);
        d.setUTCSeconds(0);
        d.setUTCMilliseconds(0);

        d.setUTCDate(d.getUTCDate() - d.getUTCDay());

        processId.should.be.equal('someProcessId');
        time.should.be.equal(d.getTime());
        callback.should.be.a.Function();
        done();
      };

      serialExecutor.loop(cb);
    });

    it('should be going through required operations on campaign', (done) => {
      let createDone, executeDone;
      serialExecutor._createJobs = (campaign, callback) => {
        campaign.should.be.eql({
          _id      : 'campaignId',
          runCount : 666
        });
        callback.should.be.a.Function();
        createDone = true;

        callback();
      };

      serialExecutor._executeJobs = (campaignId, runCount, callback) => {
        campaignId.should.be.equal('campaignId');
        runCount.should.be.equal(666);
        callback.should.be.a.Function();
        executeDone = true;

        callback();
      };

      campaignModel.markAsDone = (campaignId, callback) => {
        campaignId.should.be.equal('campaignId');
        callback.should.be.a.Function();

        createDone.should.be.equal(true);
        executeDone.should.be.equal(true);

        done();
      };

      serialExecutor.loop(cb);
    });

    it('should be calling provided callback if nothing was read from DB', (done) => {
      campaignModel.getCampaignForRunning = (processId, time, callback) => {
        callback();
      };

      serialExecutor.loop(done);
    });

    it('should call callback with an error if fetch failed', (done) => {
      campaignModel.getCampaignForRunning = (processId, time, callback) => {
        callback(new Error('test error'));
      };

      serialExecutor.loop((error) => {
        should.exist(error);
        done();
      });
    });

    it('should recure if campaign was found', (done) => {
      serialExecutor._createJobs = (campaign, callback) => {
        callback();
      };

      serialExecutor._executeJobs = (campaignId, runCount, callback) => {
        callback();
      };

      campaignModel.markAsDone = (campaignId, callback) => {
        callback();
      };

      campaignModel.getCampaignForRunning = (processId, time, callback) => {
        serialExecutor.loop = (callback) => {
          callback.should.be.equal(cb);
          done();
        };

        callback(null, {
          _id : 'campaignId'
        });
      };

      serialExecutor.loop(cb);
    });
  });

  describe('_createJobs', () => {
    let campaign;

    beforeEach(() => {
      campaign = {
        _id : 'campaignId',
        runCount : 13,
        details : {
          engines : ['webkit', 'gecko'],
          userAgents : ['some ua'],
          type : 'mobile',
          targetURI : 'https://google.com'
        }
      };
    });

    it('should create new jobs for all the possible combinations', (done) => {
      let calledWith = [];

      jobModel.createNewRun = (campaignId, runNumber, details, callback) => {
        campaignId.should.be.equal('campaignId');
        runNumber.should.be.equal(13);
        calledWith.push(details);
        callback();
      };

      serialExecutor._createJobs(campaign, (error) => {
        should.not.exist(error);
        calledWith.length.should.be.equal(2);
        calledWith.should.containEql({
          engine : 'gecko',
          targetURI : 'https://google.com',
          userAgent : 'some ua',
          screenSize : {
            width : 640,
            height : 1136
          }
        });
        calledWith.should.containEql({
          engine : 'webkit',
          targetURI : 'https://google.com',
          userAgent : 'some ua',
          screenSize : {
            width : 640,
            height : 1136
          }
        });
        done();
      });
    });
  });

  describe('_executeJobs', () => {
    beforeEach(() => {
      jobModel.getForCampaignExecution = (campaignId, runNumber, callback) => {
        callback(null, [{
          _id : 'someId1',
          jobDetails : {
            engine : 'gecko'
          }
        }, {
          _id : 'someId2',
          jobDetails : {
            engine : 'webkit'
          }
        }]);
      };

      jobModel.updateWithResult = (id, result, callback) => {
        callback();
      };

      tabSequence.execute = (id, details, callback) => {
        callback(null, {
          success : true,
          id      : id,
          result  : {
            screenshot : 'some png'
          }
        });
      };
    });

    it('should fetch all jobs for given campaign', (done) => {
      jobModel.getForCampaignExecution = (campaignId, runNumber, callback) => {
        campaignId.should.be.equal('campaignId');
        runNumber.should.be.equal(13);
        callback.should.be.a.Function();
        done();
      };

      serialExecutor._executeJobs('campaignId', 13, ()=>{});
    });

    it('should execute all jobs against boar', (done) => {
      let calledWith = [];

      tabSequence.execute = (jobId, details, callback) => {
        calledWith.push({
          id      : jobId,
          details :details
        });
        callback.should.be.a.Function();
        callback(null, {success: true});
      };

      serialExecutor._executeJobs('campaignId', 13, () => {
        calledWith.length.should.be.equal(2);
        calledWith.should.containEql({
          id : 'someId1',
          details : {
            engine : 'gecko'
          }
        });
        calledWith.should.containEql({
          id : 'someId2',
          details : {
            engine : 'webkit'
          }
        });

        done();
      });
    });

    it('should update job with results if execution suceeded', (done) => {
      let calledWith = [];
      jobModel.updateWithResult = (id, result, cb) => {
        calledWith.push({
          id     : id,
          result : result
        });

        cb();
      };

       serialExecutor._executeJobs('campaignId', 13, () => {
        calledWith.length.should.be.equal(2);
        calledWith.should.containEql({
          id : 'someId1',
          result : {
            screenshot : 'some png'
          }
        });
        calledWith.should.containEql({
          id : 'someId2',
          result : {
            screenshot : 'some png'
          }
        });

        done();
      });
    });

    it('should update job with failure details if job could not be executed', (done) => {
      let calledWith = [];

      tabSequence.execute = (id, details, callback) => {
        callback(null, {
          success : false,
          id      : id,
          errors  : ['error1']
        });
      };

      jobModel.markAsFailed = (id, errors, cb) => {
        calledWith.push({
          id     : id,
          errors : errors
        });

        cb();
      };

       serialExecutor._executeJobs('campaignId', 13, () => {
        calledWith.length.should.be.equal(2);
        calledWith.should.containEql({
          id : 'someId1',
          errors : ['error1']
        });
        calledWith.should.containEql({
          id : 'someId2',
          errors : ['error1']
        });

        done();
      });
    });
  });
});
