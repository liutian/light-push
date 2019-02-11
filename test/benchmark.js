const yaml = require('js-yaml');
const argv = require('yargs').argv;
const fs = require('fs');
const inspect = require('util').inspect;
const socketClient = require('socket.io-client');


const CONFIG_PATH = '/benchmark.yaml';
let config = yaml.safeLoad(fs.readFileSync(__dirname + CONFIG_PATH));
config = argv.e ? config[argv.e] : config.default;

const allRooms = [];
let clientCount = connectCount = receiveMsgCount = pushMsgCount = 0;
let clientUUID = config.client_uuid_init;


init();
connect();

function init() {

  (config.join_room_rule || []).forEach(function (item, index) {
    if (item.total < item.pick_count) {
      throw new Error('join_room_rule total must be greater than pick_count');
    }

    const rooms = [];
    for (let i = 0; i < item.total; i++) {
      rooms.push(item.prefix + '_' + i);
    }
    allRooms.push(rooms);
  });
}

function connect() {

  if (clientCount >= config.client_total) {
    console.log('create client over');
    return;
  }

  let uuid = config.client_uuid_prefix + clientUUID;
  const query = '?uuid=' + uuid + '&platform=' + config.client_platform;
  const socket = socketClient.connect(config.server + config.client_namespace + query, {
    'force new connection': true,
    path: config.push_option_path
  });
  socket._info = query.substr(1);

  socket.on('connect', function () {
    ++connectCount;

    console.log('connect  connectCount: ' + connectCount);

    setTimeout(function () {
      const joinRooms = [config.public_room];

      allRooms.forEach(function (rooms, index) {
        let rule = config.join_room_rule[index];
        for (let i = 0; i < rule.pick_count; i++) {
          let room = rooms[parseInt(Math.random() * rooms.length)];
          if (joinRooms.indexOf(room) === -1) {
            joinRooms.push(room);
          } else {
            i--;
          }
        }
      });

      socket.roomList = joinRooms;
      socket.emit('joinRoom', joinRooms, function (result) {
        if (result.status != 200) {
          console.error('joinRoom error: \n' + inspect(result));
        }

        clientCount++;
        clientUUID++;
        connect();
      });

    }, config.client_connect_interval * 1000);
  });

  socket.on('push', function (data, callback) {
    ++receiveMsgCount;

    console.log('receiveMsgCount : ' + receiveMsgCount);

    socket.emit('ackPush', { id: data.id });
  });

  socket.on('ok', function (data) {
    console.log(socket._info + ' ok \n' + inspect(data));
  });

  socket.on('disconnect', function (e) {
    --connectCount;

    if (connectCount <= 0) {
      connectCount = 0;
    }

    console.error('disconnect connectCount:' + connectCount);
    console.error('disconnect error: \n' + inspect(e));
  });

}

