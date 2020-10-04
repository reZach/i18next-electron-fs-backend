const merge = require("lodash.merge");

/**
 * Fast UUID generator, RFC4122 version 4 compliant.
 * @author Jeff Ward (jcward.com).
 * @license MIT license
 * @link http://stackoverflow.com/questions/105034/how-to-create-a-guid-uuid-in-javascript/21963136#21963136
 **/
export const UUID = (function () {
    let self = {};
    let lut = [];
    for (let i = 0; i < 256; i++) {
        lut[i] = (i < 16 ? '0' : '') + (i).toString(16);
    }
    self.generate = function () {
        const d0 = Math.random() * 0xffffffff | 0;
        const d1 = Math.random() * 0xffffffff | 0;
        const d2 = Math.random() * 0xffffffff | 0;
        const d3 = Math.random() * 0xffffffff | 0;
        return lut[d0 & 0xff] + lut[d0 >> 8 & 0xff] + lut[d0 >> 16 & 0xff] + lut[d0 >> 24 & 0xff] + '-' +
            lut[d1 & 0xff] + lut[d1 >> 8 & 0xff] + '-' + lut[d1 >> 16 & 0x0f | 0x40] + lut[d1 >> 24 & 0xff] + '-' +
            lut[d2 & 0x3f | 0x80] + lut[d2 >> 8 & 0xff] + '-' + lut[d2 >> 16 & 0xff] + lut[d2 >> 24 & 0xff] +
            lut[d3 & 0xff] + lut[d3 >> 8 & 0xff] + lut[d3 >> 16 & 0xff] + lut[d3 >> 24 & 0xff];
    }
    return self;
})();

// Merges objects together
export const mergeNested = function (obj, path, split, val) {
    const tokens = path.split(split);
    let temp = {};
    let temp2;
    temp[`${tokens[tokens.length - 1]}`] = val;
    for (let i = tokens.length - 2; i >= 0; i--) {
        temp2 = {};
        temp2[`${tokens[i]}`] = temp;
        temp = temp2;
    }
    return merge(obj, temp);
}

// https://stackoverflow.com/a/34890276/1837080
export const groupByArray = function(xs, key) {
    return xs.reduce(function (rv, x) {
        const v = key instanceof Function ? key(x) : x[key];
        let el = rv.find((r) => r && r.key === v);
        if (el) {
            el.values.push(x);
        } else {
            rv.push({
                key: v,
                values: [x]
            });
        }
        return rv;
    }, []);
}