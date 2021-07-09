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

var events = require('events');

function RingBuffer(maxSize) {
    var data = [];
    var cursor = 0;
    var isFull = false;
    this.append = function (x) {
        if (isFull) {
            data[cursor] = x;
            cursor = (cursor + 1) % maxSize;
        }
        else {
            data.push(x);
            cursor++;
            if (data.length === maxSize) {
                cursor = 0;
                isFull = true;
            }
        }
    };
    this.avg = function () {
        var sum = data.reduce(function (a, b) {
            return a + b
        });
        return sum / (isFull ? maxSize : cursor);
    };
    this.size = function () {
        return isFull ? maxSize : cursor;
    };
    this.clear = function () {
        data = [];
        cursor = 0;
        isFull = false;
    };
}
function toFixed(num, len) {
    return parseFloat(num.toFixed(len));
}
var varDiff = module.exports = function varDiff(port, varDiffOptions) {
    var _this = this;
    var bufferSize, tMin, tMax;
    var variance = varDiffOptions.targetTime * (varDiffOptions.variancePercent / 100);
    bufferSize = varDiffOptions.retargetTime / varDiffOptions.targetTime * 4;
    tMin = varDiffOptions.targetTime - variance;
    tMax = varDiffOptions.targetTime + variance;
    this.manageClient = function (client) {
        var stratumPort = client.socket.localPort;
        if (stratumPort != port) {
            console.error("Handling a client which is not of this vardiff?");
        }
        var options = varDiffOptions;
        var lastTs;
        var lastRtc;
        var timeBuffer;
        client.on('submit', function () {
            var ts = (Date.now() / 1000) | 0;
            if (!lastRtc) {
                lastRtc = ts - options.retargetTime / 2;
                lastTs = ts;
                timeBuffer = new RingBuffer(bufferSize);
                return;
            }
            var sinceLast = ts - lastTs;
            timeBuffer.append(sinceLast);
            lastTs = ts;
            if ((ts - lastRtc) < options.retargetTime && timeBuffer.size() > 0)
                return;
            lastRtc = ts;
            var avg = timeBuffer.avg();
            var ddiff = options.targetTime / avg;
            if (avg > tMax && client.difficulty > options.minDiff) {
                if (options.x2mode) {
                    ddiff = 0.5;
                }
                if (ddiff * client.difficulty < options.minDiff) {
                    ddiff = options.minDiff / client.difficulty;
                }
            } else if (avg < tMin) {
                if (options.x2mode) {
                    ddiff = 2;
                }
                var diffMax = options.maxDiff;
                if (ddiff * client.difficulty > diffMax) {
                    ddiff = diffMax / client.difficulty;
                }
            }
            else {
                return;
            }
            var newDiff = toFixed(client.difficulty * ddiff, 8);
            timeBuffer.clear();
            _this.emit('newDifficulty', client, newDiff);
        });
    };
};
varDiff.prototype.__proto__ = events.EventEmitter.prototype;