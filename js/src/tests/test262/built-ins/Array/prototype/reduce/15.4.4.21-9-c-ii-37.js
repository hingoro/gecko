// Copyright (c) 2012 Ecma International.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-array.prototype.reduce
es5id: 15.4.4.21-9-c-ii-37
description: >
    Array.prototype.reduce - the global object can be used as
    accumulator
---*/

var global = this;
        var accessed = false;
        function callbackfn(prevVal, curVal, idx, obj) {
            accessed = true;
            return prevVal === global;
        }

        var obj = { 0: 11, length: 1 };

assert.sameValue(Array.prototype.reduce.call(obj, callbackfn, this), true, 'Array.prototype.reduce.call(obj, callbackfn, this)');
assert(accessed, 'accessed !== true');

reportCompare(0, 0);
