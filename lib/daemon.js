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

var http = require('http');
var cp = require('child_process');
var events = require('events');
var async = require('async');

function DaemonInterface(daemons, logger) {
    var _this = this;
    logger = logger || function (severity, message) {
            console.log(severity + ': ' + message);
        };
    var instances = (function () {
        for (var i = 0; i < daemons.length; i++)
            daemons[i]['index'] = i;
        return daemons;
    })();
    function init() {
        isOnline(function (online) {
            if (online)
                _this.emit('online');
        });
    }
    function isOnline(callback) {
        cmd('getinfo', [], function (results) {
            var allOnline = results.every(function (result) {
                return !results.error;
            });
            callback(allOnline);
            if (!allOnline)
                _this.emit('connectionFailed', results);
        });
    }
    function performHttpRequest(instance, jsonData, callback) {
        var options = {
            hostname: (typeof(instance.host) === 'undefined' ? '127.0.0.1' : instance.host),
            port: instance.port,
            method: 'POST',
            auth: instance.user + ':' + instance.password,
            headers: {
                'Content-Length': jsonData.length
            }
        };
        var parseJson = function (res, data) {
            var dataJson;
            if (res.statusCode === 401) {
                logger('error', 'Unauthorized RPC access - invalid RPC username or password');
                return;
            }
            try {
                dataJson = JSON.parse(data);
            }
            catch (e) {
                if (data.indexOf(':-nan') !== -1) {
                    data = data.replace(/:-nan,/g, ":0");
                    parseJson(res, data);
                    return;
                }
                logger('error', 'Could not parse rpc data from daemon instance  ' + instance.index
                    + '\nRequest Data: ' + jsonData.substr(0,200)
                    + '\nResponse Data: ' + data.substr(0,200));

            }
            if (dataJson)
                callback(dataJson.error, dataJson, data);
        };
        var req = http.request(options, function (res) {
            var data = '';
            res.setEncoding('utf8');
            res.on('data', function (chunk) {
                data += chunk;
            });
            res.on('end', function () {
                parseJson(res, data);
            });
        });
        req.on('error', function (e) {
            if (e.code === 'ECONNREFUSED')
                callback({type: 'offline', message: e.message}, null);
            else
                callback({type: 'request error', message: e.message}, null);
        });
        req.end(jsonData);
    }
    function batchCmd(cmdArray, callback) {
        var requestJson = [];
        for (var i = 0; i < cmdArray.length; i++) {
            requestJson.push({
                method: cmdArray[i][0],
                params: cmdArray[i][1],
                id: Date.now() + Math.floor(Math.random() * 10) + i
            });
        }
        var serializedRequest = JSON.stringify(requestJson);
        performHttpRequest(instances[0], serializedRequest, function (error, result) {
            callback(error, result);
        });
    }
    function cmd(method, params, callback, streamResults, returnRawData) {
        var results = [];
        async.each(instances, function (instance, eachCallback) {
            var itemFinished = function (error, result, data) {
                var returnObj = {
                    error: error,
                    response: (result || {}).result,
                    instance: instance
                };
                if (returnRawData) returnObj.data = data;
                if (streamResults) callback(returnObj);
                else results.push(returnObj);
                eachCallback();
                itemFinished = function () {
                };
            };
            var requestJson = JSON.stringify({
                jsonrpc: '1.0',
                method: method,
                params: params,
                id: Date.now() + Math.floor(Math.random() * 10)
            });
            performHttpRequest(instance, requestJson, function (error, result, data) {
                itemFinished(error, result, data);
            });
        }, function () {
            if (!streamResults) {
                callback(results);
            }
        });
    }
    this.init = init;
    this.isOnline = isOnline;
    this.cmd = cmd;
    this.batchCmd = batchCmd;
}
DaemonInterface.prototype.__proto__ = events.EventEmitter.prototype;
exports.interface = DaemonInterface;