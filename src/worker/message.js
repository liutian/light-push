const url = require('url');
const fs = require('fs');
const argv = require('yargs').argv;

//提供性能
//global.Promise = require('bluebird');

// 加载配置信息
const config = require('../config');

if (!config.log_prefix) {
  config.log_prefix = 'worker_message_' + (argv.n || '');
}
//启动日志服务
require('../config/log4j-config');


const apn = require('apn');
const log4js = require('log4js');
const redisFactory = require('../util/redis-factory');
const namespace = require('../base/namespace');


const redis_p_m_t_l = config.redis_push_message_temp_list_prefix;
const redis_p_m_i = config.redis_push_msg_id_prefix;
const redis_c_h = config.redis_client_hash_prefix;
const redis_t_a_r_c_s = config.redis_total_android_room_client_set_prefix;
const redis_p_a_s = config.redis_push_ack_set_prefix;
const redis_a_u_m_l = config.redis_android_unread_message_list;
const redis_t_i_r_c_s = config.redis_total_ios_room_client_set_prefix;

const logger = log4js.getLogger('worker_message');
const _redis = redisFactory.getInstance(true);
const apnProviders = {};
const resultSeparator = '  >>>>  ';


setTimeout(function () {
  init();
  console.warn('worker message starting ...');
}, 3000);


//*******************************************************************

function init() {
  namespace.addApnsChangeListener(function (apns, nspKey) {
    let providerKey = nspKey + '-' + apns.name;
    let provider = apnProviders[providerKey];
    if (provider) {
      provider.shutdown();
      delete apnProviders[providerKey];
    }

    provider = createApnProvider(apns);

    apnProviders[providerKey] = provider;
  });
  postMessage();
}

function createApnProvider(apns) {
  let production = apns.apns_env == 'production';
  let providerConfig = { production: production };
  if (apns.token_key) {
    providerConfig.token = {
      key: apns.token_key,
      keyId: apns.token_keyId,
      teamId: apns.token_teamId
    }
  } else {
    providerConfig.cert = production ? apns.apns_production_cert : apns.apns_dev_cert;
    providerConfig.key = production ? apns.apns_production_key : apns.apns_dev_key;
  }

  let provider;
  try {
    provider = new apn.Provider(providerConfig);
  } catch (e) {
    logger.error('create apns provider error ' + e);
  }

  return provider;
}


function postMessage() {
  _redis.brpop(redis_p_m_t_l, 0, function (err, result) {
    if (err) {
      logger.error('run message worker error: ' + e);
      postMessage();
      return;
    }

    if (!Array.isArray(result) || !result[1]) return;

    _postMessage(result[1]).then(function () {
      postMessage();
    }, function (e) {
      logger.error('postMessage file id: ' + result[1] + ' error: ' + e);
      postMessage();
    });
  });
}

async function _postMessage(msgId) {
  let msg = await _redis.hgetall(redis_p_m_i + msgId);
  if (!msg || !msg.pushData) {
    return;
  }

  try {
    msg.pushData = JSON.parse(msg.pushData);
  } catch (e) {
    logger.error('pushData parse err ' + e);
  }
  let nspAndRoom = msg.namespace + '_' + msg.room;

  let androidAckKey = redis_p_a_s + 'android_{' + nspAndRoom + '}_' + msgId;
  let androidClientList = await _redis.sdiff(redis_t_a_r_c_s + '{' + nspAndRoom + '}', androidAckKey);
  for (let j = 0; j < androidClientList.length; j++) {
    let clientId = androidClientList[j];
    let androidClient = await _redis.hgetall(redis_c_h + clientId);
    if (androidClient.leaveMessage == 'false') break;
    let unreadKey = redis_a_u_m_l + androidClientList[j];
    await _redis.multi().lpush(unreadKey, msgId)
      .ltrim(unreadKey, 0, config.android_unread_message_list_max_limit - 1)
    expire(unreadKey, msg.expire * 3600).exec();
  }

  await postForIOS(msg);

}

