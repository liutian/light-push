const log4js = require('log4js');

const _util = require('../util/util');
const apiError = require('../util/api-error');
const config = require('../config');
const redisFactory = require('../util/redis-factory');

const logger = log4js.getLogger('namespace');
const _redis = redisFactory.getInstance(true);
const _redis_pub = redisFactory.getInstance();
const _redis_sub = redisFactory.getInstance();
const nspDelChannel = 'nsp_del';
const nspSaveChannel = 'nsp_save';

const CLIENT_SET_PREFIX = config.redis_client_set_prefix;//保存单个命名空间下的客户端集合
const USER_SET_PREFIX = config.redis_user_set_prefix;//保存单个命名空间下的用户集合
const ROOM_SET_PREFIX = config.redis_room_set_prefix;//保存单个命名空间下的房间集合
const ROOM_USER_SET_PREFIX = config.redis_room_user_set_prefix;//保存单个命名空间单个房间下的用户集合
const ROOM_CLIENT_SET_PREFIX = config.redis_room_client_set_prefix;//保存单个命名空间单个房间下的客户端集合
const USER_ROOM_SET_PREFIX = config.redis_user_room_set_prefix;
const IOS_ROOM_CLIENT_SET_PREFIX = config.redis_ios_room_client_set_prefix;
const ANDROID_ROOM_CLIENT_SET_PREFIX = config.redis_android_room_client_set_prefix;

const nspKeys = 'key name connect_callback disconnect_callback auth_passwd apns_list update_date client_ip callback_auth offline';
const nspKList = nspKeys.split(/\s+/);
const apnsKeys = 'name apns_env apns_expiration apns_topic apns_dev_cert apns_dev_key apns_production_cert apns_production_key del token_key token_keyId token_teamId';
const nspObj = {};
const apnsChangeListeners = [];
const offlineListeners = [];

const redis_db = redisFactory.getInstance(true);

_redis_sub.subscribe(nspDelChannel, function (err) {
  if (err) logger.error('nsp_del subscribe channel error: ' + err);
});

_redis_sub.subscribe(nspSaveChannel, function (err) {
  if (err) logger.error('nsp_save subscribe channel error: ' + err);
});

_redis_sub.on('message', function (channel, msg) {
  if (channel == nspDelChannel) {
    delete nspObj[msg];
  } else if (channel == nspSaveChannel) {
    _saveFn(JSON.parse(msg));
  }
});

//从缓存中加载命名空间信息
init();

module.exports = {
  del: delFn,
  save: saveFn,
  get: getFn,
  list: listFn,
  data: nspObj,
  addOfflineListener: addOfflineListenerFn,
  addApnsChangeListener: addApnsChangeListenerFn,
  clearDirtyClient: clearDirtyClientFn
}



//*******************************************************************

async function clearDirtyClientFn(nspName) {
  if (!nspName) return;

  let roomList = await _redis.smembers(ROOM_SET_PREFIX + nspName);
  let clientList = await _redis.smembers(CLIENT_SET_PREFIX + nspName);
  let userList = await _redis.smembers(USER_SET_PREFIX + nspName);


  let redisMulti = redis_db.multi();
  let disconnectTime = Date.now();
  clientList.forEach(clientId => {
    redisMulti = redisMulti.del(config.redis_client_hash_prefix + clientId, {
      last_disconnect_time: disconnectTime
    });
  });
  redisMulti = redisMulti.del(CLIENT_SET_PREFIX + nspName);

  try {
    await redisMulti.exec();
  } catch (e) {
    logger.error('clear dirty client 1' + e);
  }


  redisMulti = redis_db.multi();
  userList.forEach(userName => {
    redisMulti = redisMulti.del(USER_ROOM_SET_PREFIX + nspName + '_' + userName);
  });
  redisMulti = redisMulti.del(USER_SET_PREFIX + nspName);

  try {
    await redisMulti.exec();
  } catch (e) {
    logger.error('clear dirty client 2' + e);
  }


  redisMulti = redis_db.multi();
  roomList.forEach(room => {
    let nspAndRoom = nspName + '_' + room;
    redisMulti = redisMulti.del(ROOM_CLIENT_SET_PREFIX + '{' + nspAndRoom + '}');
    redisMulti = redisMulti.del(IOS_ROOM_CLIENT_SET_PREFIX + '{' + nspAndRoom + '}');
    redisMulti = redisMulti.del(ANDROID_ROOM_CLIENT_SET_PREFIX + '{' + nspAndRoom + '}');
    redisMulti = redisMulti.del(ROOM_USER_SET_PREFIX + nspAndRoom);
  });
  redisMulti = redisMulti.del(ROOM_SET_PREFIX + nspName);

  try {
    await redisMulti.exec();
  } catch (e) {
    logger.error('clear dirty client 3' + e);
  }


}

