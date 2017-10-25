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

const CLIENT_SET_PREFIX = config.redis_client_set_prefix;
const USER_SET_PREFIX = config.redis_user_set_prefix;
const ROOM_SET_PREFIX = config.redis_room_set_prefix;
const USER_ROOM_SET_PREFIX = config.redis_user_room_set_prefix;
const ROOM_USER_SET_PREFIX = config.redis_room_user_set_prefix;
const ROOM_CLIENT_SET_PREFIX = config.redis_room_client_set_prefix;
const TOTAL_ROOM_CLIENT_SET_PREFIX = config.redis_total_room_client_set_prefix;

const TOTAL_IOS_ROOM_CLIENT_SET_PREFIX = config.redis_total_ios_room_client_set_prefix;
const IOS_ROOM_CLIENT_SET_PREFIX = config.redis_ios_room_client_set_prefix;
const TOTAL_ANDROID_ROOM_CLIENT_SET_PREFIX = config.redis_total_android_room_client_set_prefix;
const ANDROID_ROOM_CLIENT_SET_PREFIX = config.redis_android_room_client_set_prefix;

const USER_ROOM_PREFIX_REG = new RegExp('^' + config.user_room_prefix, 'i');//判断是否是用户类型的房间
const ROOM_PREFIX_REG = new RegExp('^' + config.room_prefix, 'i');//房间统一当前缀

const broadcast_prefix = config.redis_home_broadcast_channel;

const pub = redisFactory.getInstance();
const sub = redisFactory.getInstance();
const redis_db = redisFactory.getInstance(true);


module.exports = Adapter;



//*******************************************************************

