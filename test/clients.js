var yaml = require('js-yaml');
var argv = require('yargs').argv;
var fs = require('fs');
var inspect = require('util').inspect;
var socketClient = require('socket.io-client');


var CONFIG_PATH = './benchmark.yaml';
var config = yaml.safeLoad(fs.readFileSync(CONFIG_PATH));
config = argv.e ? config[argv.e] : config.default;

var roomTypeArr = [];
var clientCount = connectCount = receiveMsgCount = pushMsgCount = 0;
var clientIndex = config.client_start_index;


init();
connect();

function init() {
  var sendMsgTotalOdds = config.room_type_list.reduce(function (prev, curr) {
    return (Number.isInteger(prev) ? prev : prev.send_msg_odds) + curr.send_msg_odds;
  });

  config.room_type_list.forEach(function (item, index) {
    if (item.total < item.random_select_count) {
      throw new Error('room_type_list total must be greater than random_select_count');
    }
    item.sendMsgOddsStart = config.room_type_list[index - 1] ? config.room_type_list[index - 1].sendMsgOddsEnd : 0;
    item.sendMsgOddsEnd = item.sendMsgOddsStart + (item.send_msg_odds / sendMsgTotalOdds);

    var rooms = [];
    for (var i = 0; i < item.total; i++) {
      rooms.push(item.prefix + '_' + i);
    }
    roomTypeArr.push(rooms);
  });
}

function connect() {

  if (clientCount >= config.client_total) return;

  var clientUUID = config.client_prefix + clientIndex;
  var query = '?uuid=' + clientUUID + '&platform=' + config.client_platform;
  var socket = socketClient.connect(config.server + config.client_namespace + query, { 'force new connection': true });
  socket._info = query;

  socket.on('connect', function () {
    ++connectCount;

    console.log('connect  connectCount: ' + connectCount);

    setTimeout(function () {
      var rooms = [config.public_room];

      config.room_type_list.forEach(function (item, index) {
        var currRoomTypeArr = roomTypeArr[index];
        for (var i = 0; i < item.random_select_count; i++) {
          var room = currRoomTypeArr[parseInt(Math.random() * currRoomTypeArr.length)];
          if (rooms.indexOf(room) == -1) {
            rooms.push(room);
          } else {
            i--;
          }
        }
      });

      socket.roomList = rooms;
      socket.emit('joinRoom', rooms, function (result) {
        if (result.status != 200) {
          console.error('joinRoom error: ' + inspect(result));
        }

        clientCount++;
        clientIndex++;
        connect();
      });

    }, config.client_connect_interval * 1000);
  });

  socket.on('push', function (data, callback) {
    ++receiveMsgCount;

    console.log('receiveMsgCount : ' + receiveMsgCount);
    console.log('receiveMessage Data expectAckCount: ' + data.expectAckCount);

    socket.emit('ackPush', { id: data.id });
  });

  socket.on('ok', function (data) {
    console.log(socket._info + ' <---> ' + inspect(data));
  });

  socket.on('disconnect', function (e) {
    --connectCount;

    if (connectCount <= 0) {
      connectCount = 0;
    }

    console.error('disconnect connectCount:' + connectCount);
    console.error('disconnect error:' + inspect(e));
  });

}