async function init() {
  let nspList = await listFn();
  nspList.forEach(function (v) {
    createApnsObj(v);
    nspObj[v.key] = v;
  });
}

async function getFn(key) {
  if (!key) apiError.throw('can not find key');
  let vList = await _redis.hmget(config.redis_namespace_set_prefix + key, nspKList);
  let nsp = {};
  nspKList.forEach(function (k, index) {
    if (k == 'apns_list' && vList[index]) {
      nsp[k] = JSON.parse(vList[index]);
    } else {
      nsp[k] = vList[index];
    }
  });
  return nsp;
}

async function listFn() {
  var nspKeyList = await _redis.zrange(config.redis_namespace_key_z, 0, 1000);
  var nspList = [];

  for (let i = 0; i < nspKeyList.length; i++) {
    var nspKey = nspKeyList[i];

    var nsp = await getFn(nspKey);

    nspList.push(nsp);
  }

  return nspList;
}

async function delFn(key) {
  if (!key) apiError.throw('can not find key');
  if (key.indexOf('/') != 0) key = '/' + key;
  await _redis.zrem(config.redis_namespace_key_z, key);
  await _redis.del(config.redis_namespace_set_prefix + key);
  delete nspObj[key];
  _redis_pub.publish(nspDelChannel, key);
}


async function saveFn(nsp) {
  if (!nsp || !nsp.key) apiError.throw('key is null');
  nsp = _util.pick(nsp, nspKeys);

  let apns_list;
  if (Array.isArray(nsp.apns_list) && nsp.apns_list.length > 0) {
    nsp.apns_list.forEach(function (val, key) {
      nsp.apns_list[key] = _util.pick(val, apnsKeys);
    });

    let apns_list_arr = await _redis.hmget(config.redis_namespace_set_prefix + nsp.key, 'apns_list');
    apns_list = apns_list_arr[0];
    if (!apns_list) {
      apns_list = [];
    }

    try {
      apns_list = JSON.parse(apns_list);
    } catch (e) {
      apns_list = [];
    }

    nsp.apns_list.forEach(function (val, key) {
      let index = apns_list.findIndex(function (value) {
        return value.name == val.name;
      });

      if (val.del && index != -1) {
        apns_list.splice(index, 1);
      } else if (!val.del && index == -1) {
        apns_list.push(val);
      } else if (!val.del && index != -1) {
        apns_list[index] = Object.assign(apns_list[index], val);
      }
    });

    nsp.apns_list = JSON.stringify(apns_list);
  } else {
    delete nsp.apns_list;
  }

  nsp.update_date = Date.now();
  let isExists = await _redis.exists(config.redis_namespace_set_prefix + nsp.key);
  if (!isExists) {
    await _redis.zadd(config.redis_namespace_key_z, 0, nsp.key);
  }

  await _redis.hmset(config.redis_namespace_set_prefix + nsp.key, nsp);

  nsp.apns_list = apns_list;
  _saveFn(nsp);

  _redis_pub.publish(nspSaveChannel, JSON.stringify(nsp));
}

function _saveFn(nsp) {
  if (!(nsp.key in nspObj)) {
    nspObj[nsp.key] = {};
  }
  var oldNsp = nspObj[nsp.key];
  for (var k in nsp) {
    if (k == 'key') continue;
    oldNsp[k] = nsp[k];
  }
  if (nsp.offline == 'on') {
    offlineListeners.forEach(function (listener) {
      listener(nsp.key, nsp);
    });
  }
  createApnsObj(oldNsp);
}

function createApnsObj(nsp) {
  if (Array.isArray(nsp.apns_list)) {
    nsp.apnsObj = {};
    nsp.apns_list.forEach(function (val, index) {
      nsp.apnsObj[val.name] = val;
      apnsChangeListeners.forEach(function (listener) {
        listener(val, nsp.key);
      })
    });
  } else {
    nsp.apns_list = [];
  }

  if (!nsp.apnsObj) nsp.apnsObj = {};
}

function addApnsChangeListenerFn(listener) {
  for (let key in nspObj) {
    let apnsList = nspObj[key].apns_list;
    apnsList.forEach(function (apn) {
      listener(apn, key);
    })
  }
  apnsChangeListeners.push(listener);
}

function addOfflineListenerFn(listener) {
  offlineListeners.push(listener);
}
