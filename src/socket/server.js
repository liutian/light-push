const log4js = require('log4js');
const os = require('os');
const async = require('async');

const redisFactory = require('../util/redis-factory');
const config = require('../config');
const clientService = require('../base/client');
const _util = require('../util/util');
const logger = log4js.getLogger('socket_service');
const _redis = redisFactory.getInstance(true);
const pushService = require('../logic/push');

const redis_p_a_s = config.redis_push_ack_set_prefix;
const redis_p_m_i = config.redis_push_msg_id_prefix;
const redis_a_u_m_l = config.redis_android_unread_message_list;
const redis_c_h = config.redis_client_hash_prefix;
const redis_t_c_s_s = config.redis_total_client_sort_set_prefix;

exports.addNSRegister = addNSRegisterFn;
exports.removeNSRegister = removeNSRegisterFn;
exports.joinOrleaveRoom = joinOrleaveRoomFn;

//*******************************************************************


/* 连接成功后添加不同的事件处理函数 */
async function connectionListener(socket) {
  //不在处理主命名空间下的事件处理
  if (socket.nsp.name == '/') return;
  //最后一次推送的时间，限制
  socket._lastPushTime = Date.now() - config.client_push_interval * 1000;


  //更新用户和设备信息
  try {
    await updateClientInfo(socket);
  } catch (e) {
    logger.error('updateUserAndClient socket: ' + socket.id + ' fail \n' + e);

  }

  //如果是android平台则发送离线消息列表
  if (socket.handshake.platform == 'android') {
    try {
      await offlineMessage(socket);
    } catch (e) {
      logger.error('offlineMessage socket: ' + socket.id + ' fail \n' + e);
    }
  }

  //自动将该客户端添加到对应的用户类型的房间中
  let userRoomName = config.user_room_prefix + socket.handshake.userid;
  joinOrleaveRoomFn(socket, [userRoomName], true, function (result) {
    if (result.status != 200) {
      logger.error('join user room error: ' + result.msg);
    }
  });

  //如果上游服务器返回了当前房间列表,将该socket加入这些房间
  if (Array.isArray(socket.handshake.rooms)) {
    joinOrleaveRoomFn(socket, socket.handshake.rooms, true, function (result) {
      if (result.status != 200) {
        logger.error('join user room error: ' + result.msg);
      }

      delete socket.handshake.rooms;
    });
  }

  //发送连接成功消息
  socket.emit('ok', {
    system: os.hostname(),
    port: config.port,
    clientId: socket.id
  });

  //进入房间
  socket.on('joinRoom', function (rooms, callback) {
    if (!Array.isArray(rooms)) rooms = [rooms];
    joinOrleaveRoomFn(socket, rooms, true, callback);
  });

  //离开房间
  socket.on('leaveRoom', function (rooms, callback) {
    if (!Array.isArray(rooms)) rooms = [rooms];
    joinOrleaveRoomFn(socket, rooms, false, callback);
  });

  //客户端接收推送后的确认报告
  socket.on('ackPush', function (data) {
    if (!data || !data.id) return;

    let msgKey = redis_p_m_i + data.id;
    _redis.hmget(msgKey, ['namespace', 'room'], function (err, result) {
      if (err) return;

      if (!result || result.length <= 0) return;

      let platform = socket.handshake.platform;
      if (platform == 'android' || platform == 'ios' || platform == 'web') {
        let ackKey = redis_p_a_s + platform + '_{' + result[0] + '_' + result[1] + '}_' + data.id;
        _redis.sadd(ackKey, socket.id, function (err, result) {
          if (err) return;

          if (result != 1) return;

          _redis.hincrby(msgKey, 'ackCount', 1);
          if (platform == 'ios') {
            _redis.hincrby(msgKey, 'ackIOSCount', 1);
          } else if (platform == 'android') {
            _redis.hincrby(msgKey, 'ackAndroidCount', 1);
          }
        });
      }
    });
  });

  //设置或者获取ios客户端对哪些房间设置消息免打扰功能
  socket.on('apns', function (data, callback) {
    if (socket.handshake.platform != 'ios') {
      return callback && callback({ status: 403, msg: 'Forbidden' });
    }
    !data && (data = {});
    data.id = socket.id;
    clientService.apns(data).then(function (result) {
      if (result) {
        result.status = _util.isNumber(result.status) ? result.status : 200;
        result.msg = result.msg || 'ok';
        callback && callback(result);
      } else {
        callback && callback({ status: 200, msg: 'ok' });
      }
    }, function (err) {
      callback && callback({ status: err.status || 500, msg: err.msg || err.message });
    });
  });

  //获取客户端详情
  socket.on('info', function (data, callback) {
    let clientId = socket.id;
    if (data && data.clientId) {
      clientId = data.clientId;
      logger.warn('socket.id: ' + socket.id + '  fake identity  clientId: ' + data.clientId);
      //注意这里可能存在安全漏洞，可以修改其它设备的信息
    }
    clientService.info(clientId, data).then(function (result) {
      if (result) {
        result.status = _util.isNumber(result.status) ? result.status : 200;
        result.msg = result.msg || 'ok';
        callback && callback(result);
      } else {
        callback && callback({ status: 200, msg: 'ok' });
      }
    }, function (err) {
      callback && callback({ status: err.status || 500, msg: err.msg || err.message });
    });
  });

  // 客户端主动推送消息，艰难的决定，从一开始就告诉自己绝不能开这个接口否则出问题排查起来很困难，但是没办法迫于业务的压力
  socket.on('push', function (data, callback) {
    let now = Date.now();
    if(now - socket._lastPushTime < config.client_push_interval * 1000){
      return callback && callback({ status: 500, msg: `limited access in ${config.client_push_interval}s` });
    }

    socket._lastPushTime = now;
    let d = Object.assign({
      namespace: socket.nsp.name,
      except: socket.id,
      from: socket.id
    }, data);

    pushService.push(d).then((result) => {
      callback && callback(Object.assign({ status: 200, msg: 'ok' }, result));
    }).catch((e) => {
      callback && callback({ status: e.status || 500, msg: e.msg || e.message });
    });
  });
}


