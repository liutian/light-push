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
      keyPrefix: config.redis_prefix,
      password: config.redis_password,
      db: config.redis_db
    };

    connection = new Redis.Cluster(addressArr, options);
  } else {
    var options = {
      keyPrefix: config.redis_prefix,
      db: config.redis_db
    };

    if (Array.isArray(config.sentinels)) {
      const addressArr = config.sentinels.map(function (item) {
        return { host: item.split(':')[0], port: item.split(':')[1] };
      });
      options.sentinels = addressArr;
      options.name = config.sentinels_name;
    } else {
      options = Object.assign(options, {
        host: config.redis_address.split(':')[0],
        port: config.redis_address.split(':')[1],
        password: config.redis_password,
      })
    }

    connection = new Redis(options);
  }

  connection.on('error', function (e) {
    logger.error('redis connection fail ' + e);
  });
  connection.on('connect', function () {
    logger.warn('redis connection ready');
  });
  connection.on('close', function () {
    logger.warn('redis connection close');
  });
  connection.on('reconnecting', function () {
    logger.warn('redis reconnecting');
  });
  _connectionList.push(connection);
  return connection;
}

