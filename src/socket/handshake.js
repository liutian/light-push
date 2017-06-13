const request = require('request');
const log4js = require('log4js');

const config = require('../config');
const namespace = require('../base/namespace');
const logger = log4js.getLogger('handshake');

/**
 * 客户端连接服务器时url参数: uuid / [userid] / platform
 * @param socket
 * @param next
 * @returns {*}
 */
module.exports = function (socket, next) {
  const query = socket.handshake.query;
  let uuid = query.uuid;//客户端设备唯一标示
  let userid = query.userid;//用户id(与业务相关,如果不填则与uuid一致)
  let platform = query.platform;//平台类型: ios/android/web(默认)
  let nspName = socket.nsp.name;
  let nspData = namespace.data[nspName];

  if (nspName != '/' && !nspData) {
    socket.disconnect();
    return next(new Error('this namespace not found'));
  }

  //如果命名空间不是主命名空间,则uuid取同一个client下主命名空间socket的uuid,保证uuid以主命名空间下的socket为准
  if (socket.nsp.name != '/') {
    let indexSocket;
    for (let skey of Object.keys(socket.client.sockets)) {
      let s = socket.client.sockets[skey];
      if (s.nsp.name == '/') {
        indexSocket = s;
        break;
      }
    }
    if (indexSocket) {
      uuid = indexSocket.handshake.query.uuid;
      userid = indexSocket.handshake.query.userid;
      platform = indexSocket.handshake.query.platform;
    } else {
      socket.disconnect();
      return next(new Error('not found indexSocket'));
    }
  }

  //uuid必填用来确定设备与服务器之间的连接
  if (!uuid) {
    socket.disconnect();
    return next(new Error('uuid can not be empty'));
  } else if (!userid) {
    userid = uuid;
  }
  socket.handshake.uuid = uuid;
  socket.handshake.userid = userid;
  socket.handshake.platform = platform;

  uuid = (platform ? platform : 'web') + '-' + uuid;
  let newId = nspName + '#' + userid + '#' + uuid;
  socket._id = socket.id;//保存旧的socket.id
  //新的socket.id,以namespace + userid + platform + uuid为基准产生新的id,可以实现同一终端多用户在线
  //新的id由外界提供,保证和服务器无关,防止服务器意外宕机而无法清除和id相关的redis数据
  //保证socket.id与服务器没有关系(因为原来的socket.id是服务器生成的,如果同一个客户端与不同服务器连接保证socket是同一个)
  socket.id = newId;


  //同一个命名空间下不能有两个id一样的socket
  if (socket.nsp.sockets[newId]) {
    socket.nsp.sockets[newId].disconnect(true);
    logger.warn('socket.id conflict =====> ' + newId);
    // return next(new Error('socket.id conflict'));
  }

  if (nspName == '/' || !nspData.connect_callback) {
    return next();
  }

  let options = {
    url: nspData.connect_callback,
    method: 'get',
    json: true,
    headers: {
      cookie: socket.handshake.headers.cookie,
      authorization: nspData.callback_auth
    }
  }

  //上游服务器可以根据cookie来判断当前属于哪个用户(userid),同时可以返回该用户所在房间的列表(rooms)
  request(options, function (err, response, body) {
    if (err) {
      next(err);
    } else if (response.statusCode == 200) {
      if (!body) return next();

      if (body.userid) {
        socket.handshake.userid = body.userid;
      }

      if (_.isArray(body.rooms)) {
        socket.handshake.rooms = body.rooms;
      }

      next();
    } else {
      socket.disconnect();
      next(new Error('handshake fail statusCode: ' + response.statusCode));
    }
  });
}
