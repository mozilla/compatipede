"use strict";

let fs = require('fs');
let path = require('path');
let logger = require('deelogger')('investigators');

let autoTests = null;

if(autoTests === null) {
  let investigatorPath = path.resolve(__dirname, 'analyzers'),
    files = fs.readdirSync(investigatorPath);

  autoTests = {};

  files.forEach((file) => {
    let stat = fs.statSync(path.resolve(investigatorPath, file));

    if(stat.isDirectory()) {
      logger.info('Found investigator', {
        investigator : file
      });

      autoTests[file.toLowerCase()] = new (require(path.resolve(investigatorPath, file, 'index.js')));
    }
  });
}

module.exports = autoTests;
