"use strict";

let should = require('should'),
  Job = require('../../../lib/models/job'),
  mockCouch = require('mock-couch'),
  topsites = require('moz-data-site-toplists');

topsites.enableTestMode();

describe('job', () => {
  let couchdb, job;

  beforeEach(function(done) {
    couchdb = mockCouch.createServer();
    couchdb.listen(5999, done);
    couchdb.addDB('compatipede-job', []);
    job = new Job({
      host : 'localhost',
      port : 5999,
      auth : {
        username : 'couch',
        password : 'test'
      },
      heartbeatInterval : 100
    }, 'compatipede-job');
    job.on('error', () => {});
  });

  afterEach(() => {
    couchdb.close();
  });

  it('should be exported as function', () => {
    Job.should.be.a.Function();
  });

  describe('updateWithResult', () => {
    beforeEach(() => {
      couchdb.addDoc('compatipede-job', {
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
          engine : 'gecko',
          targetURI : 'http://test.example.com',
          domain : "example.com",
          tags : []
        });
        data.doc.jobResults.resources.should.be.eql({
            something : 'test'
        });
        data.doc.jobResults.consoleLog.should.be.eql({
          consoleLog : []
        });
        data.doc.jobResults.errorLog.should.be.eql({
          consoleLog : []
        });

        data.doc._attachments.should.be.eql({
          screenshot : {
            content_type : 'image/png',
            data : 'test image png'
          }
        });
        should.exist(data.doc._attachments);
        done();
      });

      job.updateWithResult('correctJobId', {targetURI : 'http://test.example.com', engine : 'gecko'}, {
        resources : {
          something : 'test'
        },
        consoleLog : {
          consoleLog : []
        },
        errorLog : {
          consoleLog : []
        },
        screenshot : 'test image png'
      }, (error) => {
        should.not.exist(error);
      });
    });
  });

  describe('markAsInvalid', () => {
    beforeEach(() => {
      couchdb.addDoc('compatipede-job', {
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

      job.markAsInvalid('invalidJobId', (error) => {
        should.not.exist(error);
      });
    });
  });

  describe('markAsFailed', () => {
    beforeEach(() => {
      couchdb.addDoc('compatipede-job', {
        _id : 'failingJobId',
        status : 'new',
        jobDetails : {
          engine : 'gecko'
        }
      });
    });

    it('should store failure details in couchdb', (done) => {
      couchdb.on('PUT', function(data) {
        data.id.should.be.equal('failingJobId');
        data.doc.status.should.be.equal('failed');

        data.doc.failure.date.should.be.a.String();
        data.doc.failure.errors.should.be.eql(['error']);

        done();
      });

      job.markAsFailed('failingJobId', ['error'], (error) => {
        should.not.exist(error);
      });
    });
  });

  describe('createNewRun', () => {
    it('should add new document to the db', (done) => {
      couchdb.on('POST', (data) => {
        data.doc.status.should.be.equal('new');
        data.doc.jobId.should.be.equal('someJobId');
        data.doc.runNumber.should.be.equal(666);
        data.doc.jobDetails.should.be.eql({
          engine : 'webkit',
          targetURI : 'http://test.example.com',
          domain : 'example.com',
          tags : []
        });
        done();
      });

      job.createNewRun('someJobId', 666, {
        engine : 'webkit',
        targetURI:'http://test.example.com'
      }, () => {});
    });
  });

  describe('startListening', () => {
    beforeEach(() => {
      job.startListening();
    });

    it('should emit new job events when jobs are added', (done) => {
      job.on('newJob', (job) => {
        job.jobDetails.should.be.eql({
          engine : 'gecko'
        });
        job._id.should.be.equal('newJobId1');
        done();
      });

      couchdb.addDoc('compatipede-job', {
        _id : 'newJobId1',
        status : 'new',
        jobDetails : {
          engine : 'gecko'
        }
      });
    });
  });
});
