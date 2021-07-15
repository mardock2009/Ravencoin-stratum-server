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

var bignum = require('bignum');
var crypto = require('crypto');
var SHA3 = require('sha3');
var merkle = require('./merkleTree.js');
var transactions = require('./transactions.js');
var util = require('./util.js');

var BlockTemplate = module.exports = function BlockTemplate(jobId, rpcData, reward, recipients, poolAddress){
    const EPOCH_LENGTH = 7500;
    var submits = [];
    this.rpcData = rpcData;
    this.jobId = jobId;
    this.target = bignum(rpcData.target, 16);
    this.target_hex = rpcData.target;
    this.difficulty = parseFloat((diff1 / this.target.toNumber()).toFixed(9));
    var nTime = util.packUInt32BE(rpcData.curtime).toString('hex');
    var curTime = Date.now() / 1000 | 0;
    var blockReward = this.rpcData.coinbasevalue;
    var fees = [];
    rpcData.transactions.forEach(function(value) {
        fees.push(value);
    });
    this.rewardFees = transactions.getFees(fees);
    rpcData.rewardFees = this.rewardFees;
    if (typeof this.genTx === 'undefined') {
        this.genTx = transactions.createGeneration(rpcData, blockReward, this.rewardFees, recipients, poolAddress).toString('hex');
        this.genTxHash = transactions.txHash();
    }
    this.prevHashReversed = util.reverseBuffer(new Buffer(rpcData.previousblockhash, 'hex')).toString('hex');
    this.merkleRoot = merkle.getRoot(rpcData, this.genTxHash);
    this.txCount = this.rpcData.transactions.length + 1; // add total txs and new coinbase
    this.merkleRootReversed = util.reverseBuffer(new Buffer(this.merkleRoot, 'hex')).toString('hex');
    this.serializeHeader = function() {
        var header =  new Buffer(80);
        var position = 0;
        header.write(util.packUInt32BE(this.rpcData.height).toString('hex'), position, 4, 'hex');
        header.write(this.rpcData.bits, position += 4, 4, 'hex');
        header.write(nTime, position += 4, 4, 'hex');
        header.write(this.merkleRoot, position += 4, 32, 'hex');
        header.write(this.rpcData.previousblockhash, position += 32, 32, 'hex');
        header.writeUInt32BE(this.rpcData.version, position + 32, 4);
        header = util.reverseBuffer(header);
        return header;
    };
    this.serializeBlock = function(header_hash, nonce, mixhash) {
        header = this.serializeHeader();
        var foo = new Buffer(40);
        foo.write(util.reverseBuffer(nonce).toString('hex'), 0, 8, 'hex');
        foo.write(util.reverseBuffer(mixhash).toString('hex'), 8, 32,'hex');
        buf = new Buffer.concat([
            header,
            foo,
            util.varIntBuffer(this.rpcData.transactions.length + 1),
            new Buffer(this.genTx, 'hex')
        ]);
        if (this.rpcData.transactions.length > 0) {
            this.rpcData.transactions.forEach(function (value) {
                tmpBuf = new Buffer.concat([buf, new Buffer(value.data, 'hex')]);
                buf = tmpBuf;
            });
        }
        return buf;
    };
    this.registerSubmit = function(header, nonce){
        var submission = header + nonce;
        if (submits.indexOf(submission) === -1){
            submits.push(submission);
            return true;
        }
        return false;
    };
    var powLimit = algos.kawpow.diff;
    var adjPow = (powLimit / this.difficulty);
    if ((64 - adjPow.toString(16).length) === 0) {
        var zeroPad = '';
    }
    else {
        var zeroPad = '0';
        zeroPad = zeroPad.repeat((64 - (adjPow.toString(16).length)));
    }
    var target = (zeroPad + adjPow.toString(16)).substr(0,64);
    let d = new SHA3.SHA3Hash(256);
    var seedhash_buf = new Buffer(32);
    var seedhash = seedhash_buf.toString('hex');
    this.epoch_number = Math.floor(this.rpcData.height / EPOCH_LENGTH);
    for (var i=0; i<this.epoch_number; i++) {
        d = new SHA3.SHA3Hash(256);
        d.update(seedhash_buf);
        seedhash_buf = d.digest();
        seedhash = d.digest('hex');
    }
    var header_hash = this.serializeHeader();
    header_hash = util.reverseBuffer(util.sha256d(header_hash)).toString('hex');
    var override_target = 0;
	if ((override_target != 0) && (adjPow > override_target)) {
		zeroPad = '0';
        zeroPad = zeroPad.repeat((64 - (override_target.toString(16).length)));
        target = (zeroPad + override_target.toString(16)).substr(0,64);
    }
    this.getJobParams = function(){
        if (!this.jobParams){
            this.jobParams = [
                this.jobId,
                header_hash,
                seedhash,
                target,
                true,
                this.rpcData.height,
                this.rpcData.bits
            ];
        }
        return this.jobParams;
    };
};
