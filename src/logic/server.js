const config = require('../config');
const reportOnlineService = require('./report-online');
const reportPushService = require('./report-push');
const transferService = require('./transfer');
const pushService = require('./push');
const clientService = require('../base/client');
const namespaceService = require('../base/namespace');



module.exports = function (router) {

  router.post('/api/auth/push', push);

  router.get('/api/auth/report/push', reportPushList);
  router.get('/api/auth/report/push/:id', reportPushGet);
  router.get('/api/auth/report/online', reportOnline);

  router.post('/api/auth/transfer', transfer);

  router.post('/api/auth/client/:id', client);

  router.get('/api/auth/namespace', nspGet);
  router.get('/api/admin/namespace/del/:key', nspDel);
  router.get('/api/admin/namespace/list', nspList);
  router.post('/api/admin/namespace/save', nspSave);

}


//*******************************************************************


async function push(ctx, next) {
  ctx.request.body.namespace = ctx.state.namespace;
  ctx.body = await pushService.push(ctx.request.body);
}

async function reportPushList(ctx, next) {
  ctx.request.query.namespace = ctx.state.namespace;
  ctx.body = await reportPushService.list(ctx.request.query);
}

async function reportPushGet(ctx, next) {
  ctx.request.query.namespace = ctx.state.namespace;
  ctx.request.query.id = ctx.params.id;
  ctx.body = await reportPushService.get(ctx.request.query);
}

async function reportOnline(ctx, next) {
  ctx.request.query.namespace = ctx.state.namespace;
  ctx.body = await reportOnlineService.online(ctx.request.query);
}

async function transfer(ctx, next) {
  ctx.request.body.namespace = ctx.state.namespace;
  await transferService.transfer(ctx.request.body);
  ctx.body = {};
}

async function client(ctx, next) {
  ctx.body = await clientService.info(ctx.params.id);
}

async function nspGet(ctx, next) {
  let key = ctx.state.namespace;
  ctx.body = await namespaceService.get(key);
}

async function nspDel(ctx, next) {
  await namespaceService.del(ctx.params.key);
  ctx.body = {};
}

async function nspSave(ctx, next) {
  ctx.request.body.client_ip = ctx.ips;
  await namespaceService.save(ctx.request.body);
  ctx.body = {};
}

async function nspList(ctx, next) {
  ctx.body = await namespaceService.list();
}



