const Redis = require('ioredis');
const logger = require('log4js').getLogger('redis-factory');

const config = require('../config');

let _connection, _connectionList = [];
exports.getInstance = function (exists) {
  if (exists) {
    if (!_connection) {
      _connection = create();
    }
    return _connection;
  }

  return create();
}

function create() {
  let connection;

  if (Array.isArray(config.redis_address)) {
    var addressArr = config.redis_address.map(function (item) {
      return { host: item.split(':')[0], port: item.split(':')[1] };
    });

    var options = {
      keyPrefix: config.redis_prefix
    };

    connection = new Redis.Cluster(addressArr, options);
  } else {
    var options = {
      host: config.redis_address.split(':')[0],
      port: config.redis_address.split(':')[1],
      keyPrefix: config.redis_prefix
    };

    connection = new Redis(options);
  }

  connection.on('error', function (e) {
    logger.error('redis connection fail ' + e);
  });
  connection.on('connect', function () {
    logger.warn('redis connection ready');
  });
  _connectionList.push(connection);
  return connection;
}