async function postForIOS(msg) {
  let nspConfig = namespace.data[msg.namespace];
  let nspAndRoom = msg.namespace + '_' + msg.room;
  let apnsResult = '';

  let apnsConfig = null;
  let apnProvider = null;
  if (!msg.apnsName) {
    if (namespace.data['/'] && namespace.data['/'].apnsObj && namespace.data['/'].apnsObj['default']) {
      apnsConfig = namespace.data['/'].apnsObj['default'];
      apnProvider = apnProviders['/-default'];
      apnsResult += 'apnsEnv:' + apnsConfig.apns_env + '  ';
    } else {
      return await _redis.hmset(redis_p_m_i + msg.id, { result: 'no default apns' });
    }
  } else if (nspConfig && msg.apnsName && nspConfig.apnsObj[msg.apnsName]) {
    apnsConfig = nspConfig.apnsObj[msg.apnsName];
    apnProvider = apnProviders[msg.namespace + '-' + msg.apnsName];
    apnsResult += 'apnsEnv:' + apnsConfig.apns_env + '  ';
  } else {
    return await _redis.hmset(redis_p_m_i + msg.id, { result: 'apnsName:' + msg.apnsName + ' not exists' });
  }

  if (!apnProvider) {
    logger.error('no apns provider namespace: ' + msg.namespace + '  apnsName:' + msg.apnsName);
    return await _redis.hmset(redis_p_m_i + msg.id, { result: 'apnProvider not exists' });
  }

  let apsPayload = msg.pushData.apsData;
  if (!apsPayload) {
    apsPayload = {}
  }
  if (!apsPayload.aps) {
    apsPayload.aps = {};
  }
  if (!apsPayload.aps.alert) {
    apsPayload.aps.alert = config.apns_aps_alert;
  }

  let iosAckKey = redis_p_a_s + 'ios_{' + nspAndRoom + '}_' + msg.id;
  let iosClientList = await _redis.sdiff(redis_t_i_r_c_s + '{' + nspAndRoom + '}', iosAckKey);
  let apnsCount = apnsSuccessCount = 0;
  for (var i = 0; i < iosClientList.length; i++) {
    let clientId = iosClientList[i];
    let iosClient = await _redis.hgetall(redis_c_h + clientId);

    if (iosClient.leaveMessage == 'false') {
      apnsResult += resultSeparator + 'clientId:' + clientId + ' leaveMessage is false';
      continue;
    }
    if (!iosClient.device_token) {
      apnsResult += resultSeparator + 'clientId:' + clientId + ' device_token is empty';
      continue;
    }
    if (iosClient.no_send_apns && iosClient.no_send_apns.indexOf(msg.room) != -1) {
      apnsResult += resultSeparator + 'clientId:' + clientId + ' room:' + msg.room + 'in no_send_apns';
      continue;
    }

    try {
      apnsCount++;
      await sendMsgToApns(iosClient.device_token, apsPayload, apnsConfig, apnProvider);
      apnsSuccessCount++;
    } catch (e) {
      if (e.error) {//如果连接出错就断开重连,仅此一次
        logger.error('push msg to apns error:' + (e.error && e.error.message));
        apnProvider.shutdown();
        delete apnProviders[msg.apnsName];
        apnProvider = createApnProvider(apnsConfig);
        if (apnProvider) {
          apnProviders[msg.apnsName] = apnProvider;
          try {
            await sendMsgToApns(iosClient.device_token, apsPayload, apnsConfig, apnProvider);
            apnsSuccessCount++;
          } catch (e) {
            if (e.error) {//如果还失败就没有办法了
              logger.error('push msg to apns fail over: ' + (e.error && e.error.message));
              apnsResult += resultSeparator + 'connect error: ' + (e.error && e.error.message);
            } else {
              apnsResult += resultSeparator + 'second error: ';
              apnsResult += await sendMsgToApnsCatch(e, clientId);
            }
          }
        } else {
          apnsResult += resultSeparator + 'connect error create apnProvider fail';
        }
      } else {
        apnsResult += resultSeparator + 'first error: ';
        apnsResult += await sendMsgToApnsCatch(e, clientId);
      }
    }
  }

  await _redis.hmset(redis_p_m_i + msg.id, { apnsCount: apnsCount, apnsSuccessCount: apnsSuccessCount, result: apnsResult });

}

async function sendMsgToApnsCatch(e, clientId) {
  let reason = (e.response && e.response.reason) || 'fail';
  let result = 'push msg to apns reason: ' + reason + ' statusCode: ' + e.status;
  logger.error(result);

  if (e.status == 410 || reason == 'BadDeviceToken' || reason == 'DeviceTokenNotForTopic' || reason == 'Unregistered') {
    logger.error('del device_token client id: ' + clientId);
    await _redis.hdel(redis_c_h + clientId, ['device_token']);
    //后续添加清除iOS设备的操作
  }

  return result;
}

async function sendMsgToApns(token, apsPayload, apnsConfig, apnProvider) {
  let note = new apn.Notification();

  note.priority = 10;
  note.expiry = apnsConfig.apns_expiration;
  note.topic = apnsConfig.apns_topic;

  note.rawPayload = apsPayload;

  let sendResult = await apnProvider.send(note, token);

  if (sendResult.failed.length > 0) {
    throw sendResult.failed[0];
  }
}
