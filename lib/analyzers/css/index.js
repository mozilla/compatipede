"use strict";

let Analyzer = require('../analyzer');
let logger = require('deelogger')('css-analyzer');

class CSS extends Analyzer {
  constructor() {
    super("css");
  }

  analyse(campaign, results, callback) {
    this.emit('started', campaign);

    let diff = results.reduce((obj, r1, i) => {
      results.forEach((r2, j) => {
        if(i <= j) {
          return;
        }

        let changes1 = getProblemChanges(r1, r2),
          changes2 = getProblemChanges(r2, r1);

        if(Object.keys(changes1).length > 0 || Object.keys(changes2).length > 0) {
          obj[r1.runNumber + '-' + r2.runNumber] = {
            newProblems : r1.runNumber > r2.runNumber ? changes1 : changes2,
            fixedProblems : r1.runNumber > r2.runNumber ? changes2 : changes1
          };
        }

        logger.info('Diff for versions', {
          diff     : obj[r1.runNumber + '-' + r2.runNumber],
          version1 : r1.runNumber,
          version2 : r2.runNumber
        });

        return obj;
      });

      return obj;
    }, {});

    let latestResult = results.reduce((p, r) => {
      if(p.runNumber > r.runNumber) {
        return p;
      }

      return r;
    }, results[0]);

    callback(null, {
      correct : noProblems(latestResult),
      diff : diff
    });

    this.emit('finished', campaign);
  }
}

function getProblemChanges(newResult, oldResult) {
  let p1 = getBySelector(newResult),
    p2 = getBySelector(oldResult);


  return Object.keys(p1).reduce((obj, key) => {
    let r = (p1[key].problems || []).filter((p1) => {
      return !((p2[key] || {}).problems || []).some((p2) => {
        return p1.property === p2.property && p1.value === p2.value;
      });
    });

    if(r.length > 0) {
      obj[key] = r;
    }

    return obj;
  }, {});
}

function noProblems(r) {
  return ((r.pluginResults || {})['css-analyzer'] || []).every((el) => {
    return (el.problems || []).length === 0;
  }, 0);
}

function getBySelector(r) {
  return ((r.pluginResults || {})['css-analyzer'] || []).reduce((obj, el) => {
    obj[el.selector] = {
      problems  : el.problems || [],
      runNumber : r.runNumber
    };
    return obj;
  }, {});
}


module.exports = CSS;
