"use strict";

let Redirects = require('../../../lib/investigators').Redirects,
  should = require('should');

describe('redirects.js', () => {
  let redirects, campaign;

  beforeEach(() => {
    redirects = new Redirects();
    campaign = {
      _id : 'some id'
    };
  });

  describe('investigate', () => {
    it('should return false if not all redirects match', (done) => {
      redirects.investigate(campaign, [{
        redirects : {
          'http://resource1' : 'http://redirect1',
          'http://resource2' : 'http://redirect2'
        }
      }, {
        redirects : {
          'http://resource1' : 'http://redirect1',
          'http://resource2' : 'http://redirect3'
        }
      }], (error, result) => {
        should.not.exist(error);
        result.correct.should.be.equal(false);
        result.diff.should.be.eql({
          'http://resource2' : ['http://redirect3', 'http://redirect2']
        });
        done();
      });
    });

    it('should return true if all redirects match', (done) => {
      redirects.investigate(campaign, [{
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
  });
});
