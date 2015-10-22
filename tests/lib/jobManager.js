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

  afterEach(function() {
    couchdb.close();
  });

  it('should be exported as function', () => {
    JobManager.should.be.a.Function();
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
      couchdb.on('PUT', function(data) {
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
