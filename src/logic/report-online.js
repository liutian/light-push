const config = require('../config');
const redisFactory = require('../util/redis-factory');
const _util = require('../util/util');

const redis_c_s = config.redis_client_set_prefix;//保存单个命名空间下的客户端集合
const redis_u_s = config.redis_user_set_prefix;//保存单个命名空间下的用户集合
const redis_r_s = config.redis_room_set_prefix;//保存单个命名空间下的房间集合
const redis_r_u_s = config.redis_room_user_set_prefix;//保存单个命名空间单个房间下的用户集合
const redis_r_c_s = config.redis_room_client_set_prefix;//保存单个命名空间单个房间下的客户端集合
const redis_n_k_z = config.redis_namespace_key_z;
const redis_t_r_c_s = config.redis_total_room_client_set_prefix;
const redis_i_r_c_s = config.redis_ios_room_client_set_prefix;
const redis_t_i_r_c_s = config.redis_total_ios_room_client_set_prefix;
const redis_a_r_c_s = config.redis_android_room_client_set_prefix;
const redis_t_a_r_c_s = config.redis_total_android_room_client_set_prefix;
const redis_t_c_s = config.redis_total_client_set_prefix;
const redis_m_s_m = config.redis_message_stat_minute_prefix;
const redis_m_s_h = config.redis_message_stat_hour_prefix;
const redis_m_s_d = config.redis_message_stat_day_prefix;

const _redis = redisFactory.getInstance(true);

exports.online = onlineFn;
exports.currentMessageStat = currentMessageStatFn;


//*******************************************************************

/*
 统计在线信息
 */
async function onlineFn(data) {
  //解析参数
  data = _util.pick(data || {}, 'namespace room detail');

  //统计全平台信息
  if (!data.namespace) {
    let roomCount = userCount = clientCount = 0;
    let nsTotal = await _redis.zcount(redis_n_k_z, '-inf', '+inf');
    let list = await _redis.zrange(redis_n_k_z, 0, nsTotal);
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
      report.userCount = await _redis.scard(redis_r_u_s + nspAndRoom);
      report.clientCount = await _redis.scard(redis_r_c_s + '{' + nspAndRoom + '}');
      report.totalClientCount = await _redis.scard(redis_t_r_c_s + '{' + nspAndRoom + '}');
      report.iosClientCount = await _redis.scard(redis_i_r_c_s + '{' + nspAndRoom + '}');
      report.totalIOSClientCount = await _redis.scard(redis_t_i_r_c_s + '{' + nspAndRoom + '}');
      report.androidClientCount = await _redis.scard(redis_a_r_c_s + '{' + nspAndRoom + '}');
      report.totalAndroidClientCount = await _redis.scard(redis_t_a_r_c_s + '{' + nspAndRoom + '}');

      if (data.detail && report.clientCount <= config.report_online_list_max_limit) {
        report.client = await _redis.smembers(redis_r_c_s + '{' + nspAndRoom + '}');
      }
      if (data.detail && report.userCount <= config.report_online_list_max_limit) {
        report.user = await _redis.smembers(redis_r_u_s + nspAndRoom);
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
  const nowDate = new Date();
  reportResult.roomCount = await _redis.scard(redis_r_s + nsp);
  reportResult.userCount = await _redis.scard(redis_u_s + nsp);
  reportResult.clientCount = await _redis.scard(redis_c_s + nsp);
  reportResult.totalClientCount = await _redis.scard(redis_t_c_s + nsp);

  if (detail && reportResult.roomCount <= config.report_online_list_max_limit) {
    reportResult.room = await _redis.smembers(redis_r_s + nsp);
  }
  if (detail && reportResult.clientCount <= config.report_online_list_max_limit) {
    reportResult.client = await _redis.smembers(redis_c_s + nsp);
  }
  if (detail && reportResult.userCount <= config.report_online_list_max_limit) {
    reportResult.user = await _redis.smembers(redis_u_s + nsp);
  }
  return reportResult;
}

async function currentMessageStatFn(nsp) {
  const result = {};
  const nowDate = new Date();

  if (!nsp || !nsp.trim()) {
    apiError.throw('namespace can not be empty');
  }

  result.currMinuteMessageCount = (await _redis.get(redis_m_s_m + nsp + '_' + nowDate.getHours() + '_' + nowDate.getMinutes())) || 0;
  result.currHourMessageCount = (await _redis.get(redis_m_s_h + nsp + '_' + nowDate.getDate() + '_' + nowDate.getHours())) || 0;
  result.currDateMessageCount = (await _redis.get(redis_m_s_d + nsp + '_' + nowDate.getFullYear() + '_' + nowDate.getMonth() + '_' + nowDate.getDate())) || 0;

  return result;
}
