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

  router.post('/api/auth/client', client);
  router.post('/api/auth/room-apns', roomApns);

  router.get('/api/auth/namespace', nspGet);
  router.get('/api/admin/namespace/list', nspList);
  router.get('/api/admin/namespace/clear/:key', nspClear);
  router.get('/api/admin/namespace/flush/:key', nspFlush);
  router.post('/api/admin/namespace/save', nspSave);
  router.get('/api/admin/report/online', reportOnlineAdmin);

  router.post('/api/admin/login', login);
  router.post('/api/auth/login', login);
  router.post('/hello', hello);

  router.post('/api/auth/room-leave-message', roomLeaveMessage);
  router.post('/api/admin/namespace/clear-realtime-data', clearRealtimeData);
  router.post('/api/auth/namespace/save', nspUpdate);
  router.post('/api/admin/clear-legacy-client', clearLegacyClient);
  router.get('/api/auth/namespace/current-message-stat', currentMessageStat);
}


//*******************************************************************
async function hello(ctx) {
  ctx.body = { time: new Date() };
}

async function login(ctx, next) {
  ctx.body = {};
}

async function push(ctx, next) {
  ctx.request.body.namespace = ctx.state.namespace;
  ctx.body = await pushService.push(ctx.request.body);
}

async function reportPushList(ctx, next) {
  ctx.query.namespace = ctx.state.namespace;
  ctx.body = await reportPushService.list(ctx.query);
}

async function reportPushGet(ctx, next) {
  ctx.query.namespace = ctx.state.namespace;
  ctx.query.id = ctx.params.id;
  ctx.body = await reportPushService.get(ctx.query);
}

async function reportOnline(ctx, next) {
  ctx.query.namespace = ctx.state.namespace;
  ctx.body = await reportOnlineService.online(ctx.query);
}

async function reportOnlineAdmin(ctx) {
  ctx.body = await reportOnlineService.online(ctx.query);
}

async function transfer(ctx, next) {
  ctx.request.body.namespace = ctx.state.namespace;
  await transferService.transfer(ctx.request.body);
  ctx.body = {};
}

async function client(ctx, next) {
  ctx.body = await clientService.info(ctx.request.body.id, ctx.request.body);
}

async function roomApns(ctx, next) {
  ctx.request.body.namespace = ctx.state.namespace;
  await clientService.roomApns(ctx.request.body);
  ctx.body = {};
}

async function nspGet(ctx, next) {
  let key = ctx.state.namespace;
  ctx.body = await namespaceService.get(key);
}

async function nspClear(ctx, next) {
  await namespaceService.del(ctx.params.key);
  ctx.body = {};
}

async function nspFlush(ctx, next) {
  await namespaceService.del(ctx.params.key, true);
  ctx.body = {};
}

async function nspSave(ctx, next) {
  ctx.request.body.client_ip = ctx.ips;
  await namespaceService.save(ctx.request.body);
  ctx.body = {};
}

async function nspUpdate(ctx, next) {
  ctx.request.body.key = ctx.state.namespace;
  await namespaceService.save(ctx.request.body);
  ctx.body = {};
}

async function nspList(ctx, next) {
  ctx.body = await namespaceService.list(ctx.query);
}


async function roomLeaveMessage(ctx, next) {
  ctx.request.body.namespace = ctx.state.namespace;
  await clientService.roomLeaveMessage(ctx.request.body);
  ctx.body = {};
}


async function clearRealtimeData(ctx, next) {
  await namespaceService.clearRealtimeData(ctx.request.body.namespace);
  ctx.body = {};
}

async function clearLegacyClient(ctx, next) {
  ctx.body = await namespaceService.clearLegacyClient(ctx.request.body.namespace);
}

async function currentMessageStat(ctx, next) {
  ctx.body = await reportOnlineService.currentMessageStat(ctx.state.namespace);
}
