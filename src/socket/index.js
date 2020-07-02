//提高异步执行的性能
//global.Promise = require('bluebird');

const os = require('os');
const engine = require('engine.io');
engine.Server.errorMonitor[1] = `Session ID unknown [hostname:${os.hostname()}]`;

// 加载配置信息
const config = require('../config');
config.port = config.port || config.socket_port || 21314;
config.ip = config.ip || config.socket_ip || '127.0.0.1';

if (config.log_prefix === '$ip_port$') {
  config.log_prefix = 'socket_' + config.ip + ':' + config.port;
}
// 启动日志服务
require('../config/log4j-config');

const http = require('http');
const log4js = require('log4js');
const HomeAdapter = require('./home-adapter');
const io = require('./socket-io');
const _server = require('./server');
const handshake = require('./handshake');
//该模块只订阅消息然后触发操作，被动式
require('./transfer');

//启动服务器
const server = http.Server(function (req, res) {
  if (req.url === '/health') {
    res.end('hello');
    return;
  }

  res.setHeader('from', 'light-push');
  res.writeHead(404);
  res.end();
}).listen(config.port, config.ip, function (err) {
  console.warn('socket-io serving at ' + config.ip + ':' + config.port);
});
server.setMaxListeners(20);

global._ipush_ioApp = io(server, {
  adapter: HomeAdapter,
  transports: config.transports,
  pingInterval: config.pingInterval,
  pingTimeout: config.pingTimeout
});

// 通过动态命名空间方式创建nsp
/** 注意禁止使用parentNsp.emit 方法，会有问题 */
const parentNsp = global._ipush_ioApp.of(function (name, query, next) {
  next(null, true);
});
const parentNspCreateChild = parentNsp.createChild.bind(parentNsp);
parentNsp.createChild = function (name) {
  const nsp = parentNspCreateChild(name);
  nsp.use(handshake);
  _server.addNSRegister(name);
  return nsp;
}


