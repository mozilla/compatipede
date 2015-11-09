"use strict";

let should = require('should'),
  JobManager = require('../../lib/jobManager'),
  mockCouch = require('mock-couch');

describe('jobManager', () => {
  let couchdb, jobManager;

  beforeEach(function(done) {
    couchdb = mockCouch.createServer();
    couchdb.listen(5999, done);
    couchdb.addDB('conductor', []);
    jobManager = new JobManager({
      host : 'localhost',
      port : 5999,
      auth : {
        username : 'couch',
        password : 'test'
      },
      db : 'conductor',
      heartbeatInterval : 100
    });
    jobManager.on('error', () => {}); //
  });

  afterEach(() => {
    couchdb.close();
  });

  it('should be exported as function', () => {
    JobManager.should.be.a.Function();
  });

  describe('addFromGithubIssue', () => {
    let githubJob;

    beforeEach(() => {
      githubJob = {
        id : '115795929',
        issueUrl : 'https://github.com/webcompat/web-bugs/issues/1906',
        forMobile : true,
        url : 'https://google.com',
        userAgent : 'Mozilla/5.0 (Android 5.1.1; Mobile; rv:45.0) Gecko/45.0 Firefox/45.0'
      };
    });

    it('should add two jobs one for gecko engine and one for webkit', (done) => {
      let docCount = 0;

      couchdb.on('PUT', (data) => {
        docCount += 1;

        if(data.doc.jobDetails.engine === 'gecko') {
          data.id.should.be.equal('github-115795929-gecko');
        } else {
          data.id.should.be.equal('github-115795929-webkit');
        }

        data.doc.jobDetails.targetURI.should.be.equal('https://google.com');
        data.doc.jobDetails.screenSize.should.be.eql({
          width : 640,
          height : 1136
        });
        data.doc.jobDetails.userAgent.should.be.equal('Mozilla/5.0 (Android 5.1.1; Mobile; rv:45.0) Gecko/45.0 Firefox/45.0');
        data.doc.github.should.be.eql({
          id : '115795929',
          issueUrl : 'https://github.com/webcompat/web-bugs/issues/1906'
        });
      });

      jobManager.addFromGithubIssue(githubJob, (error) => {
        should.not.exist(error);
        docCount.should.be.equal(2);
        done();
      });
    });

    it('should not fail if there is already github job', (done) => {
      jobManager.addFromGithubIssue(githubJob, (error) => {
        jobManager.addFromGithubIssue(githubJob, (error) => {
          should.not.exist(error);
          done();
        });
      });
    });
  });

  describe('updateWithResult', () => {
    beforeEach(() => {
      couchdb.addDoc('conductor', {
        _id : 'correctJobId',
        status : 'new',
        jobDetails : {
          engine : 'gecko'
        }
      });
    });

    it('should update job with results', (done) => {
      couchdb.on('PUT', (data) => {
        data.doc.jobDetails.should.be.eql({
          engine : 'gecko'
        });
        should.exist(data.doc.jobResults);
        should.exist(data.doc._attachments);
        done();
      });

      jobManager.updateWithResult('correctJobId', {
        resources : {
          something : 'test'
        },
        screenshot : 'test image png'
      }, (error) => {
        should.not.exist(error);
      });
    });
  });

  describe('markAsInvalid', () => {
    beforeEach(() => {
      couchdb.addDoc('conductor', {
        _id : 'invalidJobId',
        status : 'new',
        somethingElse : {
          engine : 'gecko'
        }
      });
    });

    it('should update status of document and set it to invalid', (done) => {
      couchdb.on('PUT', function(data) {
        data.id.should.be.equal('invalidJobId');
        data.doc.status.should.be.equal('invalid');
        done();
      });

      jobManager.markAsInvalid('invalidJobId', (error) => {
        should.not.exist(error);
      });
    });
  });

  describe('startListening', () => {
    beforeEach(() => {
      jobManager.startListening();
    });

    it('should emit new job events when jobs are added', (done) => {
      jobManager.on('newJob', (job) => {
        job.jobDetails.should.be.eql({
          engine : 'gecko'
        });
        job._id.should.be.equal('newJobId1');
        done();
      });

      couchdb.addDoc('conductor', {
        _id : 'newJobId1',
        status : 'new',
        jobDetails : {
          engine : 'gecko'
        }
      });
    });
  });
});
