const config = require('../config');
const apiError = require('../util/api-error');
const redisFactory = require('../util/redis-factory');
const _util = require('../util/util');


const redis_p_m_l = config.redis_push_message_list_prefix;
const redis_p_a_s = config.redis_push_ack_set_prefix;
const redis_p_m_i = config.redis_push_msg_id_prefix;

const _redis = redisFactory.getInstance(true);


exports.list = listFn;
exports.get = getFn;


//*******************************************************************

//查询单个消息推送统计信息
async function getFn(data) {
  data = _util.pick(data, 'namespace id ackDetail');

  if (!data.namespace) {
    apiError.throw('namespace can not be empty');
  } else if (!data.id) {
    apiError.throw('id can not be empty');
  }

  let hpushmsg = await _redis.hgetall(redis_p_m_i + data.id);
  if (!hpushmsg || !hpushmsg.id) {
    apiError.throw('this id not exists');
  }

  let nspAndRoom = hpushmsg.namespace + '_' + hpushmsg.room;
  let ackIOSKey = redis_p_a_s + 'ios_{' + nspAndRoom + '}_' + data.id;
  let ackWebKey = redis_p_a_s + 'web_{' + nspAndRoom + '}_' + data.id;
  let ackAndroidKey = redis_p_a_s + 'android_{' + nspAndRoom + '}_' + data.id;

  let ackIOSSetCount = await _redis.scard(ackIOSKey);
  let ackWebSetCount = await _redis.scard(ackWebKey);
  let ackAndroidSetCount = await _redis.scard(ackAndroidKey);

  if (hpushmsg && hpushmsg.id && data.ackDetail) {
    if (ackIOSSetCount < config.report_push_ack_detail_max_limit) {
      hpushmsg.ackIOSDetail = await _redis.smembers(ackIOSKey);
      hpushmsg.ackIOSDetail.pop();//去除第一项:__ack
    } else {
      hpushmsg.ackIOSDetail = ['$$'];
    }

    if (ackAndroidSetCount < config.report_push_ack_detail_max_limit) {
      hpushmsg.ackAndroidDetail = await _redis.smembers(ackAndroidKey);
      hpushmsg.ackAndroidDetail.pop();//去除第一项:__ack
    } else {
      hpushmsg.ackAndroidDetail = ['$$'];
    }

    if (ackWebSetCount < config.report_push_ack_detail_max_limit) {
      hpushmsg.ackWebDetail = await _redis.smembers(ackWebKey);
      hpushmsg.ackWebDetail.pop();//去除第一项:__ack
    } else {
      hpushmsg.ackWebDetail = ['$$'];
    }
  } else {
    hpushmsg.ackAndroidDetail = [];
    hpushmsg.ackIOSDetail = [];
    hpushmsg.ackWebDetail = [];
  }

  return hpushmsg;
}

async function listFn(data) {

  data = _util.pick(data, 'namespace page size');

  if (!data.namespace) {
    apiError.throw('namespace can not be empty');
  }

  let lkey = redis_p_m_l + data.namespace;
  data.page = Math.min(data.page || 1, config.push_message_list_max_limit);
  data.size = Math.min(data.size || 20, 500);

  let startIndex = (data.page - 1) * data.size;
  let endIndex = data.page * data.size - 1;
  if (endIndex >= config.push_message_list_max_limit) {
    endIndex = config.push_message_list_max_limit - 1;
  }
  if (startIndex > endIndex) {
    return [];
  }

  let hkeys = await _redis.lrange(lkey, startIndex, endIndex);

  let result = [];
  for (let i = 0; i < hkeys.length; i++) {
    let hpushmsg = await _redis.hgetall(redis_p_m_i + hkeys[i]);
    if (!hpushmsg || !hpushmsg.id) {
      await _redis.ltrim(lkey, 0, startIndex + i - 1);
      break;
    }

    result.push(hpushmsg);
  }
  return result;
}
