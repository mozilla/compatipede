'use strict';

let async = require('async');
let fs = require('fs');
let path = require('path');
let logger = require('../logger')('investigators');

let autoTests = module.exports = {};

function loadInvestigator (target, done){
	fs.readdir(target, (err, files) => {
		if(err)
			return done(target + " : " + err);
		let rootPath = path.join(__dirname, target);
		let jsonFile = files.find(/\.json$/);
		let settings = require(path.join(rootPath, jsonFile));
		autoTests[target] = require(settings.main);
		done();
	});
}

async.each(["redirects"], loadInvestigator, (err) => {
	if(err)
		logger.warn("error loading investgator " + err);
	logger.info("Investigators loaded");
});