/* 给指定命名空间添加连接成功事件的处理函数 */
function addNSRegisterFn(namespace) {
  let nsp = global._ipush_ioApp.of(namespace);

  //保证只初始化一次,避免多次事件绑定
  if (nsp.connectionListener === true) return;

  nsp.addListener('connection', connectionListener);

  nsp.connectionListener = true
}


/* 将指定命名空间的连接成功事件的处理函数移除掉 */
function removeNSRegisterFn(namespace) {
  let nsp = global._ipush_ioApp.nsps[namespace];//只查看不创建,不能调用of方法

  if (!nsp) return;

  let connListeners = nsp.listeners('connection');

  for (let i = 0; i < connListeners.length; i++) {
    if (connListeners[i] === connectionListener) {
      nsp.removeListener('connection', connectionListener);
      nsp.connectionListener = false;
    }
  }
}


/* 处理加入和离开房间操作 */
function joinOrleaveRoomFn(socket, rooms, isAdd, callback) {
  let method = isAdd ? 'join' : 'leave';

  async.each(rooms, function (room, next) {
    socket[method](config.room_prefix + room, next);
  }, function (err) {
    if (err) {
      callback && callback({ status: 500, msg: 'joinOrleaveRoom error: ' + err.toString() });
    } else {
      callback && callback({ status: 200, msg: 'ok' });
    }
  });
}

/* 更新用户和设备信息 */
async function updateClientInfo(socket) {
  let hour = Math.floor(Date.now() / (3600 * 1000));
  let client_hash_id = redis_c_h + socket.id;
  let client = {
    userid: socket.handshake.userid,
    last_connect_time: Date.now()
  };

  let isExists = await _redis.exists(client_hash_id);
  if (!(isExists = isExists > 0)) {
    client.first_connect_time = client.last_connect_time;
  }

  await _redis.hmset(client_hash_id, client);
  await _redis.zadd(redis_t_c_s_s + socket.nsp.name, hour, socket.id);
}


async function offlineMessage(socket) {
  let msgIdList = await _redis.lrange(redis_a_u_m_l + socket.id, 0, config.android_unread_message_list_max_limit - 1);

  if (!msgIdList || (Array.isArray(msgIdList) && msgIdList.length <= 0)) return;

  let redisMulti = _redis.multi();
  for (let i = 0; i < msgIdList.length; i++) {
    redisMulti = redisMulti.hgetall(redis_p_m_i + msgIdList[i]);
  }

  let multiResult = await redisMulti.exec();

  let msgList = [];
  for (let i = 0; i < multiResult.length; i++) {
    let msg = multiResult[i][1];
    msg.pushData = JSON.parse(msg.pushData);
    msgList.push(msg);
  }

  await _redis.del(redis_a_u_m_l + socket.id);

  socket.emit('offlineMessage', msgList);
}