function Adapter(nsp) {
  this.nsp = nsp;
  this.rooms = new Map();//保存房间的集合,每个房间保存客户端的集合
  this.sids = new Map();//保存客户端的集合,每个客户端保存拥有多少个房间
  this.channels = {};//在redis服务器中订阅的频道
  this.encoder = new parser.Encoder();
  let self = this;

  let channel = broadcast_prefix + '_' + nsp.name;
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

    let delay = Math.random() * (5000 + this.nsp.connected.length * 100);
    setTimeout(() => {
      Object.values(this.nsp.connected).forEach(socket => {
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
    roomList.push(room);
  }

  for (let i = 0; i < roomList.length; i++) {
    let room = roomList[i];
    try {
      await add(this, socket, room);
      fn && fn(null);
    } catch (e) {
      logger.error('id: ' + socket.id + ' join room: ' + room + ' fail \n' + e);
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
async function add(self, socket, room) {
  if (socket.disconnected) {
    apiError.throw('client id: ' + socket.id + ' disconnected ');
  }


  let nspName = self.nsp.name;
  let userName = socket.handshake.userid;
  let isUserRoom = USER_ROOM_PREFIX_REG.test(room) && room.replace(USER_ROOM_PREFIX_REG, '') == userName;

  //单个客户端下有多少个房间
  let mapId = self.sids.get(socket.id);
  if (mapId === undefined) {
    mapId = new Map();
    self.sids.set(socket.id, mapId);
    await redis_db.sadd(CLIENT_SET_PREFIX + nspName, socket.id);
  }

  //单个房间下有多少个客户端
  let mapRoom = self.rooms.get(room);
  if (mapRoom === undefined) {
    mapRoom = new Map();
    self.rooms.set(room, mapRoom);
    if (isUserRoom) {
      await redis_db.sadd(USER_SET_PREFIX + nspName, userName);
    } else {
      await redis_db.sadd(ROOM_SET_PREFIX + nspName, room);
    }
  }

  let redisMulti = redis_db.multi();
  let nspAndRoom = nspName + '_' + room;
  redisMulti = redisMulti.sadd(ROOM_CLIENT_SET_PREFIX + '{' + nspAndRoom + '}', socket.id)
    .sadd(TOTAL_ROOM_CLIENT_SET_PREFIX + '{' + nspAndRoom + '}', socket.id);

  if (socket.handshake.platform == 'ios') {
    redisMulti = redisMulti.sadd(IOS_ROOM_CLIENT_SET_PREFIX + '{' + nspAndRoom + '}', socket.id)
      .sadd(TOTAL_IOS_ROOM_CLIENT_SET_PREFIX + '{' + nspAndRoom + '}', socket.id);
  } else if (socket.handshake.platform == 'android') {
    redisMulti = redisMulti.sadd(ANDROID_ROOM_CLIENT_SET_PREFIX + '{' + nspAndRoom + '}', socket.id)
      .sadd(TOTAL_ANDROID_ROOM_CLIENT_SET_PREFIX + '{' + nspAndRoom + '}', socket.id);
  }

  await redisMulti.exec();

  if (!isUserRoom) {
    await redis_db.sadd(ROOM_USER_SET_PREFIX + nspAndRoom, userName);
    await redis_db.sadd(USER_ROOM_SET_PREFIX + nspName + '_' + userName, room);
  }


  mapId.set(room, mapRoom);
  mapRoom.set(socket.id, mapId);

  //是否需要将该行为广播到房间中
  if (config.room_activity_broadcast && socket.handshake.query.activityBroadcast) {
    self.nsp.in(room);
    self.nsp.except = [socket.id];
    self.nsp.emit('peopleJoin', {
      sid: socket.id,
      uuid: socket.handshake.query.uuid,
      userid: socket.handshake.query.userid,
      room: room
    });
  }
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
      await del(this, socket, room);
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
async function del(self, socket, room) {
  if (socket.disconnected) {
    apiError.throw('client id: ' + socket.id + ' disconnected ');
  }

  let unsubscribe = false;//保留这个变量可能以后还有用
  let nspName = self.nsp.name;
  let mapId = self.sids.get(socket.id);
  if (mapId !== undefined) {
    mapId.delete(room);
    if (mapId.size === 0) {
      self.sids.delete(socket.id);
      await redis_db.srem(CLIENT_SET_PREFIX + nspName, socket.id);
    }
  }

  let redisMulti = redis_db.multi();
  let nspAndRoom = nspName + '_' + room;

  redisMulti = redisMulti.srem(ROOM_CLIENT_SET_PREFIX + '{' + nspAndRoom + '}', socket.id);
  if (socket.handshake.platform == 'ios') {
    redisMulti = redisMulti.srem(IOS_ROOM_CLIENT_SET_PREFIX + '{' + nspAndRoom + '}', socket.id);
  } else if (socket.handshake.platform == 'android') {
    redisMulti = redisMulti.srem(ANDROID_ROOM_CLIENT_SET_PREFIX + '{' + nspAndRoom + '}', socket.id);
  }
  await redisMulti.exec();

  let mapRoom = self.rooms.get(room);
  if (mapRoom !== undefined) {
    mapRoom.delete(socket.id);
    if (mapRoom.size === 0) {
      self.rooms.delete(room);
      unsubscribe = true;
      await deleteRoom(self, room);
    }
  }

  if (config.room_activity_broadcast && socket.handshake.query.activityBroadcast) {
    self.nsp.in(room);
    self.nsp.except = [socket.id];
    self.nsp.emit('peopleLeave', {
      sid: socket.id,
      uuid: socket.handshake.query.uuid,
      userid: socket.handshake.query.userid,
      rooms: [room],
      clientOffline: false
    });
  }
};


Adapter.prototype.delAll = async function (socket, fn) {
  if (socket.nsp.name == '/') {
    fn && fn();
    return;
  }

  try {
    await delAll(this, socket);
    fn && fn(null);
  } catch (e) {
    logger.error('id: ' + socket.id + ' disconnect fail \n' + e);
    fn && fn(e);
  }

}

/**
 * 当客户端断开连接时，清除服务器关于该客户端所有数据
 * @param self
 * @param socket
 */
async function delAll(self, socket) {
  let unsubscribeRooms = [];//保留这个变量可能以后还有用
  let nspName = self.nsp.name;
  let roomList = [];

  let mapId = self.sids.get(socket.id);
  if (mapId !== undefined) {
    for (let room of mapId.keys()) {
      roomList.push(room);
      let mapRoom = self.rooms.get(room);

      if (mapRoom !== undefined) {
        mapRoom.delete(socket.id);
      }

      let redisMulti = redis_db.multi();
      let nspAndRoom = nspName + '_' + room;
      redisMulti = redisMulti.srem(ROOM_CLIENT_SET_PREFIX + '{' + nspAndRoom + '}', socket.id);
      if (socket.handshake.platform == 'ios') {
        redisMulti = redisMulti.srem(IOS_ROOM_CLIENT_SET_PREFIX + '{' + nspAndRoom + '}', socket.id);
      } else if (socket.handshake.platform == 'android') {
        redisMulti = redisMulti.srem(ANDROID_ROOM_CLIENT_SET_PREFIX + '{' + nspAndRoom + '}', socket.id);
      }

      try {
        await redisMulti.exec();
      } catch (e) {
        logger.error('delAll error ' + e);
      }
    }
  }


  await redis_db.srem(CLIENT_SET_PREFIX + nspName, socket.id);
  await redis_db.hmset(config.redis_client_hash_prefix + socket.id, {
    last_disconnect_time: (new Date()).getTime()
  });

  //删除连接
  self.sids.delete(socket.id);
  //清除空房间
  if (mapId !== undefined) {
    for (let room of mapId.keys()) {
      let mapRoom = self.rooms.get(room);

      if (mapRoom === undefined || mapRoom.size <= 0) {
        self.rooms.delete(room);
        unsubscribeRooms.push(room);
        await deleteRoom(self, room);
      }
    }
  }

  //广播下线通知
  if (config.room_activity_broadcast && socket.handshake.query.activityBroadcast) {
    roomList.forEach(function (room) {
      self.nsp.in(room);
    });
    self.nsp.except = [socket.id];
    self.nsp.emit('peopleLeave', {
      sid: socket.id,
      uuid: socket.handshake.query.uuid,
      userid: socket.handshake.query.userid,
      rooms: roomList,
      clientOffline: true
    });
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
        redis_db.hincrby(config.redis_push_msg_id_prefix + packet.data[1].id, 'onlineClientCount', onlineClientCount, function (err) {
          err && logger.error(' message: ' + packet.data[1].id + ' hincrby onlineClientCount error ' + err);
        });
      }
    }

  });
};

async function deleteRoom(self, room) {
  let nspName = self.nsp.name;

  let clientCount = await redis_db.scard(ROOM_CLIENT_SET_PREFIX + '{' + nspName + '_' + room + '}');

  if (clientCount > 0) return;

  if (!USER_ROOM_PREFIX_REG.test(room)) {
    await redis_db.srem(ROOM_SET_PREFIX + nspName, room);
  } else {
    let userName = room.replace(USER_ROOM_PREFIX_REG, '');

    let rooms = await redis_db.smembers(USER_ROOM_SET_PREFIX + nspName + '_' + userName);

    for (let i = 0; i < rooms.length; i++) {
      await redis_db.srem(ROOM_USER_SET_PREFIX + nspName + '_' + rooms[i], userName);
    }

    await redis_db.del(USER_ROOM_SET_PREFIX + nspName + '_' + userName);
    await redis_db.srem(USER_SET_PREFIX + nspName, userName);

  }
}





