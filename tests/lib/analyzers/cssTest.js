"use strict";

let CSS = require('../../../lib/analyzers/css/index'),
  should = require('should');

describe('css.js', () => {
  let css, campaign;

  beforeEach(() => {
    css = new CSS();
    campaign = {
      details : {
        targetURI : 'http://resource2'
      },
      _id : 'some id'
    };
  });

  describe('analyse', () => {
    it('should return false if there are still issues in latest version', (done) => {
      css.analyse(campaign, [{
        runNumber : 1,
        pluginResults : {
          'css-analyzer' : [{
            selector : 'body',
            problems : [{
              property : 'webkitAnimation',
              value : ''
            }]
          }]
        }
      }, {
        runNumber : 2,
        pluginResults : {
          'css-analyzer' : [{
            selector : 'body',
            problems : [{
              property : 'webkitAnimation',
              value : ''
            }]
          }]
        }
      }], (error, result) => {
        should.not.exist(error);
        result.correct.should.be.equal(false);
        result.diff.should.be.eql({});
        done();
      });
    });

    it('should return diff with new issues that are present in latest scan', (done) => {
      css.analyse(campaign, [{
        runNumber : 1,
        pluginResults : {
          'css-analyzer' : []
        }
      }, {
        runNumber : 2,
        pluginResults : {
          'css-analyzer' : [{
            selector : 'body',
            problems : [{
              property : 'webkitAnimation',
              value : ''
            }]
          }]
        }
      }], (error, result) => {
        should.not.exist(error);
        result.correct.should.be.equal(false);
        result.diff.should.be.eql({
          '2-1' : {
            newProblems : {
              body : [{
                property : 'webkitAnimation',
                value : ''
              }]
            },
            fixedProblems : {}
          }
        });
        done();
      });
    });

     it('should return diff with fixed issues', (done) => {
      css.analyse(campaign, [{
        runNumber : 1,
        pluginResults : {
          'css-analyzer' : [{
            selector : 'body',
            problems : [{
              property : 'webkitAnimation',
              value : ''
            }]
          }, {
            selector : 'body p',
            problems : [{
              property : 'webkitAnimation',
              value : ''
            }]
          }]
        }
      }, {
        runNumber : 2,
        pluginResults : {
          'css-analyzer' : [{
            selector : 'body',
            problems : [{
              property : 'webkitAnimation',
              value : ''
            }]
          }]
        }
      }], (error, result) => {
        should.not.exist(error);
        result.correct.should.be.equal(false);
        result.diff.should.be.eql({
          '2-1' : {
            newProblems : {},
            fixedProblems : {
               'body p' : [{
                property : 'webkitAnimation',
                value : ''
              }]
            }
          }
        });
        done();
      });
    });

    it('should return correct as true if there are no problems anymore', (done) => {
      css.analyse(campaign, [{
        runNumber : 1,
        pluginResults : {
          'css-analyzer' : [{
            selector : 'body',
            problems : [{
              property : 'webkitAnimation',
              value : ''
            }]
          }]
        }
      }, {
        runNumber : 2,
        pluginResults : {
          'css-analyzer' : []
        }
      }], (error, result) => {
        should.not.exist(error);
        result.correct.should.be.equal(true);
        result.diff.should.be.eql({
          '2-1' : {
            newProblems : {},
            fixedProblems : {
               'body' : [{
                property : 'webkitAnimation',
                value : ''
              }]
            }
          }
        });
        done();
      });
    });
  });
});
