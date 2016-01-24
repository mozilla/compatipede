"use strict";

let Analyzer = require('../analyzer');
let logger = require('deelogger')('redirects-analyzer');
let url = require('url');

class Redirects extends Analyzer {
  constructor() {
    super("redirects");
	}

	analyse(campaign, results, callback) {
    this.emit('started', campaign);

    //json.parse(json.stringify) is used to make copy of redirects object, don't
    //want to mess with original result object
    let uniqueLastStops = results.map(result => JSON.parse(JSON.stringify(result.redirects)))
      .map(findLastRedirect.bind(null, campaign.details.targetURI))
      .map((u) => {
        let parsed = url.parse(u);

        return parsed.protocol + '//' + parsed.host + parsed.pathname;
      })
      .filter((el, index, arr) => {
        return arr.indexOf(el) === index;
      });

    let diff = {};

    if(uniqueLastStops.length > 1) {
      diff[campaign.details.targetURI] = uniqueLastStops;
      logger.info('Redirects dont match', {
        targetURI : campaign.details.targetURI,
        lastStops : uniqueLastStops
      });
    }

    callback(null, {
      correct : uniqueLastStops.length === 1,
      diff : diff
    });

    this.emit('finished', campaign);
	}
}

function findLastRedirect(targetURI, redirects) {
  if(redirects[targetURI] === undefined) {
    return targetURI;
  }

  let newTarget = redirects[targetURI];
  delete redirects[targetURI];

  return findLastRedirect(newTarget, redirects);
}

module.exports = Redirects;
