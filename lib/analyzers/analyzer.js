"use strict";

let EventEmitter = require('events').EventEmitter;
let util = require('util');
let logger = require('deelogger')('Investigator');

class Analyzer extends EventEmitter {
  constructor(name) {
    super();

    this.name = name;

    this.on("started", (campaign) => {
      logger.info(util.format("%s started job : %s", this.name, campaign._id));
    });

    this.on("finished", (campaign) => {
      logger.info(util.format("%s finished job : %s", this.name, campaign._id));
    });

    this.on("error", (campaign) => {
      logger.error(util.format("%s started job : %s", this.name, campaign._id));
    });

    this.on("warning", (campaign) => {
      logger.warning(util.format("%s started job : %s", this.name, campaign._id));
    });
  }

  analyse(){ // inforce some API !
    throw new Error("not implemented !");
  }

  mustCheck(autoTests) {
    return autoTests.indexOf(this.name) !== -1;
  }
}

module.exports = Analyzer;
