"use strict";

let fs = require('fs'),
  async = require('async'),
  path = require('path'),
  should = require('should'),
  imagemagick = require('imagemagick-native'),
  ImageDiff = require('../../../lib/investigators').ImageDiff;

describe('imageDiff', () => {
  let image1, image2, image3, image4, imageDiff;

  beforeEach(() => {
    imageDiff = new ImageDiff();

    image1 = fs.readFileSync(path.resolve(__dirname, '../../fixtures/1.jpeg'));
    image2 = fs.readFileSync(path.resolve(__dirname, '../../fixtures/2.jpeg'));
    image3 = fs.readFileSync(path.resolve(__dirname, '../../fixtures/3.jpeg'));
    image4 = fs.readFileSync(path.resolve(__dirname, '../../fixtures/4.jpeg'));
  });

  describe('_preprocess', () => {
    it('should resize all images to same size', (done) => {
      imageDiff._preprocess([image1, image2, image3], (error, images) => {
        should.not.exist(error);

        async.mapSeries(images, (image, cb) => {

          imagemagick.identify({
            srcData : image
          }, (error, info) => {
            should.not.exist(error);
            info.width.should.be.equal(640);
            info.height.should.be.equal(680);
            cb();
          });
        }, done);
      });
    });
  });

  describe('_computeScores', () => {
    it('should compute score for all images', (done) => {
      imageDiff._preprocess([image1, image2, image3, image4], (error, results) => {
        should.not.exist(error);

        imageDiff._computeScores(results, (error, result) => {
          should.not.exist(error);
          console.log(result);
          done();
        });
      });
    });
  });
});
