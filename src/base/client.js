const log4js = require('log4js');

const config = require('../config');
const apiError = require('../util/api-error');
const redisFactory = require('../util/redis-factory');
const _util = require('../util/util');

const logger = log4js.getLogger('client');
const _redis = redisFactory.getInstance(true);

const TOTAL_ROOM_CLIENT_SET_PREFIX = config.redis_total_room_client_set_prefix;//保存单个命名空间单个房间下的客户端集合

//这里所说的客户端是通过 namespace + userid + platform + uuid 作为唯一标示的,而非只通过uuid为标示
exports.apns = apnsFn;
exports.info = infoFn;
exports.roomApns = roomApnsFn;
exports.roomLeaveMessage = roomLeaveMessageFn;


async function apnsFn(data) {
  data = _util.pick(data, 'id add remove');

  let no_send_apns = await _redis.hget(config.redis_client_hash_prefix + data.id, 'no_send_apns');
  if (typeof no_send_apns == 'string') {
    no_send_apns = no_send_apns.split(',');
  }
  if (!Array.isArray(no_send_apns)) {
    no_send_apns = [];
  }

  if (!Array.isArray(data.add) && !Array.isArray(data.remove)) {
    return no_send_apns;
  }

  if (Array.isArray(data.add)) {
    data.add.forEach(function (item) {
      if (no_send_apns.indexOf(item) == -1) {
        no_send_apns.push(item);
      }
    })
  }

  if (Array.isArray(data.remove)) {
    data.remove.forEach(function (item) {
      let index = no_send_apns.indexOf(item);
      if (index != -1) {
        no_send_apns.splice(index, 1);
      }
    })
  }

  await _redis.hset(config.redis_client_hash_prefix + data.id, 'no_send_apns', no_send_apns.join(','));
}

async function infoFn(id, data) {
  if (!id) apiError.throw('can not find id');

  if (data) {
    data = _util.pick(data, 'device_token mobile system leaveMessage');
  }

  if (!data || Object.keys(data).length <= 0) {
    return await _redis.hgetall(config.redis_client_hash_prefix + id);
  } else {
    data.update_date = Date.now();
    await _redis.hmset(config.redis_client_hash_prefix + id, data);
  }
}

async function roomApnsFn(data) {
  data = _util.pick(data, 'room add remove namespace');
  if (!data.room) apiError.throw('can not find room');
  if (!data.namespace) apiError.throw('can not find namespace');
  let nspAndRoom = data.namespace + '_' + data.room;

  let clientList = await _redis.smembers(TOTAL_ROOM_CLIENT_SET_PREFIX + '{' + nspAndRoom + '}');

  for (let i = 0; i < clientList.length; i++) {
    let clientId = clientList[i];

    let no_send_apns = await _redis.hget(config.redis_client_hash_prefix + clientId, 'no_send_apns');
    if (typeof no_send_apns == 'string') {
      no_send_apns = no_send_apns.split(',');
    }
    if (!Array.isArray(no_send_apns)) {
      no_send_apns = [];
    }

    if (Array.isArray(data.add)) {
      data.add.forEach(function (item) {
        if (no_send_apns.indexOf(item) == -1) {
          no_send_apns.push(item);
        }
      })
    }

    if (Array.isArray(data.remove)) {
      data.remove.forEach(function (item) {
        let index = no_send_apns.indexOf(item);
        if (index != -1) {
          no_send_apns.splice(index, 1);
        }
      })
    }

    await _redis.hset(config.redis_client_hash_prefix + clientId, 'no_send_apns', no_send_apns.join(','));
  }

}


async function roomLeaveMessageFn(data) {
  data = _util.pick(data, 'room leaveMessage namespace');
  if (!data.room) apiError.throw('can not find room');
  if (!data.namespace) apiError.throw('can not find namespace');
  let nspAndRoom = data.namespace + '_' + data.room;

  let clientList = await _redis.smembers(TOTAL_ROOM_CLIENT_SET_PREFIX + '{' + nspAndRoom + '}');

  for (let i = 0; i < clientList.length; i++) {
    let clientId = clientList[i];

    await _redis.hmset(config.redis_client_hash_prefix + clientId, {
      leaveMessage: data.leaveMessage,
      update_date: Date.now()
    });
  }
}