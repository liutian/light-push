const log4js = require('log4js');

const config = require('../config');
const apiError = require('../util/api-error');
const redisFactory = require('../util/redis-factory');
const namespace = require('../base/namespace');
const _util = require('../util/util');

const logger = log4js.getLogger('push');

const redis_p_m_i = config.redis_push_msg_id_prefix;
const redis_p_m_l = config.redis_push_message_list_prefix;
const redis_p_a_s = config.redis_push_ack_set_prefix;
const redis_p_m_u = config.redis_push_msg_uuid;
const redis_p_m_t_l = config.redis_push_message_temp_list_prefix;
const redis_h_b_c = config.redis_home_broadcast_channel;
const pushKList = 'namespace room except pushData apnsName leaveMessage extra from';

const _redis = redisFactory.getInstance(true);
const homeBroadcastPub = redisFactory.getInstance();
const key_reg = new RegExp(config.key_reg);

exports.push = pushFn;



//*******************************************************************

/* 推送消息 */
async function pushFn(data) {

  //解析参数
  data = _util.pick(data, pushKList);

  if (!data.namespace) {
    apiError.throw('namespace can not be empty');
  } else if (!data.room) {
    apiError.throw('room can not be empty');
  } else if (data.room.length > config.room_max_length || !key_reg.test(data.room)) {
    apiError.throw('room invalid')
  } else if (!data.pushData || typeof data.pushData != 'object') {
    apiError.throw('pushData can not be empty and must be an Object');
  } else if (data.except && typeof data.except != 'string') {
    apiError.throw('except must be string');
  }

  //判断命名空间是否存在
  let nspConfig = namespace.data[data.namespace];
  if (!nspConfig) {
    apiError.throw('this namespace lose');
  } else if (nspConfig.offline == 'on') {
    apiError.throw('this namespace offline');
  }

  //判断apsData转化为JSON字符串后是否超过预定长度
  if (data.leaveMessage && data.pushData.apsData) {
    let apsDataStr;
    try {
      apsDataStr = JSON.stringify(data.pushData.apsData);
    } catch (e) {
      apiError.throw('parse pushData.apsData err' + e);
    }
    if (Buffer.byteLength(apsDataStr, 'utf-8') > config.apns_payload_size) {
      apiError.throw('pushData.apsData size must be less then ' + config.apns_payload_size + ' bytes');
    }
  }

  //初始化数据
  let nspAndRoom = data.namespace + '_' + data.room;
  let hsetKey = await _redis.incr(redis_p_m_u);
  data.id = hsetKey;
  data.sendDate = Date.now();
  data.ackCount = data.ackIOSCount = data.ackAndroidCount = data.onlineClientCount = 0;

  //存储消息
  await _redis.multi().hmset(redis_p_m_i + hsetKey, Object.assign({}, data, { pushData: JSON.stringify(data.pushData) }))
    .expire(redis_p_m_i + hsetKey, config.push_message_h_expire * 3600).exec();
  //存储消息ID到系统消息ID列表中
  await _redis.multi().lpush(redis_p_m_l + data.namespace, hsetKey).ltrim(redis_p_m_l + data.namespace, 0, config.push_message_list_max_limit - 1).exec();
  //初始化确认消息回执的客户的集合
  let androidAckKey = redis_p_a_s + 'android_{' + nspAndRoom + '}_' + hsetKey;
  await _redis.multi().sadd(androidAckKey, '__ack').expire(androidAckKey, config.push_message_h_expire * 3600).exec();
  let iosAckKey = redis_p_a_s + 'ios_{' + nspAndRoom + '}_' + hsetKey;
  await _redis.multi().sadd(iosAckKey, '__ack').expire(iosAckKey, config.push_message_h_expire * 3600).exec();
  let webAckKey = redis_p_a_s + 'web_{' + nspAndRoom + '}_' + hsetKey;
  await _redis.multi().sadd(webAckKey, '__ack').expire(webAckKey, config.push_message_h_expire * 3600).exec();
  //将推送消息放到消息队列中
  if (data.leaveMessage) {
    setTimeout(function () {
      _redis.lpush(redis_p_m_t_l, hsetKey, function (err) {
        if (err) {
          logger.error('push message temp list err ' + err);
        }
      })
    }, config.worker_message_timeout);
  }

  // 主动放弃推送到客户端,模拟网络异常导致推送无法到达的情况
  if (data.extra !== 'lost') {
    //发布redis推送订阅频道
    let publishData = config.emit_msg_pick_key ? _util.pick(data, 'id namespace room pushData sendDate ') : data;
    delete publishData.pushData.apsData;
    let chn = redis_h_b_c + '_' + data.namespace;
    let msg = JSON.stringify([publishData, {
      rooms: [data.room],
      except: data.except
    }]);
    homeBroadcastPub.publish(chn, msg);
  }

  return { id: hsetKey };
}
