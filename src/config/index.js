const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');

const _util = require('../util/util');

const env = require('yargs').argv;

/**
 * 首先读取默认配置文件，-e 代表启动环境 --local 代表读取额外的配置文件并覆盖对应配置
 * node index.js -e test --local liuss --config-var test
 * 上面的启动方式会读取配置文件中根级 test 并额外读取 config-liuss.yaml 配置文件
 * 同时还会将配置文件中的 'config-var' 赋值为test
 *
 */
module.exports = loadConfig(env);

function loadConfig(env) {
  let e = env.e ? env.e : 'default';
  let configStr = fs.readFileSync(path.resolve(__dirname + '/config.yaml'), 'utf-8');
  let config = yaml.safeLoad(configStr);
  let configLocal;
  let configLocalStr;

  if (!config[e]) throw new Error('config[' + e + '] is empty');

  //合并本地配置文件
  if (env.local) {
    try {
      configLocalStr = fs.readFileSync(path.resolve(__dirname + '/config-' + env.local + '.yaml'), 'utf-8');
      configLocal = yaml.safeLoad(configLocalStr);
      merge(config[e], configLocal[e]);

      console.warn('find config-' + env.local + '.yaml');
    } catch (e) {
      console.error('read config-' + env.local + ' fail');
    }
  }

  //合并命令行中的 env 变量
  for (let key in env) {
    if (key !== 'e' && key !== 'local') {
      config[e][key] = env[key];
    }
  }

  //port和ip为特殊配置只能通过环境变量获取
  config[e].port = env.p || env.port || config[e].port;
  config[e].ip = env.i || env.ip || config[e].ip;

  return Object.assign(config[e], defaultConfig());
}


function merge(source, custom) {
  for (let key in custom) {
    if (custom.hasOwnProperty(key)) {
      if (Array.isArray(custom[key]) || _util.isString(custom[key]) || _util.isDate(custom[key]) ||
        _util.isNumber(custom[key]) || _util.isBoolean(custom[key]) || _util.isRegExp(custom[key])) {
        source[key] = custom[key];
      } else if (_util.isObject(custom[key]) && _util.isObject(source[key])) {
        merge(source[key], custom[key]);
      }
    }
  }
}


function defaultConfig() {
  // 缓存键名简写对应表
  // p      push
  // msg    message 
  // t      total
  // c      client 
  // s      set
  // u      user 
  // r      room 
  // l      list 
  // h      hash 
  // a      android 
  // nsp    namespace
  // z      sorted set
  return {
    redis_push_msg_id_prefix: 'msg_h_',                                       //消息id的前缀
    redis_total_client_set_prefix: 't_c_s_',                                  //保存每个命名空间下历史客户端集合
    redis_total_client_sort_set_prefix: 't_c_z_',                             //保持每个命名空间下历史客户端以最后登陆时间距1970元年的天数为分数排列
    redis_client_set_prefix: 'c_s_',                                          //保存每个命名空间下的客户端集合
    redis_user_client_geo_prefix: 'u_c_g_',                                   //保存每个命名空间下的用户所有客户端坐标信息
    redis_user_set_prefix: 'u_s_',                                            //保存每个命名空间下的用户集合
    redis_total_all_room_set_prefix: 't_all_r_s_',                            //保存每个命名空间下历史房间集合(包括普通房间和用户类型的房间)        
    redis_room_set_prefix: 'r_s_',                                            //保存每个命名空间下的房间集合(只保存普通房间,不包括用户类型的房间)
    redis_user_room_set_prefix: 'u_r_s_',                                     //保存单个用户下的房间集合
    redis_room_user_set_prefix: 'r_u_s_',                                     //保存单个房间下的用户集合
    redis_push_message_list_prefix: 'msg_l_',                                 //保存每个命名空间下推送消息的id数组(根据push_message_list_max_limit保存有限的id)
    redis_push_message_temp_list_prefix: 'msg_temp_l_',                       //临时保存所有命名空间下推送的消息id列表,post_worker会通过redis的消息队列把对于的消息取出来进行处理
    redis_push_ack_set_prefix: 'ack_s_',                                      //保存推送确认报告的设备ID集合
    redis_push_msg_uuid: 'msg_uuid_int',                                      //保存消息自增id
    redis_client_hash_prefix: 'c_h_',                                         //保存单个客户端的信息
    redis_android_unread_message_list: 'a_unread_msg_l_',                     //保存每一个android设备未读的消息列表
    redis_total_client_all_room_set_prefix: 't_c_all_r_s_',                   //保存客户端曾经进入过的房间集合(包括用户房间)
    redis_message_stat_minute_prefix: 'm_s_m_int_',                           //保存每个命名空间下最近一小时内每分钟推送消息总数
    redis_message_stat_hour_prefix: 'm_s_h_int_',                             //保存每个命名空间下最近一天内每小时推送消息总数
    redis_message_stat_day_prefix: 'm_s_d_int_',                              //保存每个命名空间下最近一年内每天推送消息总数

    redis_namespace_key_z: 'nsp_z_',                                          //保存命名空间的列表
    //命名空间下配置项: key,name,apns_topic,apns_host,apns_port,apns_expiration,connect_callback,disconnect_callback,auth_passwd,callback_auth
    redis_namespace_set_prefix: 'nsp_s_',                                     //保存单个命名空间下的配置信息

    //这些键需要使用hash tag 保证集群环境下可以落到单一实例上,写代码的时候需要格外注意
    redis_room_client_set_prefix: 'r_c_s_',                                   //保存单个房间下在线的客户端集合(包括普通房间和用户类型的房间)
    redis_total_room_client_set_prefix: 't_r_c_s_',                           //保存单个房间下所有客户端集合(包括普通房间和用户类型的房间)
    redis_ios_room_client_set_prefix: 'i_r_c_s_',                             //保存单个房间下在线的ios客户端集合(包括普通房间和用户类型的房间)
    redis_total_ios_room_client_set_prefix: 't_i_r_c_s_',                     //保存单个房间下所有ios客户端集合(包括普通房间和用户类型的房间)
    redis_android_room_client_set_prefix: 'a_r_c_s_',                         //保存单个房间下在线的android客户端集合(包括普通房间和用户类型的房间)
    redis_total_android_room_client_set_prefix: 't_a_r_c_s_',                 //保存单个房间下所有android客户端集合(包括普通房间和用户类型的房间)

    redis_room_transfer_channel: 'room_transfer',                             //客户端被动进入或者离开房间时会触发redis的订阅频道   
    redis_home_broadcast_channel: 'home_broadcast',                           //发送消息时触发redis的订阅频道
    user_room_prefix: 'user_',                                                //用户类型的房间名前缀
    room_prefix: 'room_',                                                     //房间名前缀,只是做验证防止非法用户名，保持到redis时已经去除，作用不大

  }
}
