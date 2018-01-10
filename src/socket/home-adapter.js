const Emitter = require('events').EventEmitter;
const request = require('request');
const parser = require('socket.io-parser');
const debug = require('debug');
const log4js = require('log4js');

const config = require('../config');
const handshake = require('./handshake');
const redisFactory = require('../util/redis-factory');
const namespace = require('../base/namespace');
const apiError = require('../util/api-error');

const logger = log4js.getLogger('home-adapter');

const redis_c_s = config.redis_client_set_prefix;
const redis_t_c_s = config.redis_total_client_set_prefix;
const redis_u_s = config.redis_user_set_prefix;
const redis_t_a_r_s = config.redis_total_all_room_set_prefix;
const redis_t_c_a_r_s = config.redis_total_client_all_room_set_prefix;
const redis_r_s = config.redis_room_set_prefix;
const redis_u_r_s = config.redis_user_room_set_prefix;
const redis_r_u_s = config.redis_room_user_set_prefix;
const redis_r_c_s = config.redis_room_client_set_prefix;
const redis_t_r_c_s = config.redis_total_room_client_set_prefix;
const redis_t_i_r_c_s = config.redis_total_ios_room_client_set_prefix;
const redis_i_r_c_s = config.redis_ios_room_client_set_prefix;
const redis_t_a_r_c_s = config.redis_total_android_room_client_set_prefix;
const redis_a_r_c_s = config.redis_android_room_client_set_prefix;
const redis_c_h = config.redis_client_hash_prefix;
const redis_p_m_i = config.redis_push_msg_id_prefix;
const redis_h_b_c = config.redis_home_broadcast_channel;

const USER_ROOM_PREFIX_REG = new RegExp('^' + config.user_room_prefix, 'i');//判断是否是用户类型的房间
const ROOM_PREFIX_REG = new RegExp('^' + config.room_prefix, 'i');//房间统一当前缀


const pub = redisFactory.getInstance();
const sub = redisFactory.getInstance();
const redis_db = redisFactory.getInstance(true);
const key_reg = new RegExp(config.key_reg);

module.exports = Adapter;



//*******************************************************************

function Adapter(nsp) {
  this.nsp = nsp;
  this.rooms = new Map();//保存房间的集合,每个房间保存客户端的集合
  this.sids = new Map();//保存客户端的集合,每个客户端保存拥有多少个房间
  this.channels = {};//在redis服务器中订阅的频道
  this.encoder = new parser.Encoder();
  let self = this;

  let channel = redis_h_b_c + '_' + nsp.name;
  if (nsp.name && nsp.name != '/' && !self.channels[channel]) {//不订阅初始作用域
    sub.subscribe(channel, function (err) {
      if (err) {
        logger.error('adapter subscribe channel: ' + channel + ' error ' + err);
        return;
      }
      self.channels[channel] = true;
    });
    sub.on('message', this.onmessage.bind(this));
  }

  nsp.use(handshake);

  namespace.addOfflineListener(name => {
    if (this.nsp.name != name) return;

    let delay = Math.random() * (5000 + Object.keys(this.nsp.connected).length * 100);
    setTimeout(() => {
      Object.values(this.nsp.connected).forEach(socket => {
        socket._force_disconnect = true;
        socket.disconnect();
      });
      this.rooms = new Map();
      this.sids = new Map();
    }, Math.min(delay, 1000 * 60 * 5));//最长延迟5分钟
  })

}


Adapter.prototype.__proto__ = Emitter.prototype;


Adapter.prototype.onmessage = function (channel, msg) {
  if (this.channels[channel]) {
    let args = JSON.parse(msg);
    args[0] = { type: parser.EVENT, data: ['push', args[0]] };
    let nsp = args[0].data[1].namespace;
    if (!nsp || nsp != this.nsp.name) {
      return debug('ignore different namespace : ' + nsp);
    }
    this.broadcast.apply(this, args);
  }
};

/**
 * 客户端加入房间
 * @param socket
 * @param room
 * @param fn
 */
