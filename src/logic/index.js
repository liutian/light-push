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
//跨域请求处理
app.use(cors);
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

async function cors(ctx, next) {

  await next();

  //只需要检查options类型的请求，因为系统所有接口的Content-Type都为application/json，所有浏览器肯定会先发送预检请求
  ctx.set('Access-Control-Allow-Origin', ctx.get('Origin'));
  ctx.set('Access-Control-Allow-Credentials', true);
  if (ctx.method == 'OPTIONS') {
    ctx.set('Access-Control-Allow-Methods', 'GET, POST');
    ctx.set('Access-Control-Allow-Headers', 'Content-Type, AdminKey, Nonce, Timestamp, Signature, AppKey, Token, AppId, RefKey, Authorization');
    ctx.set('Access-Control-Max-Age', 2592000);//有效期30天
  }
}
