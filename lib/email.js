"use strict";

let logger = require('deelogger')('Email'),
  fs = require('fs'),
  handlebars = require('handlebars'),
  path = require('path'),
  nodemailer = require('nodemailer'),
  resultTemplate = handlebars.compile(fs.readFileSync(path.resolve(__dirname, '../emails/results.handlebars')).toString());

class Email {
  constructor(smtpString, from, emails) {
    this._transport = nodemailer.createTransport(smtpString);
    this._from = from;

    this._emails = emails;
  }

  sendRunData(data, callback) {
    let failedCount = Object.keys(data).reduce((cnt, e) => {
        return cnt + data[e].error ? 1 : 0;
      }, 0),
      successfulCount = Object.keys(data).reduce((cnt, e) => {
        return cnt + data[e].error ? 0 : 1;
      }, 0),
      failed = Object.keys(data).reduce((o, e) => {
        if(data[e].error) {
          o[e] = data[e];
        }

        return o;
      }, {}),
      autoTests = Object.keys(data).reduce((o, e) => {
        if(data[e].autoTestResults) {
          o[e] = data[e];
        }

        return o;
      }, {}),
      correct = Object.keys(data).reduce((o, e) => {
        if(data[e].step === 'done') {
          o[e] = data[e];
        }

        return o;
      }, {});

    let date = (new Date()).toString();

    let html = resultTemplate({
      succesfullCount : successfulCount,
      failedCount     : failedCount,
      failed          : failed,
      date            : date,
      autoTests       : autoTests,
      correct         : correct
    });

    this._emails.getActiveRecipients((error, emails) => {
      if(error) {
        logger.error('Failed to fetch emails', error);
        callback();
      }
      if(emails.length === 0) {
        logger.debug('No email recipients set');
        return callback();
      }

      let to = emails.join(',');

      this._transport.sendMail({
        to : to,
        from : this._from,
        subject : 'Compatipede results[' + date + ']',
        html : html
      }, (error, info) => {
        if(error) {
          logger.error('Failed to send email', error);
        } else {
          logger.info('Email sent', {
            email : to,
            info : info
          });
        }

        callback();
      });
    });
  }
}

module.exports = Email;
