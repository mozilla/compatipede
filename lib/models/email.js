"use strict";

let Model = require('./model');

class Email extends Model{
  constructor(couchDBSettings, dbName) {
    super(couchDBSettings, dbName);
    this._lastSequence = null;
  }

  /* globals emit: true */
  _ensureCouchDesignsExist(callback) {
    this._db.save('_design/emails', {
      views: {
        active: { //for fetching jobs with status new
          map : function(doc) {
            if(doc.active) {
              emit(doc._id, doc);
            }
          }
        },
      }
    }, callback);
  }

  getActiveRecipients(callback) {
    this._db.view('emails/active', {include_docs: true, reduce: false}, (error, results) => {
      callback(error, (results || []).map(r => r._id));
    });
  }
}

module.exports = Email;
