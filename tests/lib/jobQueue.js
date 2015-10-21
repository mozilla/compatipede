"use strict";

let JobQueue = require('../../lib/jobQueue'),
  should = require('should'),
  nock = require('nock'),
  BoarClient = require('../../node_modules/jannah-client/node_modules/boar-client');

describe('jobQueue', () => {
  let jobQueue, jobDetails;

  before(() => {
    nock.disableNetConnect();
  });

  after(() => {
    nock.enableNetConnect();
    nock.restore();
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
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('should be exported as a function', () => {
    JobQueue.should.be.a.Function();
  });

  describe('add', () => {
    it('shoud call _requestTab if job can be processed right away', (done) => {
      jobQueue._requestTab = (id, details) => {
        id.should.be.equal('someId');
        details.should.be.equal(jobDetails);
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
        jobDetails : jobDetails
      }]);
    });

    it('should push job to the queue if it is blocked because no new tabs can be created', () => {
      jobQueue._requestTab = () => {
        throw new Error('should not have been called');
      };

      jobQueue._blocked = true;

      jobQueue.add('someId', jobDetails);
      jobQueue._queue.should.be.eql([{
        id : 'someId',
        jobDetails : jobDetails
      }]);
    });
  });

  describe('_requestTab', () => {
    let request;

    beforeEach(function() {
      request = nock('http://localhost:7777')
        .post('/sessions', {
          engine : 'gecko'
        })
        .reply(200, {
          url : 'http://tab-url'
        });
    });

    it('should get tab from jannah', (done) => {
      jobQueue._processNext = () => {};
      jobQueue._doTabSequence = () => {};

      jobQueue._requestTab('someId', jobDetails);
      jobQueue._requestingTab.should.be.equal(true);

      //it isn't synchronous
      setTimeout(() => {
        request.done();
        jobQueue._requestingTab.should.be.equal(false);
        done();
      }, 50);
    });

    it('should call _doTabSequence with job and tab if jannah returned tab details', (done) => {
      jobQueue._doTabSequence = (id, details, tab) => {
        id.should.be.equal('someId');
        details.should.be.equal(jobDetails);
        tab.should.be.an.instanceof(BoarClient);
        done();
      };

      jobQueue._requestTab('someId', jobDetails);
    });

    it('should clear blocked flag if tab is allocated correctly', (done) => {
      jobQueue._blocked = true;

      jobQueue._requestTab('someId', jobDetails);
      jobQueue._doTabSequence = () => {
        jobQueue._blocked.should.be.equal(false);
        done();
      };
    });

    it('should queue job and then call _processNext if it fails with error other than 503', (done) => {
      nock.cleanAll();
      nock('http://localhost:7777')
        .filteringRequestBody(function() {
          return '*';
        })
        .post('/sessions', '*')
        .reply(500, {
          message : 'internal server error'
        });

      jobQueue._processNext = () => {
        jobQueue._queue.should.be.eql([{
          id : 'someId',
          jobDetails : jobDetails
        }]);

        jobQueue._requestingTab.should.be.equal(false);
        jobQueue._blocked.should.be.equal(false);

        done();
      };

      jobQueue._requestTab('someId', jobDetails);
    });

    it('should queue job and then call _processNextWithDelay if it fails with 503 error', (done) => {
      nock.cleanAll();
      nock('http://localhost:7777')
        .filteringRequestBody(function() {
          return '*';
        })
        .post('/sessions', '*')
        .reply(503, {
          message : 'Failed to allocate tab'
        });

      jobQueue._processNextWithDelay = () => {
        jobQueue._queue.should.be.eql([{
          id : 'someId',
          jobDetails : jobDetails
        }]);

        jobQueue._requestingTab.should.be.equal(false);
        jobQueue._blocked.should.be.equal(true);

        done();
      };

      jobQueue._requestTab('someId', jobDetails);
    });
  });

  describe('_processNext', () => {
    it('should request tab for next job in the queue', (done) => {
      jobQueue._queue.push({
        id : 'someId',
        jobDetails : jobDetails
      });

      jobQueue._requestTab = (id, details) => {
        id.should.be.equal('someId');
        details.should.be.equal(jobDetails);

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

      jobQueue._queue.push({
        id : 'someId',
        jobDetails : jobDetails
      });

      jobQueue._requestTab = (id, details) => {
        id.should.be.equal('someId');
        details.should.be.equal(jobDetails);
        jobQueue._queue.should.be.eql([]);

        (Date.now() - startTime).should.be.within(400, 600);

        done();
      };

      jobQueue._processNextWithDelay();
    });
  });

  describe('_doTabSequence', () => {
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
        destroyRequest = nock('http://hub:9999')
          .post('/destroy', {})
          .reply(200, {});


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
            screenshot : 'base64 png'
          }
        });

        userAgentRequest.done();
        screenSizeRequest.done();
        openRequest.done();
        screenSizeRequest.done();
        resourcesRequest.done();
        destroyRequest.done();

        done();
      });

      jobQueue._doTabSequence('someId', jobDetails, new BoarClient('http://hub:9999'));
    });
  });
});
