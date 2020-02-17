"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.mergeNested = exports.UUID = void 0;

var merge = require("lodash.merge");
/**
 * Fast UUID generator, RFC4122 version 4 compliant.
 * @author Jeff Ward (jcward.com).
 * @license MIT license
 * @link http://stackoverflow.com/questions/105034/how-to-create-a-guid-uuid-in-javascript/21963136#21963136
 **/


var UUID = function () {
  var self = {};
  var lut = [];

  for (var i = 0; i < 256; i++) {
    lut[i] = (i < 16 ? '0' : '') + i.toString(16);
  }

  self.generate = function () {
    var d0 = Math.random() * 0xffffffff | 0;
    var d1 = Math.random() * 0xffffffff | 0;
    var d2 = Math.random() * 0xffffffff | 0;
    var d3 = Math.random() * 0xffffffff | 0;
    return lut[d0 & 0xff] + lut[d0 >> 8 & 0xff] + lut[d0 >> 16 & 0xff] + lut[d0 >> 24 & 0xff] + '-' + lut[d1 & 0xff] + lut[d1 >> 8 & 0xff] + '-' + lut[d1 >> 16 & 0x0f | 0x40] + lut[d1 >> 24 & 0xff] + '-' + lut[d2 & 0x3f | 0x80] + lut[d2 >> 8 & 0xff] + '-' + lut[d2 >> 16 & 0xff] + lut[d2 >> 24 & 0xff] + lut[d3 & 0xff] + lut[d3 >> 8 & 0xff] + lut[d3 >> 16 & 0xff] + lut[d3 >> 24 & 0xff];
  };

  return self;
}();

exports.UUID = UUID;

var mergeNested = function mergeNested(obj, path, split, val) {
  var tokens = path.split(split);
  var temp = {};
  var temp2;
  temp["".concat(tokens[tokens.length - 1])] = val;

  for (var i = tokens.length - 2; i >= 0; i--) {
    temp2 = {};
    temp2["".concat(tokens[i])] = temp;
    temp = temp2;
  }

  return merge(obj, temp);
};

exports.mergeNested = mergeNested;