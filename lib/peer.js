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

var net = require('net');
var crypto = require('crypto');
var events = require('events');
var util = require('./util.js');

var fixedLenStringBuffer = function (s, len) {
    var buff = new Buffer(len);
    buff.fill(0);
    buff.write(s);
    return buff;
};
var commandStringBuffer = function (s) {
    return fixedLenStringBuffer(s, 12);
};
var readFlowingBytes = function (stream, amount, preRead, callback) {

    var buff = preRead ? preRead : new Buffer([]);

    var readData = function (data) {
        buff = Buffer.concat([buff, data]);
        if (buff.length >= amount) {
            var returnData = buff.slice(0, amount);
            var lopped = buff.length > amount ? buff.slice(amount) : null;
            callback(returnData, lopped);
        }
        else
            stream.once('data', readData);
    };

    readData(new Buffer([]));
};

var Peer = module.exports = function (options) {
    var _this = this;
    var client;
    var magic = new Buffer(options.testnet ? options.coin.peerMagicTestnet : options.coin.peerMagic, 'hex');
    var magicInt = magic.readUInt32LE(0);
    var verack = false;
    var validConnectionConfig = true;
    var invCodes = {
        error: 0,
        tx: 1,
        block: 2
    };
    var networkServices = new Buffer('0100000000000000', 'hex'); //NODE_NETWORK services (value 1 packed as uint64)
    var emptyNetAddress = new Buffer('010000000000000000000000000000000000ffff000000000000', 'hex');
    var userAgent = util.varStringBuffer('/node-stratum/');
    var blockStartHeight = new Buffer('00000000', 'hex'); //block start_height, can be empty
    var relayTransactions = options.p2p.disableTransactions === true ? new Buffer([false]) : new Buffer([]);
    var commands = {
        version: commandStringBuffer('version'),
        inv: commandStringBuffer('inv'),
        verack: commandStringBuffer('verack'),
        addr: commandStringBuffer('addr'),
        getblocks: commandStringBuffer('getblocks')
    };
    (function init() {
        Connect();
    })();
    function Connect() {
        client = net.connect({
            host: options.p2p.host,
            port: options.p2p.port
        }, function () {
            SendVersion();
        });
        client.on('close', function () {
            if (verack) {
                _this.emit('disconnected');
                verack = false;
                Connect();
            }
            else if (validConnectionConfig)
                _this.emit('connectionRejected');

        });
        client.on('error', function (e) {
            if (e.code === 'ECONNREFUSED') {
                validConnectionConfig = false;
                _this.emit('connectionFailed');
            }
            else
                _this.emit('socketError', e);
        });
        SetupMessageParser(client);
    }
    function SetupMessageParser(client) {
        var beginReadingMessage = function (preRead) {
            readFlowingBytes(client, 24, preRead, function (header, lopped) {
                var msgMagic = header.readUInt32LE(0);
                if (msgMagic !== magicInt) {
                    _this.emit('error', 'bad magic number from peer');
                    while (header.readUInt32LE(0) !== magicInt && header.length >= 4) {
                        header = header.slice(1);
                    }
                    if (header.readUInt32LE(0) === magicInt) {
                        beginReadingMessage(header);
                    } else {
                        beginReadingMessage(new Buffer([]));
                    }
                    return;
                }
                var msgCommand = header.slice(4, 16).toString();
                var msgLength = header.readUInt32LE(16);
                var msgChecksum = header.readUInt32LE(20);
                readFlowingBytes(client, msgLength, lopped, function (payload, lopped) {
                    if (util.sha256d(payload).readUInt32LE(0) !== msgChecksum) {
                        _this.emit('error', 'bad payload - failed checksum');
                        beginReadingMessage(null);
                        return;
                    }
                    HandleMessage(msgCommand, payload);
                    beginReadingMessage(lopped);
                });
            });
        };
        beginReadingMessage(null);
    }
    function HandleInv(payload) {
        var count = payload.readUInt8(0);
        payload = payload.slice(1);
        if (count >= 0xfd) {
            count = payload.readUInt16LE(0);
            payload = payload.slice(2);
        }
        while (count--) {
            switch (payload.readUInt32LE(0)) {
                case invCodes.error:
                    break;
                case invCodes.tx:
                    var tx = payload.slice(4, 36).toString('hex');
                    break;
                case invCodes.block:
                    var block = payload.slice(4, 36).toString('hex');
                    _this.emit('blockFound', block);
                    break;
            }
            payload = payload.slice(36);
        }
    }
    function HandleMessage(command, payload) {
        _this.emit('peerMessage', {command: command, payload: payload});
        switch (command) {
            case commands.inv.toString():
                HandleInv(payload);
                break;
            case commands.verack.toString():
                if (!verack) {
                    verack = true;
                    _this.emit('connected');
                }
                break;
            default:
                break;
        }
    }
    function SendMessage(command, payload) {
        var message = Buffer.concat([
            magic,
            command,
            util.packUInt32LE(payload.length),
            util.sha256d(payload).slice(0, 4),
            payload
        ]);
        client.write(message);
        _this.emit('sentMessage', message);
    }
    function SendVersion() {
        var payload = Buffer.concat([
            util.packUInt32LE(options.protocolVersion),
            networkServices,
            util.packInt64LE(Date.now() / 1000 | 0),
            emptyNetAddress,
            emptyNetAddress,
            crypto.pseudoRandomBytes(8),
            userAgent,
            blockStartHeight,
            relayTransactions
        ]);
        SendMessage(commands.version, payload);
    }
};
Peer.prototype.__proto__ = events.EventEmitter.prototype;