Adapter.prototype.addAll = async function (socket, rooms, fn) {
  //不处理主命名空间下的所有活动
  if (socket.nsp.name == '/') {
    fn && fn();
    return;
  } else if (socket.disconnected) {
    apiError.throw('client id: ' + socket.id + ' disconnected ');
  }

  let roomList = [];
  for (let i = 0; i < rooms.length; i++) {
    let room = rooms[i];
    //忽略非法的房间名
    if (!ROOM_PREFIX_REG.test(room)) {
      fn && fn();
      return;
    }
    room = room.replace(ROOM_PREFIX_REG, '');
    if (room.length > config.room_max_length || !key_reg.test(room)) {
      fn && fn(new Error('room invalid'));
      return;
    }
    roomList.push(room);
  }

  let redisMulti = redis_db.multi();
  for (let i = 0; i < roomList.length; i++) {
    let room = roomList[i];
    try {
      redisMulti = await _add(this, socket, room, redisMulti);
    } catch (e) {
      logger.error('id: ' + socket.id + ' join room: ' + room + ' fail \n' + e);
    }
  }

  try {
    await redisMulti.exec();
    fn && fn(null);
  }catch(e){
    logger.error('id: ' + socket.id + ' join room list fail \n' + e);
    fn && fn(e);
  }

  //是否需要将该行为广播到房间中
  if (config.room_activity_broadcast && socket.handshake.query.activityBroadcast) {
    for (let i = 0; i < roomList.length; i++) {
      let room = roomList[i];
      this.nsp.in(room);
      this.nsp.except = [socket.id];
      this.nsp.emit('peopleJoin', {
        sid: socket.id,
        uuid: socket.handshake.query.uuid,
        userid: socket.handshake.query.userid,
        room: room
      });
    }
  }
}

/**
 *
 * @param self
 * @param socket
 * @param room
 */
async function _add(self, socket, room, redisMulti) {
  let nspName = self.nsp.name;
  let userName = socket.handshake.userid;
  let isUserRoom = USER_ROOM_PREFIX_REG.test(room) && room.replace(USER_ROOM_PREFIX_REG, '') == userName;

  //单个客户端下有多少个房间
  let mapId = self.sids.get(socket.id);
  if (mapId === undefined) {
    mapId = new Map();
    self.sids.set(socket.id, mapId);
    redisMulti = redisMulti.sadd(redis_c_s + nspName, socket.id);
    redisMulti = redisMulti.sadd(redis_t_c_s + nspName, socket.id);
  }

  //单个房间下有多少个客户端
  let mapRoom = self.rooms.get(room);
  if (mapRoom === undefined) {
    mapRoom = new Map();
    self.rooms.set(room, mapRoom);
    if (isUserRoom) {
      redisMulti = redisMulti.sadd(redis_u_s + nspName, userName);
    } else {
      redisMulti = redisMulti.sadd(redis_r_s + nspName, room);
    }
    redisMulti = redisMulti.sadd(redis_t_a_r_s + nspName, room);
    redisMulti = redisMulti.sadd(redis_t_c_a_r_s + socket.id, room);
  }

  
  let nspAndRoom = nspName + '_' + room;
  redisMulti = redisMulti.sadd(redis_r_c_s + '{' + nspAndRoom + '}', socket.id)
    .sadd(redis_t_r_c_s + '{' + nspAndRoom + '}', socket.id);

  if (socket.handshake.platform == 'ios') {
    redisMulti = redisMulti.sadd(redis_i_r_c_s + '{' + nspAndRoom + '}', socket.id)
      .sadd(redis_t_i_r_c_s + '{' + nspAndRoom + '}', socket.id);
  } else if (socket.handshake.platform == 'android') {
    redisMulti = redisMulti.sadd(redis_a_r_c_s + '{' + nspAndRoom + '}', socket.id)
      .sadd(redis_t_a_r_c_s + '{' + nspAndRoom + '}', socket.id);
  }

  if (!isUserRoom) {
    redisMulti = redisMulti.sadd(redis_r_u_s + nspAndRoom, userName);
    redisMulti = redisMulti.sadd(redis_u_r_s + nspName + '_' + userName, room);
  }

  mapId.set(room, mapRoom);
  mapRoom.set(socket.id, mapId);

  return redisMulti;
};

/**
 * 单个客户端离开房间
 * @param socket
 * @param room
 * @param fn
 */
Adapter.prototype.del = async function (socket, room, fn) {
  //不处理主命名空间下的所有活动
  if (socket.nsp.name == '/') {
    fn && fn();
    return;
  }

  //忽略非法的房间名
  if (!ROOM_PREFIX_REG.test(room)) {
    fn && fn();
  } else {
    room = room.replace(ROOM_PREFIX_REG, '');
    try {
      await _del(this, socket, room);
      fn && fn(null);
    } catch (e) {
      logger.error('id: ' + socket.id + ' leave room: ' + room + ' fail \n' + e);
      fn && fn(e);
    }

  }
}

/**
 *
 * @param self
 * @param socket
 * @param room
 */
