//提供性能
//global.Promise = require('bluebird');

// 加载配置信息
const config = require('../config');
config.port = config.port || config.socket_port || 21314;
config.ip = config.ip || config.socket_ip || '127.0.0.1';
config.log_prefix = 'socket_' + config.ip + ':' + config.port
// 启动日志服务
require('../config/log4j-config');

const http = require('http');
const log4js = require('log4js');
const HomeAdapter = require('./home-adapter');
const io = require('./socket-io');
//该模块只订阅消息然后触发操作，被动式
require('./transfer');

//启动服务器
const server = http.Server(function (req, res) {
  res.writeHead(404);
  res.end();
}).listen(config.port, config.ip, function (err) {
  console.log('socket-io serving at ' + config.ip + ':' + config.port);
});
server.setMaxListeners(20);

global._ipush_ioApp = io(server, {
  adapter: HomeAdapter,
  transports: config.transports,
  pingInterval: config.pingInterval,
  pingTimeout: config.pingTimeout
});
