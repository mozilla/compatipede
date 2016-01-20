"use strict";

let Analyzer = require('../analyzer');
let logger = require('deelogger')('redirects-analyzer');

class Redirects extends Analyzer {
  constructor() {
    super("redirects");
	}

	analyse(campaign, results, callback) {
    this.emit('started', campaign);

    let redirects = results.map((result) => {
      return result.redirects;
    });

    let diffs = {};

    redirects.forEach((redirectResult) => {
      Object.keys(redirectResult).forEach((resource) => {
        redirects.forEach((redirect) => {
          if(redirect[resource] !== redirectResult[resource]) {
            logger.info('Found not matching resource redirect', {
              resource : resource,
              redirect1 : redirect[resource],
              redirect2 : redirectResult[resource]
            });

            if(!diffs[resource]) {
              diffs[resource] = [];
            }

            [redirect[resource], redirectResult[resource]].forEach((r) => {
              if(diffs[resource].indexOf(r) === -1) {
                diffs[resource].push(r);
              }
            });
          }
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

module.exports = Redirects;