async function _del(self, socket, room) {
  let nspName = self.nsp.name;
  let mapId = self.sids.get(socket.id);
  //从内存中移除房间
  if (mapId !== undefined) {
    mapId.delete(room);
  }
  //如果当前连接没有任何房间，直接清除连接下的所有信息
  if (mapId === undefined || mapId.size <= 0) {
    await delAll(this, socket);
    return;
  }

  //从内存中移除客户端
  let mapRoom = self.rooms.get(room);
  if(mapRoom !== undefined){
    mapRoom.delete(socket.id);
  }

  let redisMulti = redis_db.multi();
  let nspAndRoom = nspName + '_' + room;
  //把当前客户端从房间中移除
  redisMulti = redisMulti.srem(redis_r_c_s + '{' + nspAndRoom + '}', socket.id);
  if (socket.handshake.platform == 'ios') {
    redisMulti = redisMulti.srem(redis_i_r_c_s + '{' + nspAndRoom + '}', socket.id);
  } else if (socket.handshake.platform == 'android') {
    redisMulti = redisMulti.srem(redis_a_r_c_s + '{' + nspAndRoom + '}', socket.id);
  }

  try{
    await redisMulti.exec();
  }catch(e){
    logger.error('del error ' + e);
  }

  //移除空房间
  if (mapRoom === undefined || mapRoom.size <= 0) {
    self.rooms.delete(room);
    await deleteRoom(self, room);
  } else {
    logger.warn(`room: ${room} don't have to clear because clientCount: ${mapRoom.size}`);
  }

  //广播下线通知
  if (config.room_activity_broadcast && socket.handshake.query.activityBroadcast) {
    self.nsp.in(room);
    self.nsp.except = [socket.id];
    self.nsp.emit('peopleLeave', {
      sid: socket.id,
      uuid: socket.handshake.query.uuid,
      userid: socket.handshake.query.userid,
      room: room,
      clientOffline: false
    });
  }
};


Adapter.prototype.delAll = async function (socket, fn) {
  const nspName = socket.nsp.name;
  //如果所属命名空间数据有问题直接中断执行
  //socket._force_disconnect 为 true 的连接为服务器强制中断的连接，这是不需要考虑命名空间的数据，强制下线
  if ((nspName == '/' || !namespace.data[nspName] || namespace.data[nspName].offline == 'on') && socket._force_disconnect !== true) {
    fn && fn();
    return;
  }

  try {
    await delAll(this, socket);
    fn && fn(null);
  } catch (e) {
    logger.error('id: ' + socket.id + ' disconnect fail \n' + e);
    fn && fn(e);
  } finally {
    socket._force_disconnect = false;
  }

}

/**
 * 当客户端断开连接时，清除服务器关于该客户端所有数据
 * @param self
 * @param socket
 */
async function delAll(self, socket) {
  let nspName = self.nsp.name;
  let roomList = [];

  let redisMulti = redis_db.multi();
  let mapId = self.sids.get(socket.id);
  //从内存中移除客户端
  self.sids.delete(socket.id);
  //把当前客户端从房间中移除
  if (mapId !== undefined && mapId.size > 0) {

    for (let room of mapId.keys()) {
      roomList.push(room);
      let mapRoom = self.rooms.get(room);

      //从内存中移除客户端
      if (mapRoom !== undefined) {
        mapRoom.delete(socket.id);
      }
      
      let nspAndRoom = nspName + '_' + room;
      redisMulti = redisMulti.srem(redis_r_c_s + '{' + nspAndRoom + '}', socket.id);
      if (socket.handshake.platform == 'ios') {
        redisMulti = redisMulti.srem(redis_i_r_c_s + '{' + nspAndRoom + '}', socket.id);
      } else if (socket.handshake.platform == 'android') {
        redisMulti = redisMulti.srem(redis_a_r_c_s + '{' + nspAndRoom + '}', socket.id);
      }
    }
  }

  //从客户端集合中移除
  redisMulti = redisMulti.srem(redis_c_s + nspName, socket.id);
  //更新客户端信息
  redisMulti = redisMulti.hmset(redis_c_h + socket.id, {
    last_disconnect_time: Date.now(),
    disconnect_reason: 'network'
  });

  try {
    await redisMulti.exec();
  } catch (e) {
    logger.error('delAll error ' + e);
  }

  //移除空房间
  for (let i = 0; i < roomList.length; i++) {
    let room = roomList[i];
    let mapRoom = self.rooms.get(room);

    if (mapRoom === undefined || mapRoom.size <= 0) {
      //从内存中移除房间
      self.rooms.delete(room);
      await deleteRoom(self, room);
    }else{
      logger.warn(`room: ${room} don't have to clear because clientCount: ${mapRoom.size}`);
    }
  }

  //广播下线通知
  if (config.room_activity_broadcast && socket.handshake.query.activityBroadcast) {
    for (let i = 0; i < roomList.length; i++) {
      let room = roomList[i];
      self.nsp.in(room);
      self.nsp.except = [socket.id];
      self.nsp.emit('peopleLeave', {
        sid: socket.id,
        uuid: socket.handshake.query.uuid,
        userid: socket.handshake.query.userid,
        room: room,
        clientOffline: true
      });
    }
  }

  //发送下线通知到第三方服务器
  let nspData = namespace.data[nspName];
  if (nspName != '/' && nspData.disconnect_callback) {

    request({
      url: nspData.disconnect_callback,
      method: 'post',
      json: true,
      headers: {
        cookie: socket.handshake.headers.cookie,
        authorization: nspData.callback_auth,
        namespace: nspName
      },
      body: {
        query: socket.handshake.query
      }
    }, function (err, response, body) {
      //....
    });

  }
}


