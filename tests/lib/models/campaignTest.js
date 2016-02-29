"use strict";

let Campaign = require('../../../lib/models/campaign'),
  should = require('should'),
  mockCouch = require('mock-couch'),
  topsites = require('moz-data-site-toplists');

topsites.enableTestMode();

describe('campaign', () => {
  let couchdb, campaign;

  beforeEach(function(done) {
    couchdb = mockCouch.createServer();
    couchdb.listen(5999, done);
    couchdb.addDB('compatipede-campaign', []);
    campaign = new Campaign({
      host : 'localhost',
      port : 5999,
      auth : {
        username : 'couch',
        password : 'test'
      },
      heartbeatInterval : 100
    }, 'compatipede-campaign');
    campaign.on('error', () => {});
  });

  afterEach(() => {
    couchdb.close();
  });

  it('should be exported as function', () => {
    Campaign.should.be.a.Function();
  });

  describe('addFromGithub', () => {
    let githubIssue;

    beforeEach(() => {
      githubIssue = {
        url       : 'https://google.com',
        status    : 'open',
        forMobile : true,
        userAgent : 'someUserAgentFromBug',
        engine    : 'gecko',
        issueUrl  : 'http://github.com/web-compat/issues/1',
        id        : 666,
        number    : 1
      };
    });

    it('should add new campaign for open github issue', (done) => {
      couchdb.on('PUT', (data) => {
        data.id.should.be.equal('github-666');
        let doc = data.doc;
        doc.autoTests.should.be.eql([]);
        doc.autoTestable.should.be.equal(true);
        doc.from.should.be.equal('github');
        doc.status.should.be.equal('open');
        doc.runCount.should.be.equal(0);
        doc.details.should.be.eql({
          targetURI  : 'https://google.com',
          domain     : 'google.com',
          tags       : [ '1000', 'us50' ],
          type       : 'mobile',
          userAgents : ['someUserAgentFromBug'],
          engines    : ['gecko']
        });
        doc.github.should.be.eql({
          issueUrl : 'http://github.com/web-compat/issues/1',
          id       : 666,
          number   : 1
        });
        done();
      });
      campaign.addFromGithub(githubIssue, () => {});
    });

    it('should not add anything if issue is closed and there is nothing on our side', (done) => {
      githubIssue.status = 'closed';

      couchdb.on('PUT', () => {
        throw new Error('should not have been called');
      });

      campaign.addFromGithub(githubIssue, (error) => {
        should.not.exist(error);
        done();
      });
    });

    it('should update document status if there is already a campaign for github issue but issue got closed', (done) => {
      campaign.addFromGithub(githubIssue, (error) => {
        should.not.exist(error);
        couchdb.on('PUT', (data) => {
          data.doc.status.should.be.equal('closed');
          should.exist(data.doc.closedAt);
          done();
        });

        githubIssue.status = 'closed';
        campaign.addFromGithub(githubIssue, () => {});
      });
    });

    it('should not fail if campaign for github issue already exists', (done) => {
      couchdb.on('PUT', () => {
        throw new Error('should not have been called');
      });

      campaign.addFromGithub(githubIssue, (error) => {
        should.not.exist(error);
        campaign.addFromGithub(githubIssue, (error) => {
          should.not.exist(error);
          done();
        });
      });
    });
  });

  describe('setRunNumber', () => {
    beforeEach(() => {
      couchdb.addDoc('compatipede-campaign', {
        _id : 'someCampaignId',
        runCount : 0
      });
    });

    it('should set run number for document', (done) => {
      couchdb.on('PUT', (data) => {
        data.doc.runCount.should.be.equal(666);
        done();
      });

      campaign.setRunNumber('someCampaignId', 666, () => {});
    });
  });

  describe('saveComparisionBetweenVersions', () => {
    beforeEach(() => {
      couchdb.addDoc('compatipede-campaign', {
        _id : 'someCampaignId'
      });
    });

    it('should store result in db', (done) => {
      couchdb.on('PUT', (data) => {
        should.exist(data.doc.autoTestResultsBetweenVersions.date);
        data.doc.autoTestResultsBetweenVersions.versions.should.be.eql({
          version1 : 1,
          version2 : 2
        });
        data.doc.autoTestResultsBetweenVersions.results.should.be.eql({
          redirects : {
            correct : true,
            diff : {}
          }
        });
        done();
      });

      campaign.saveComparisionBetweenVersions('someCampaignId', {
        version1 : 1,
        version2 : 2
      }, {
        redirects : {
          correct : true,
          diff : {}
        }
      }, () => {});
    });
  });
});
