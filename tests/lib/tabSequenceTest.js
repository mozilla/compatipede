"use strict";

let TabSequence = require('../../lib/tabSequence'),
  should = require('should'),
  nock = require('nock'),
  BoarClient;

  try {
    BoarClient = require('../../node_modules/jannah-client/node_modules/boar-client');
  } catch(e) {
    BoarClient = require('boar-client');
  }

describe('tabSequence', () => {
  let tabSequence, jobDetails, jobObject;

  before(() => {
    nock.disableNetConnect();
  });

  after(() => {
    nock.enableNetConnect();
  });

  beforeEach(() => {
    tabSequence = new TabSequence('http://localhost:7777', 200);

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
      errors       : [],
      callback     : () => {}
    };
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('execute', () => {
    it('shoud call _requestTab with modified job object', (done) => {
      let cb = () => {};
      tabSequence._requestTab = (jobObject) => {
        jobObject.should.be.eql({
          id           : 'someId',
          jobDetails   : jobDetails,
          failureCount : 0,
          errors       : [],
          callback     : cb
        });

        done();
      };

      tabSequence.execute('someId', jobDetails, cb);
    });
  });

  describe('_requestTab', () => {
    let request;

    beforeEach(function() {
      request = nock('http://localhost:7777')
        .post('/sessions', {
          engine : 'gecko',
          adblock : true
        })
        .reply(200, {
          url : 'http://tab-url'
        });
    });

    it('should get tab from jannah', (done) => {
      tabSequence._doTabSequence = () => {};

      tabSequence._requestTab(jobObject);

      //it isn't synchronous
      setTimeout(() => {
        request.done();
        done();
      }, 100);
    });

    it('should call _doTabSequence with job and tab if jannah returned tab details', (done) => {
      tabSequence._doTabSequence = (job, tab) => {
        job.should.be.equal(jobObject);
        tab.should.be.an.instanceof(BoarClient);
        done();
      };

      tabSequence._requestTab(jobObject);
    });

    it('should execute callback with an error if tab could not be allocated because of jannah error', (done) => {
      nock.cleanAll();
      nock('http://localhost:7777')
        .filteringRequestBody(function() {
          return '*';
        })
        .post('/sessions', '*')
        .reply(404, {
          message : 'Not found'
        });

      jobObject.callback = (error) => {
        should.exist(error);
        done();
      };

      tabSequence._requestTab(jobObject);
    });

    it('should execute it again with a delay if it fails with 503 error', (done) => {
      nock.cleanAll();
      nock('http://localhost:7777')
        .filteringRequestBody(function() {
          return '*';
        })
        .post('/sessions', '*')
        .reply(503, {
          message : 'Failed to allocate tab'
        });

      tabSequence._executeWithDelay = (job) => {
        job.should.be.equal(jobObject);

        done();
      };

      tabSequence._requestTab(jobObject);
    });
  });

  describe('_executeWithDelay', () => {
    it('should job again after delay', (done) => {
      tabSequence._requestTab = (job) => {
        job.should.be.equal(jobObject);
        done();
      };

      tabSequence._executeWithDelay(jobObject);
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
        redirectRequest = nock('http://hub:9999')
          .post('/getRedirects', {})
          .reply(200, {
            redirects : {
              something : 'to somewhere'
            }
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

      jobObject.callback = (error, result) => {
        should.not.exist(error);
        result.should.be.eql({
          id : 'someId',
          success : true,
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
            },
            redirects : {
              something : 'to somewhere'
            }
          },
          "jobDetails": {
              "engine": "gecko",
              "userAgent": "some gecko ua",
              "screenSize": {
                  "width": 1024,
                  "height": 1024
              },
              "targetURI": "https://google.com"
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
        redirectRequest.done();

        done();
      };

      tabSequence._doTabSequence(jobObject, new BoarClient('http://hub:9999'));
    });

    it('should destroy tab if one of the steps fails', (done) => {
       nock('http://hub:9999')
            .post('/setUserAgent', {
              userAgent : 'some gecko ua'
            })
            .reply(500, {});

        tabSequence._executeWithDelay = () => {
          setTimeout(() => {
            destroyRequest.done();
            done();
          }, 10);
        };

        tabSequence._doTabSequence(jobObject, new BoarClient('http://hub:9999'));
    });

    it('should increase failed attempt count if one of the steps fails with an error', (done) => {
       nock('http://hub:9999')
            .post('/setUserAgent', {
              userAgent : 'some gecko ua'
            })
            .reply(500, {});

        tabSequence._executeWithDelay = (jobObject) => {
          jobObject.failureCount.should.be.equal(1);
          done();
        };

        tabSequence._doTabSequence(jobObject, new BoarClient('http://hub:9999'));
    });

    it('should return with success false status when job fails 2 times', (done) => {
      nock('http://hub:9999')
          .post('/setUserAgent', {
            userAgent : 'some gecko ua'
          })
          .reply(500, {});

      jobObject.failureCount = 1;
      jobObject.errors = ['error1', 'error2', 'error3', 'error4'];
      jobObject.callback = (error, result) => {
        result.should.be.eql({
          id : 'someId',
          success : false,
          errors : ['error1', 'error2', 'error3', 'error4',
          {message : 'setUserAgent: Boar tab failed and retuned error : 500'}]
        });
        done();
      };

      tabSequence._doTabSequence(jobObject, new BoarClient('http://hub:9999'));
    });
  });
});
