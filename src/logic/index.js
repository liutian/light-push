//提供性能
//global.Promise = require('bluebird');

//加载配置信息
const config = require('../config');
config.port = config.port || config.logic_port || 56789;
config.ip = config.ip || config.logic_ip || '127.0.0.1';
config.log_prefix = 'logic_' + config.ip + ':' + config.port;
//启动日志服务
require('../config/log4j-config');

const Koa = require('koa');
const koaBody = require('koa-body')();
const router = require('koa-router')();
const logger = require('log4js').getLogger('api-index');
const server = require('./server');
const auth = require('./auth');
const apiError = require('../util/api-error');

const app = new Koa();

//替换koa默认的异常处理
app.on('error', onerror);
//记录响应时间
app.use(responseTime);
//接口授权
router.all('/api/auth/*', corsFilter, auth.normal, koaBody);
router.all('/api/admin/*', corsFilter, auth.admin, koaBody);
server(router);
app.use(router.routes());

//启动服务
app.listen(config.port, config.ip, function (err) {
  console.log('logic serving at ' + config.ip + ':' + config.port);
});







//*******************************************************************

async function responseTime(ctx, next) {
  let start = Date.now();
  await next();
  ctx.set('X-Response-Time', (Date.now() - start) + 'ms');
}


function onerror(err) {
  if (404 == err.status) return;

  if (typeof err.message == 'string' && !err.expose) {
    err.message = err.message.replace(/"/gmi, '\\"');
  }

  //如果有错误码追加错误码到错误信息中
  if (err.code) {
    err.message = '{"code": ' + err.code + ',"msg": "' + (apiError.codeMap['code_' + err.code] || err.message) + '"}';
  }

  //如果服务器报错打印错误信息到日志中
  if (!err.status || err.status == 500) {
    logger.error(err.stack || err.toString());
    err.expose = true;
    err.message = '{\"code\": 9999,\"msg\": \"' + (err.message || 'server error\"') + '"}';
  }
}

async function corsFilter(ctx, next) {
  if (ctx.method == 'OPTIONS') {
    ctx.body = '';
  } else {
    await next();
  }
}
