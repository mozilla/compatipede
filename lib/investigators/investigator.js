"use strict";

let EventEmitter = require('events').EventEmitter;
let util = require('util');
let logger = require('deelogger')('Investigator');

class Investigator extends EventEmitter {
  constructor(name) {
    super();
    let self = this;
    self.settings = require(util.format("%s/%s", name, "package.json"));
    self.name = self.settings.name;
    self.verdict = {};

    self.on("started", (job) => {
      logger.info(util.format("%s started job : %s", self.name, job.description));
    });

    self.on("finished", (job) => {
      logger.info(util.format("%s finished job : %s", self.name, job.description));
    });

    self.on("error", (job) => {
      logger.error(util.format("%s started job : %s", self.name, job.description));
    });

    self.on("warning", (job) => {
      logger.warning(util.format("%s started job : %s", self.name, job.description));
    });

    /*TODO : probably a good idea to setup a watchdog here to kill the autotest if it runs for far too long */
  }

  getVerdict() {
    return this.verdict;
  }

  investigate(){ // inforce some API !
    throw new Error("not implemented !");
  }
}

module.exports = Investigator;
