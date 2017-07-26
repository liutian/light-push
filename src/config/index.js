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

  return config[e];
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
