"use strict";

require('sugar');

let StatsClient = require('statsd-client');
let os = require('os');
let util = require('util');
let hostname = (os.hostname() || '').replace(/\./g, '_');

let Client = new StatsClient({
  host : process.env.STATSD_HOST,
  port : parseInt(process.env.STATSD_PORT),
  prefix : util.format("Mozilla.Compatipede.%s", hostname)
});

let Stats = function(namespace) {
  this.namespace = namespace;
  this.client_ = Client.getChildClient(namespace);
};

['increment', 'decrement', 'counter', 'gauge', 'gaugeDelta', 'set', 'timing'].forEach(function(methodName) {
  if(!process.env.STATSD_HOST){
    Stats.prototype[methodName] = () => {};
    return;
  }
  Stats.prototype[methodName] = function() { this.client_[methodName].apply(this.client_, arguments); };
});

module.exports = {
  forNamespace: function(ns) {
    return new Stats(ns);
  }
};
