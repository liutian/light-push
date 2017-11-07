const config = require('../config');
const apiError = require('../util/api-error');
const redisFactory = require('../util/redis-factory');
const _util = require('../util/util');


const PUSH_MESSAGE_LIST_PREFIX = config.redis_push_message_list_prefix;
const PUSH_ACK_SET_PREFIX = config.redis_push_ack_set_prefix;

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

  let hpushmsg = await _redis.hgetall(config.redis_push_msg_id_prefix + data.id);
  if (!hpushmsg || !hpushmsg.id) {
    apiError.throw('this id not exists');
  }

  let nspAndRoom = hpushmsg.namespace + '_' + hpushmsg.room;
  let ackIOSKey = PUSH_ACK_SET_PREFIX + 'ios_{' + nspAndRoom + '}_' + data.id;
  let ackWebKey = PUSH_ACK_SET_PREFIX + 'web_{' + nspAndRoom + '}_' + data.id;
  let ackAndroidKey = PUSH_ACK_SET_PREFIX + 'android_{' + nspAndRoom + '}_' + data.id;

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

  let lkey = PUSH_MESSAGE_LIST_PREFIX + data.namespace;
  data.page = Math.min(data.page || 1, config.push_message_list_max_limit);
  data.size = Math.min(data.size || 20, 100);

  let startIndex = (data.page - 1) * data.size;
  let endIndex = data.page * data.size - 1;
  if (data.page * data.size > config.push_message_list_max_limit) {
    endIndex = config.push_message_list_max_limit - 1;
  }
  if (startIndex > endIndex) {
    return [];
  }

  let hkeys = await _redis.lrange(lkey, startIndex, endIndex);

  let result = [];
  for (let i = 0; i < hkeys.length; i++) {
    let hpushmsg = await _redis.hgetall(config.redis_push_msg_id_prefix + hkeys[i]);
    if (!hpushmsg || !hpushmsg.id) {
      await _redis.ltrim(lkey, 0, startIndex + i - 1);
      break;
    }

    result.push(hpushmsg);
  }
  return result;
}
