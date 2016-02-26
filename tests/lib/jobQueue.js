"use strict";

let JobQueue = require('../../lib/jobQueue'),
  should = require('should'),
  nock = require('nock'),
  BoarClient;

  try {
    BoarClient = require('../../node_modules/jannah-client/node_modules/boar-client');
  } catch(e) {
    BoarClient = require('boar-client');
  }

describe('jobQueue', () => {
  let jobQueue, jobDetails, jobObject;

  before(() => {
    nock.disableNetConnect();
  });

  after(() => {
    nock.enableNetConnect();
    // nock.cleanAll();
  });

  beforeEach(() => {
    jobQueue = new JobQueue('http://localhost:7777', 10 * 1000);

    jobDetails = {
      engine : 'gecko',
      userAgent : 'some gecko ua',
      screenSize : {
        width : 1024,
        height : 1024
      },
      targetURI : 'https://google.com'
    };
    jobObject = {
      id           : 'someId',
      jobDetails   : jobDetails,
      failureCount : 0,
      errors       : []
    };
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('should be exported as a function', () => {
    JobQueue.should.be.a.Function();
  });

  describe('add', () => {
    it('shoud call _requestTab if job can be processed right away', (done) => {
      jobQueue._requestTab = (jobObject) => {
        jobObject.should.be.eql({
          id           : 'someId',
          jobDetails   : jobDetails,
          failureCount : 0,
          errors       : []
        });

        done();
      };

      jobQueue.add('someId', jobDetails);
    });

    it('should push job to the queue if it is already requesting a tab', () => {
      jobQueue._requestTab = () => {
        throw new Error('should not have been called');
      };

      jobQueue._requestingTab = true;

      jobQueue.add('someId', jobDetails);
      jobQueue._queue.should.be.eql([{
        id : 'someId',
        jobDetails : jobDetails,
        failureCount : 0,
        errors : []
      }]);
    });

    it('should push job to the queue if it is blocked because no new tabs can be created', () => {
      jobQueue._requestTab = () => {
        throw new Error('should not have been called');
      };

      jobQueue._blocked = true;

      jobQueue.add('someId', jobDetails);
      jobQueue._queue.should.be.eql([{
        id           : 'someId',
        jobDetails   : jobDetails,
        failureCount : 0,
        errors       : []
      }]);
    });
  });

  describe('_requestTab', () => {
    let request;

    beforeEach(function() {
      request = nock('http://localhost:7777')
        .post('/sessions', {
          engine : 'gecko',
          adblock : false
        })
        .reply(200, {
          url : 'http://tab-url'
        });
    });

    it('should get tab from jannah', (done) => {
      jobQueue._processNext = () => {};
      jobQueue._doTabSequence = () => {};

      jobQueue._requestTab(jobObject);
      jobQueue._requestingTab.should.be.equal(true);

      //it isn't synchronous
      setTimeout(() => {
        request.done();
        jobQueue._requestingTab.should.be.equal(false);
        done();
      }, 50);
    });

    it('should call _doTabSequence with job and tab if jannah returned tab details', (done) => {
      jobQueue._doTabSequence = (job, tab) => {
        job.should.be.equal(jobObject);
        tab.should.be.an.instanceof(BoarClient);
        done();
      };

      jobQueue._requestTab(jobObject);
    });

    it('should clear blocked flag if tab is allocated correctly', (done) => {
      jobQueue._blocked = true;

      jobQueue._requestTab(jobObject);
      jobQueue._doTabSequence = () => {
        jobQueue._blocked.should.be.equal(false);
        done();
      };
    });

    it('should add job and then call _processNext if it fails with error other than 503', (done) => {
      let addedJob;

      nock.cleanAll();
      nock('http://localhost:7777')
        .filteringRequestBody(function() {
          return '*';
        })
        .post('/sessions', '*')
        .reply(404, {
          message : 'Not found'
        });

      jobQueue._add = (job) => {
        addedJob = job;
      };

      jobQueue._processNext = () => {
        addedJob.should.be.equal(jobObject);

        jobQueue._requestingTab.should.be.equal(false);
        jobQueue._blocked.should.be.equal(false);

        done();
      };

      jobQueue._requestTab(jobObject);
    });

    it('should add job and then call _processNextWithDelay if it fails with 503 error', (done) => {
      let addedJob;

      nock.cleanAll();
      nock('http://localhost:7777')
        .filteringRequestBody(function() {
          return '*';
        })
        .post('/sessions', '*')
        .reply(503, {
          message : 'Failed to allocate tab'
        });

      jobQueue._add = (job) => {
        addedJob = job;
      };

      jobQueue._processNextWithDelay = () => {
        addedJob.should.be.equal(jobObject);

        jobQueue._requestingTab.should.be.equal(false);
        jobQueue._blocked.should.be.equal(true);

        done();
      };

      jobQueue._requestTab(jobObject);
    });
  });

  describe('_processNext', () => {
    it('should request tab for next job in the queue', (done) => {
      jobQueue._queue.push(jobObject);

      jobQueue._requestTab = (job) => {
        job.should.be.equal(jobObject);

        jobQueue._queue.should.be.eql([]);

        done();
      };

      jobQueue._processNext();
    });
  });

  describe('_processNextWithDelay', () =>{
    it('should request new tab only after delay specified in constructor', (done) => {
      let startTime = Date.now();

      jobQueue = new JobQueue('http://localhost:7777', 500);

      jobQueue._queue.push(jobObject);

      jobQueue._requestTab = (job) => {
        job.should.be.equal(jobObject);
        jobQueue._queue.should.be.eql([]);

        (Date.now() - startTime).should.be.within(400, 600);

        done();
      };

      jobQueue._processNextWithDelay();
    });
  });

  describe('_doTabSequence', () => {
    let destroyRequest;

    beforeEach(() => {
      destroyRequest = nock('http://hub:9999')
        .post('/destroy', {})
        .reply(200, {});
    });

    it('should make requests to boar to fulfill necessary steps', (done) => {
      let userAgentRequest = nock('http://hub:9999')
          .post('/setUserAgent', {
            userAgent : 'some gecko ua'
          })
          .reply(200, {}),
        screenSizeRequest = nock('http://hub:9999')
          .post('/setScreenSize', {
            size : {
              width  : 1024,
              height : 1024
            }
          })
          .reply(200, {}),
        openRequest = nock('http://hub:9999')
          .post('/open', {
            url : 'https://google.com',
            waitForResources : true
          })
          .reply(200, {}),
        screenshotRequest = nock('http://hub:9999')
          .post('/getScreenshot', {})
          .reply(200, {
            data : 'base64 png'
          }),
        consoleLogRequest = nock('http://hub:9999')
          .post('/getConsoleLog', {})
          .reply(200, {
            consoleLog : [{msg : 'something'}]
          }),
        errorLogRequest = nock('http://hub:9999')
          .post('/getErrorLog', {})
          .reply(200, {
            consoleLog : [{msg : 'something dangerous'}]
          }),
        resourcesRequest = nock('http://hub:9999')
          .post('/getResources', {})
          .reply(200, {
            resources : {
              id : {
                request   : {},
                response  : 'test data',
                blocking  : 100,
                waiting   : 0,
                receiving : 0
              }
            }
          }),
        pluginRequest = nock('http://hub:9999')
          .post('/getPluginResults')
          .reply(200, {
            results : {
              somePlugin : {}
            }
          });


      jobQueue.once('jobResult', (result) => {
        result.should.be.eql({
          id : 'someId',
          result : {
            resources : {
              id : {
                request   : {},
                response  : 'test data',
                blocking  : 100,
                waiting   : 0,
                receiving : 0
              }
            },
            screenshot : 'base64 png',
            consoleLog : {
              consoleLog : [{msg : 'something'}]
            },
            errorLog : {
              consoleLog : [{msg : 'something dangerous'}]
            },
            pluginResults : {
              somePlugin : {}
            }
          }
        });

        userAgentRequest.done();
        screenSizeRequest.done();
        openRequest.done();
        screenSizeRequest.done();
        resourcesRequest.done();
        destroyRequest.done();
        consoleLogRequest.done();
        errorLogRequest.done();
        pluginRequest.done();
        screenshotRequest.done();

        done();
      });

      jobQueue._doTabSequence(jobObject, new BoarClient('http://hub:9999'));
    });

    it('should destroy tab if one of the steps fails', (done) => {
       nock('http://hub:9999')
            .post('/setUserAgent', {
              userAgent : 'some gecko ua'
            })
            .reply(500, {});

        jobQueue._add = () => {
          setTimeout(() => {
            destroyRequest.done();
            done();
          }, 10);
        };

        jobQueue._doTabSequence(jobObject, new BoarClient('http://hub:9999'));
    });

    it('should increase failed attempt count if one of the steps fails with an error', (done) => {
       nock('http://hub:9999')
            .post('/setUserAgent', {
              userAgent : 'some gecko ua'
            })
            .reply(500, {});

        jobQueue._add = (jobObject) => {
          jobObject.failureCount.should.be.equal(1);
          done();
        };

        jobQueue._doTabSequence(jobObject, new BoarClient('http://hub:9999'));
    });

    it('should emit failedJob event with id and errors when job fails 2 times', (done) => {
      nock('http://hub:9999')
          .post('/setUserAgent', {
            userAgent : 'some gecko ua'
          })
          .reply(500, {});

      jobObject.failureCount = 1;
      jobObject.errors = ['error1', 'error2', 'error3', 'error4'];

      jobQueue.once('failedJob', (id, errors) => {
        id.should.be.equal('someId');
        errors.should.be.eql(['error1', 'error2', 'error3', 'error4',
          {message : 'setUserAgent: Boar tab failed and retuned error : 500'}]);
        done();
      });

      jobQueue._doTabSequence(jobObject, new BoarClient('http://hub:9999'));
    });
  });
});
