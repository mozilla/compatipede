"use strict";

let Analyzer = require('../analyzer');
let logger = require('deelogger')('redirects-analyzer');

class Redirects extends Analyzer {
  constructor() {
    super("redirects");
	}

	analyse(campaign, results, callback) {
    this.emit('started', campaign);

    let redirects = results.map(result => result.redirects),
      diffs = {};

    //redirects are an object resource : redirect
    redirects.forEach((redirectResult) => {
      Object.keys(redirectResult).forEach((resource) => {
        redirects.forEach((redirect) => {
          compareResourceRedirects(resource, redirectResult[resource], redirect[resource], diffs);
        });
      });
    });

    callback(null, {
      correct : Object.keys(diffs).length === 0,
      diff    : diffs
    });

    this.emit('finished', campaign);
	}
}

function compareResourceRedirects(resource, redirect1, redirect2, diffs) {
  if(redirect1 !== redirect2) {
    logger.info('Found not matching resource redirect', {
      resource  : resource,
      redirect1 : redirect1,
      redirect2 : redirect2
    });

    if(!diffs[resource]) {
      diffs[resource] = [];
    }

    [redirect1, redirect2].forEach((r) => {
      if(diffs[resource].indexOf(r) === -1) {
        diffs[resource].push(r);
      }
    });
  }
}

module.exports = Redirects;
