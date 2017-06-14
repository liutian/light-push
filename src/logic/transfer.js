const log4js = require('log4js');

const config = require('../config');
const apiError = require('../util/api-error');
const redisFactory = require('../util/redis-factory');
const _util = require('../util/util');

const logger = log4js.getLogger('logic_transfer');

const TRANSFER = config.redis_room_transfer_channel;
//创建专门通道
const redis_pub = redisFactory.getInstance();
const _redis = redisFactory.getInstance(true);


exports.transfer = transferFn;


//*******************************************************************


async function transferFn(data) {

  data = _util.pick(data, 'namespace targetRoom sourceRooms type');

  if (!data.targetRoom
    || !data.sourceRooms
    || data.sourceRooms.length <= 0
    || !data.type || !data.namespace) {
    apiError.throw('targetRoom and sourceRooms and type and namespace can not be empty');
  }
  let nspAndRoom = data.namespace + '_' + data.targetRoom;


  let allList = await _redis.sunion(data.sourceRooms.map(function (item) {
    return config.redis_total_room_client_set_prefix + '{' + data.namespace + '_' + item + '}';
  }));
  if (Array.isArray(allList) && allList.length > 0) {
    await _redis[data.type == 'join' ? 'sadd' : 'srem'](config.redis_total_room_client_set_prefix + '{' + nspAndRoom + '}', allList);
  }

  let iosList = await _redis.sunion(data.sourceRooms.map(function (item) {
    return config.redis_total_ios_room_client_set_prefix + '{' + data.namespace + '_' + item + '}';
  }));
  if (Array.isArray(iosList) && iosList.length > 0) {
    await _redis[data.type == 'join' ? 'sadd' : 'srem'](config.redis_total_ios_room_client_set_prefix + '{' + nspAndRoom + '}', iosList);
  }

  let androidList = await _redis.sunion(data.sourceRooms.map(function (item) {
    return config.redis_total_android_room_client_set_prefix + '{' + data.namespace + '_' + item + '}';
  }));
  if (Array.isArray(androidList) && androidList.length > 0) {
    await _redis[data.type == 'join' ? 'sadd' : 'srem'](config.redis_total_android_room_client_set_prefix + '{' + nspAndRoom + '}', androidList);
  }

  redis_pub.publish(TRANSFER, JSON.stringify(data));

}

