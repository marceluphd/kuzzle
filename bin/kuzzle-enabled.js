#!/usr/bin/env node

var
  rc = require('rc'),
  params = rc('kuzzle'),
  Kuzzle = require('../lib/api');

module.exports = function () {

  var kuzzle = new Kuzzle(false);
  kuzzle.enabled(params);

};