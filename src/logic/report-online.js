const config = require('../config');
const redisFactory = require('../util/redis-factory');
const _util = require('../util/util');

const CLIENT_SET_PREFIX = config.redis_client_set_prefix;//保存单个命名空间下的客户端集合
const USER_SET_PREFIX = config.redis_user_set_prefix;//保存单个命名空间下的用户集合
const ROOM_SET_PREFIX = config.redis_room_set_prefix;//保存单个命名空间下的房间集合
const ROOM_USER_SET_PREFIX = config.redis_room_user_set_prefix;//保存单个命名空间单个房间下的用户集合
const ROOM_CLIENT_SET_PREFIX = config.redis_room_client_set_prefix;//保存单个命名空间单个房间下的客户端集合

const _redis = redisFactory.getInstance(true);

exports.online = onlineFn;


//*******************************************************************

/*
 统计在线信息
 */
async function onlineFn(data) {
  //解析参数
  data = _util.pick(data || {}, 'namespace room detail');

  if (!data.namespace) {
    let roomCount = userCount = clientCount = 0;
    let nsTotal = await _redis.zcount(config.redis_namespace_key_z, '-inf', '+inf');
    let list = await _redis.zrange(config.redis_namespace_key_z, 0, nsTotal);
    for (let i = 0; i < list.length; i++) {
      let nsp = await namespaceOnline(list[i]);
      roomCount += nsp.roomCount;
      userCount += nsp.userCount;
      clientCount += nsp.clientCount;
    }

    return { userCount, roomCount, clientCount };
  } else if (Array.isArray(data.room) || (_util.isString(data.room) && !!data.room)) {
    let roomArr = Array.isArray(data.room) ? data.room : [data.room];
    let reportResult = [];

    for (let i = 0; i < roomArr.length; i++) {
      let report = { name: roomArr[i] };
      let nspAndRoom = data.namespace + '_' + roomArr[i];
      report.userCount = await _redis.scard(ROOM_USER_SET_PREFIX + nspAndRoom);
      report.clientCount = await _redis.scard(ROOM_CLIENT_SET_PREFIX + '{' + nspAndRoom + '}');
      report.totalClientCount = await _redis.scard(config.redis_total_room_client_set_prefix + '{' + nspAndRoom + '}');
      report.iosClientCount = await _redis.scard(config.redis_ios_room_client_set_prefix + '{' + nspAndRoom + '}');
      report.totalIOSClientCount = await _redis.scard(config.redis_total_ios_room_client_set_prefix + '{' + nspAndRoom + '}');
      report.androidClientCount = await _redis.scard(config.redis_android_room_client_set_prefix + '{' + nspAndRoom + '}');
      report.totalAndroidClientCount = await _redis.scard(config.redis_total_android_room_client_set_prefix + '{' + nspAndRoom + '}');

      if (data.detail && report.clientCount <= config.report_online_list_max_limit) {
        report.client = await _redis.smembers(ROOM_CLIENT_SET_PREFIX + '{' + nspAndRoom + '}');
      }
      if (data.detail && report.userCount <= config.report_online_list_max_limit) {
        report.user = await _redis.smembers(ROOM_USER_SET_PREFIX + nspAndRoom);
      }
      reportResult.push(report);
    }
    return reportResult;
  } else {
    return await namespaceOnline(data.namespace, data.detail);
  }
}

async function namespaceOnline(nsp, detail) {
  let reportResult = {};
  reportResult.roomCount = await _redis.scard(ROOM_SET_PREFIX + nsp);
  reportResult.userCount = await _redis.scard(USER_SET_PREFIX + nsp);
  reportResult.clientCount = await _redis.scard(CLIENT_SET_PREFIX + nsp);


  if (detail && reportResult.roomCount <= config.report_online_list_max_limit) {
    reportResult.room = await _redis.smembers(ROOM_SET_PREFIX + nsp);
  }
  if (detail && reportResult.clientCount <= config.report_online_list_max_limit) {
    reportResult.client = await _redis.smembers(CLIENT_SET_PREFIX + nsp);
  }
  if (detail && reportResult.userCount <= config.report_online_list_max_limit) {
    reportResult.user = await _redis.smembers(USER_SET_PREFIX + nsp);
  }
  return reportResult;
}

