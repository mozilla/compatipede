"use strict";

let Job = require('../../../lib/models/job'),
  should = require('should'),
  mockCouch = require('mock-couch');

describe('job', () => {
  let couchdb, job;

  beforeEach(function(done) {
    couchdb = mockCouch.createServer();
    couchdb.listen(5999, done);
    couchdb.addDB('conductor-job', []);
    job = new Job({
      host : 'localhost',
      port : 5999,
      auth : {
        username : 'couch',
        password : 'test'
      },
      heartbeatInterval : 100
    }, 'conductor-job');
    job.on('error', () => {});
  });

  afterEach(() => {
    couchdb.close();
  });

  it('should be exported as function', () => {
    Job.should.be.a.Function();
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

    it('should add new job for open github issue', (done) => {
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

      job.addFromGithub(githubIssue, () => {});
    });

    it('should not add anything if issue is closed and there is nothing on our side', (done) => {
      githubIssue.status = 'closed';

      couchdb.on('PUT', () => {
        throw new Error('should not have been called');
      });

      job.addFromGithub(githubIssue, (error) => {
        should.not.exist(error);
        done();
      });
    });

    it('should update document status if there is already a job for github issue but issue got closed', (done) => {
      job.addFromGithub(githubIssue, (error) => {
        should.not.exist(error);
        couchdb.on('PUT', (data) => {
          data.doc.status.should.be.equal('closed');
          should.exist(data.doc.closedAt);
          done();
        });

        githubIssue.status = 'closed';
        job.addFromGithub(githubIssue, () => {});
      });
    });

    it('should not fail if job for github issue already exists', (done) => {
      couchdb.on('PUT', () => {
        throw new Error('should not have been called');
      });

      job.addFromGithub(githubIssue, (error) => {
        should.not.exist(error);
        job.addFromGithub(githubIssue, (error) => {
          should.not.exist(error);
          done();
        });
      });
    });
  });

  describe('setRunNumber', () => {
    it('should set run number for document', () => {
      couchdb.on('PUT', (data) => {
        data.doc.runCount.should.be.equal(666);
        done();
      });

      job.setRunNumber('someId', 666, () => {});
    });
  });
});