Adapter.prototype.unionSid = function (rooms, except) {
  let mapIdInter = new Map();

  for (let i = 0; i < rooms.length; i++) {
    let mapRoom = this.rooms.get(rooms[i]);

    if (mapRoom === undefined) continue;

    for (let sid of mapRoom.keys()) {
      mapIdInter.set(sid);
    }
  }


  if (except === undefined || except.length <= 0) return mapIdInter;


  for (let i = 0; i < except.length; i++) {
    mapIdInter.delete(except[i]);
  }
  return mapIdInter;
}

/**
 * Broadcasts a packet.
 *
 * Options:
 *  - `flags` {Object} flags for this packet
 *  - `except` {Array} sids that should be excluded
 *  - `rooms` {Array} list of rooms to broadcast to
 *
 * @param {Object} packet object
 * @api public
 */

Adapter.prototype.broadcast = async function (packet, opts) {
  let rooms = opts.rooms || [];
  let except = Array.isArray(opts.except) ? opts.except : (opts.except ? [opts.except] : []);
  let flags = opts.flags || {};
  let self = this;
  let socket;

  packet.nsp = this.nsp.name;
  this.encoder.encode(packet, function (encodedPackets) {
    let mapSid, mapGlobalExcept, onlineClientCount = 0;

    if (rooms.length) {
      mapSid = self.unionSid(rooms, except);
    } else {
      mapSid = self.sids;

      mapGlobalExcept = new Map();
      for (var i = 0; i < except.length; i++) {
        var exceptId = except[i];
        mapGlobalExcept.set(exceptId, mapSid.get(exceptId));
        mapSid.delete(exceptId);
      }
    }


    try {
      for (let id of mapSid.keys()) {
        socket = self.nsp.connected[id];
        if (!socket) continue;

        if (socket.client.conn.readyState != 'open' || (flags.volatile && !socket.client.conn.transport.writable)) {
          continue;
        }

        socket.packet(encodedPackets, {
          volatile: flags.volatile,
          compress: false,
          preEncoded: true
        });
        onlineClientCount++;
      }
    } catch (e) {
      logger.error('error broadcast ' + e);
    } finally {
      if (mapGlobalExcept !== undefined && mapGlobalExcept.size > 0) {
        for (let id of mapGlobalExcept.keys()) {
          self.sids.set(id, mapGlobalExcept.get(id));
        }
      }

      if (packet.data[0] == 'push' && packet.data[1].id) {
        redis_db.hincrby(redis_p_m_i + packet.data[1].id, 'onlineClientCount', onlineClientCount, function (err) {
          err && logger.error(' message: ' + packet.data[1].id + ' hincrby onlineClientCount error ' + err);
        });
      }
    }

  });
};

async function deleteRoom(self, room) {
  let nspName = self.nsp.name;

  // 应该通过redis的watch来保证事务的一致性，但是ioredis的watch api没有区分和隔离不同的异步上下文
  let clientCount = await redis_db.scard(redis_r_c_s + '{' + nspName + '_' + room + '}');

  if (clientCount > 0){
    logger.warn(`room: ${room} don't have to clear because clientCount: ${clientCount}`);
    return;
  };

  //普通房间，直接从房间集合中移除
  if (!USER_ROOM_PREFIX_REG.test(room)) {
    await redis_db.srem(redis_r_s + nspName, room);
  } else {//用户类型的房间，清除用户相关的数据
    let userName = room.replace(USER_ROOM_PREFIX_REG, '');

    //获取用户所属的房间列表
    let rooms = await redis_db.smembers(redis_u_r_s + nspName + '_' + userName);

    let redisMulti = redis_db.multi();
    //把用户从房间中移除
    for (let i = 0; i < rooms.length; i++) {
      redisMulti = redisMulti.srem(redis_r_u_s + nspName + '_' + rooms[i], userName);
    }

    //清除用户所属房间列表的集合
    redisMulti = redisMulti.del(redis_u_r_s + nspName + '_' + userName);
    //从用户集合中将改用户移除
    redisMulti = redisMulti.srem(redis_u_s + nspName, userName);

    try {
      await redisMulti.exec();
    } catch (e) {
      logger.error(`delete room:${room} error: ${e}`);
    }
  }
}





