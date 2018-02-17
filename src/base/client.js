const log4js = require('log4js');

const config = require('../config');
const apiError = require('../util/api-error');
const redisFactory = require('../util/redis-factory');
const _util = require('../util/util');

const logger = log4js.getLogger('client');
const _redis = redisFactory.getInstance(true);

const redis_t_r_c_s = config.redis_total_room_client_set_prefix;//保存单个命名空间单个房间下的客户端集合
const redis_c_h = config.redis_client_hash_prefix;
const redis_u_c_g = config.redis_user_client_geo_prefix;

//这里所说的客户端是通过 namespace + userid + platform + uuid 作为唯一标示的,而非只通过uuid为标示
exports.apns = apnsFn;
exports.info = infoFn;
exports.roomApns = roomApnsFn;
exports.roomLeaveMessage = roomLeaveMessageFn;
exports.discover = discoverFn;


async function apnsFn(data) {
  data = _util.pick(data, 'id add remove');

  let no_send_apns = await _redis.hget(redis_c_h + data.id, 'no_send_apns');
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

  await _redis.hset(redis_c_h + data.id, 'no_send_apns', no_send_apns.join(','));
}

async function infoFn(id, data) {
  if (!id) apiError.throw('param id can not find ');

  if (data) {
    data = _util.pick(data, 'device_token mobile system leaveMessage userId nspName longitude latitude');
  }

  if (!data || Object.keys(data).length <= 0) {
    return await _redis.hgetall(redis_c_h + id);
  } else {
    data.update_date = Date.now();
    await _redis.hmset(redis_c_h + id, data);
    if (data.longitude && data.latitude && data.userId && data.nspName) {
      await _redis.geoadd(redis_u_c_g + data.nspName, data.longitude, data.latitude, data.userId + '|' + id);
    }
  }
}

async function roomApnsFn(data) {
  data = _util.pick(data, 'room add remove namespace');
  if (!data.room) apiError.throw('can not find room');
  if (!data.namespace) apiError.throw('can not find namespace');
  let nspAndRoom = data.namespace + '_' + data.room;

  let clientList = await _redis.smembers(redis_t_r_c_s + '{' + nspAndRoom + '}');

  for (let i = 0; i < clientList.length; i++) {
    let clientId = clientList[i];

    let no_send_apns = await _redis.hget(redis_c_h + clientId, 'no_send_apns');
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

    await _redis.hset(redis_c_h + clientId, 'no_send_apns', no_send_apns.join(','));
  }

}


async function roomLeaveMessageFn(data) {
  data = _util.pick(data, 'room leaveMessage namespace');
  if (!data.room) apiError.throw('can not find room');
  if (!data.namespace) apiError.throw('can not find namespace');
  let nspAndRoom = data.namespace + '_' + data.room;

  let clientList = await _redis.smembers(redis_t_r_c_s + '{' + nspAndRoom + '}');

  for (let i = 0; i < clientList.length; i++) {
    let clientId = clientList[i];

    await _redis.hmset(redis_c_h + clientId, {
      leaveMessage: data.leaveMessage,
      update_date: Date.now()
    });
  }
}

async function discoverFn(data) {
  data = _util.pick(data, 'id userId nspName radius count');
  if (!data.id) apiError.throw('param id can not find ');

  let longitude, latitude;

  if (data.longitude && data.latitude) {
    longitude = data.longitude;
    latitude = data.latitude;
  } else {
    let posArr = await _redis.geopos(redis_u_c_g + data.nspName, data.userId + '|' + data.id);
    if (Array.isArray(posArr)) {
      [longitude, latitude] = posArr[0];
    } else {
      return [];
    }
  }

  let posArr = await _redis.georadius(redis_u_c_g + data.nspName, longitude, latitude, data.radius || 10, 'km', 'WITHDIST', 'ASC', 'count', data.count || 100);

  let userPosMap = new Map();
  for (let item of posArr) {
    let [userId, id] = item[0].split('|');
    if (!userPosMap.has(userId) && data.id != id) {
      let userInfo = await _redis.hgetall(redis_c_h + id);
      userPosMap.set(userId, Object.assign({}, userInfo, {
        id: id,
        userId: userId,
        distance: item[1]
      }));
    }
  }

  return [...userPosMap.values()];
}