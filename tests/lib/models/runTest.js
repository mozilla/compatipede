"use strict";

let should = require('should'),
  Run = require('../../../lib/models/run'),
  mockCouch = require('mock-couch');

describe('run', () => {
  let couchdb, run;

  beforeEach(function(done) {
    couchdb = mockCouch.createServer();
    couchdb.listen(5999, done);
    couchdb.addDB('conductor-run', []);
    run = new Run({
      host : 'localhost',
      port : 5999,
      auth : {
        username : 'couch',
        password : 'test'
      },
      heartbeatInterval : 100
    }, 'conductor-run');
    run.on('error', () => {});
  });

  afterEach(() => {
    couchdb.close();
  });

  it('should be exported as function', () => {
    Run.should.be.a.Function();
  });

  describe('updateWithResult', () => {
    beforeEach(() => {
      couchdb.addDoc('conductor-run', {
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

      run.updateWithResult('correctJobId', {
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
      couchdb.addDoc('conductor-run', {
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

      run.markAsInvalid('invalidJobId', (error) => {
        should.not.exist(error);
      });
    });
  });

  describe('markAsFailed', () => {
    beforeEach(() => {
      couchdb.addDoc('conductor-run', {
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

        should.exist(data.doc.failures);

        data.doc.failures[Object.keys(data.doc.failures)[0]].date.should.be.a.String();
        data.doc.failures[Object.keys(data.doc.failures)[0]].errors.should.be.eql(['error']);

        done();
      });

      run.markAsFailed('failingJobId', ['error'], (error) => {
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
          engine : 'webkit'
        });
        done();
      });

      run.createNewRun('someJobId', 666, {
        engine : 'webkit'
      }, () => {});
    });
  });

  describe('startListening', () => {
    beforeEach(() => {
      run.startListening();
    });

    it('should emit new job events when jobs are added', (done) => {
      run.on('newJob', (job) => {
        job.jobDetails.should.be.eql({
          engine : 'gecko'
        });
        job._id.should.be.equal('newJobId1');
        done();
      });

      couchdb.addDoc('conductor-run', {
        _id : 'newJobId1',
        status : 'new',
        jobDetails : {
          engine : 'gecko'
        }
      });
    });
  });
});
