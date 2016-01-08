"use strict";

let Investigator = require('../investigator'),
  logger = require('deelogger')('redirects-imageDiff'),
  imagemagick = require('imagemagick-native'),
  opencv = require('opencv'),
  async = require('async'),
  Buffer = require('buffer').Buffer,
  MSSSIM = require('image-ms-ssim');

class Redirects extends Investigator {
  constructor() {
    super('imageDiff');
  }

  investigate(campaign, results, callback) {
    this.emit('started', campaign);

    // async.mapSeries(results, (result, cb) => {
    //   if(!result.screenshot) {
    //     return cb();
    //   }

    //   imagemagick.identify({
    //     srcData : new Buffer(result.screenshot)
    //   });
    // });

    // let redirects = results.map((result) => {
    //   return result.redirects;
    // });

    // let diffs = {};

    // callback(null, {
    //   correct : Object.keys(diffs).length === 0,
    //   diff    : diffs
    // });

    this.emit('finished', campaign);
  }

  //resize all images to smallest common size
  _preprocess(images, callback) {
    async.mapSeries(images, (image, cb) => {
      imagemagick.identify({
        srcData : image
      }, cb);
    }, (error, results) => {
      let minWidth, minHeight;

      if(error) {
        return callback(error);
      }

      results.forEach((i) => {
        if(!minWidth) {
          minWidth = i.width;
        }

        if(!minHeight) {
          minHeight = i.height;
        }

        if(minHeight > i.height) {
          minHeight = i.height;
        }

        if(minWidth > i.width) {
          minWidth = i.width;
        }
      });

      async.mapSeries(images, (i, cb) => {
        imagemagick.convert({
          srcData : i,
          width : minWidth,
          height : minHeight,
          resizeStyle : 'aspectfill'
        }, (error, img) => {
          if(error) {
            return cb(error);
          }

          cb(null, new Buffer(img));
        });
      }, callback);
    });
  }

  _computeScores(images, callback) {
    let i = 0;

    async.mapSeries(images, (img1, cb) => {
      i += 1;
      let l = 0;

      async.mapSeries(images, (img2, cb) => {
        l += 1;

        if(l <= i) {
          return cb();
        }
console.log('will compare')
        MSSSIM.compare({
          channels : 4,
          data : img1,
          width : 640,
          height : 680
        }, {
          channels : 4,
          data : img2,
          width : 640,
          height : 680
        }, () => {
          console.log(arguments)
        });
      }, (error, results) => {
        if(error) {
          return cb(error);
        }

        cb(null, results.filter((r) => {
          return r !== undefined;
        }));
      });
    }, (error, results) => {
      if(error) {
        return callback(error);
      }

      let a = [];

      results.forEach((r) => {
        a = a.concat(r);
      });

      callback(null, a);

      // async.mapSeries(opencvImages, (img, cb) => {
      //   let l = 0;
      //   async.mapSeries(opencvImages, (img2, cb2) => {
      //     l += 1;

      //     if(i === l) {
      //       return cb2();
      //     }

      //     console.log(img, img2);

      //     opencv.ImageSimilarity(img, img2, cb2);
      //   }, (err, results) => {
      //     console.log(results);
      //     cb(err, results.filter((r) => {
      //       return r !== undefined;
      //     }));
      //   });
      // }, (err, results) => {
      //   let a = [];

      //   results.forEach((r) => {
      //     a = a.concat(r);
      //   });

      //   callback(null, a);
      // });
    });
  }
}

module.exports = Redirects;
