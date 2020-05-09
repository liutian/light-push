const log4js = require('log4js');

const config = require('../config');
const redisFactory = require('../util/redis-factory');
const logger = log4js.getLogger('socket_transfer');

const redis_r_t_c = config.redis_room_transfer_channel;

//创建专门通道
const redis_sub = redisFactory.getInstance();
redis_sub.subscribe(redis_r_t_c, function (err, count) {
  if (err) logger.error('subscribe ' + redis_r_t_c + ' fail : ' + err);
});
redis_sub.on('message', redisMessage);


//*******************************************************************

/* 处理接收到的redis消息 */
function redisMessage(channel, data) {
  data = JSON.parse(data);

  if (channel === redis_r_t_c) {
    transferFn(data);
  }
}

function transferFn(data) {
  let namespace = global._ipush_ioApp.nsps[data.namespace];
  if (!namespace) {
    return;
  }

  let mapSid = namespace.adapter.unionSid(data.sourceRooms);
  let type = data.type == 'join' ? 'join' : 'leave';
  for (let sid of mapSid.keys()) {
    let socket = namespace.connected[sid];
    if (socket === undefined) return;

    let roomName = config.room_prefix + data.targetRoom;
    if ((data.type == 'join' && !socket.rooms[roomName]) || (data.type == 'leave' && socket.rooms[roomName])) {
      try {
        socket.emit(type + 'Room', data);
      } catch (e) {
        logger.error('socket emit ' + type + ' room error:' + e);
      }
    }

    try {
      socket[type](roomName);
    } catch (e) {
      logger.error('socket ' + type + ' room error:' + e);
    }

  }
}

