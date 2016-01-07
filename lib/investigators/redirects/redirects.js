"use strict";

let Investigator = require('../investigator');
let logger = require('../../logger')('redirects-investigator');

class Redirects extends Investigator {
  constructor() {
    super("redirects");
	}

	investigate(/* the necessaries */){
		this.emit("started");
		//...
	}
}

module.exports = Redirects;
