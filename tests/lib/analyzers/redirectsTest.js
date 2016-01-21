"use strict";

let Redirects = require('../../../lib/analyzers/redirects/index'),
  should = require('should');

describe('redirects.js', () => {
  let redirects, campaign;

  beforeEach(() => {
    redirects = new Redirects();
    campaign = {
      details : {
        targetURI : 'http://resource2'
      },
      _id : 'some id'
    };
  });

  describe('analyse', () => {
    it('should return false if not all redirects match', (done) => {
      redirects.analyse(campaign, [{
        redirects : {
          'http://resource1' : 'http://redirect1',
          'http://resource2' : 'http://redirect2'
        }
      }, {
        redirects : {
          'http://resource1' : 'http://redirect4',
          'http://resource2' : 'http://redirect3'
        }
      }], (error, result) => {
        should.not.exist(error);
        result.correct.should.be.equal(false);
        result.diff.should.be.eql({
          'http://resource2' : ['http://redirect2/', 'http://redirect3/']
        });
        done();
      });
    });

    it('should return true if page redirect matches even if secondary redirects dont', (done) => {
      redirects.analyse(campaign, [{
        redirects : {
          'http://resource1' : 'http://redirect1',
          'http://resource2' : 'http://redirect2'
        }
      }, {
        redirects : {
          'http://resource1' : 'http://redirect1',
          'http://resource2' : 'http://redirect2'
        }
      }], (error, result) => {
        should.not.exist(error);
        result.correct.should.be.equal(true);
        result.diff.should.be.eql({});
        done();
      });
    });

    it('should not go in endless loop if there is loop in redirects', (done) => {
      redirects.analyse(campaign, [{
        redirects : {
          'http://resource1' : 'http://resource2',
          'http://resource2' : 'http://resource1'
        }
      }, {
        redirects : {
          'http://resource1' : 'http://resource2',
          'http://resource2' : 'http://resource1'
        }
      }], (error, result) => {
        should.not.exist(error);
        done();
      });
    });

    it('should drop query parameters when comparing unique addresses', (done) => {
      redirects.analyse(campaign, [{
        redirects : {
          'http://resource2' : 'http://redirect2?test=1',
          'http://redirect2?test=1' : 'http://redirect2?test=3',
          'http://redirect2?test=3' : 'http://resource1/something?test=4'
        }
      }, {
        redirects : {
          'http://resource2' : 'http://redirect1?test=1',
          'http://redirect1?test=1' : 'http://redirect2?test=3',
          'http://redirect2?test=3' : 'http://resource1/something?test=5'
        }
      }], (error, result) => {
        should.not.exist(error);
        result.correct.should.be.equal(true);
        result.diff.should.be.eql({});
        done();
      });
    });
  });
});
