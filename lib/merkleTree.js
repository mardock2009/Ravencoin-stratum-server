/*
Copyright 2021 Cyber Pool (cyberpool.org)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the "Software"), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense,
and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial
portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var Promise = require('promise');
var merklebitcoin = Promise.denodeify(require('merkle-bitcoin'));
var util = require('./util.js');

function calcRoot(hashes) {
    var result = merklebitcoin(hashes);
    return Object.values(result)[2].root;
}
exports.getRoot = function (rpcData, generateTxRaw) {
    hashes = [util.reverseBuffer(new Buffer(generateTxRaw, 'hex')).toString('hex')];
    rpcData.transactions.forEach(function (value) {
         if (value.txid !== undefined) {
             hashes.push(value.txid);
         } else {
             hashes.push(value.hash);
         }
     });
    if (hashes.length === 1) {
        return hashes[0];
    }
    var result = calcRoot(hashes);
    return result;
};