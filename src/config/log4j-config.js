let path = require('path');
let log4j = require('log4js');

const config = require('./index');
const log4jConfig = require('./log4j-config.json');

/**
 * log4j-config.json 中 filename 不能以 / 开头
 * 配置文件中的 log_path 要么是绝对路径要么是相对项目根目录 或者什么都不填
 */
Object.keys(log4jConfig.appenders).forEach(function (key) {
  let appender = log4jConfig.appenders[key];
  if (!appender.filename) return;

  let separatorIndex = appender.filename.lastIndexOf('/');
  if (separatorIndex != -1) {
    let arr = Array.from(appender.filename);
    arr.splice(separatorIndex + 1, 0, 'logic_' + config.port + '_');
    appender.filename = arr.join('');
    if (config.log_path) {//默认路径为程序入口主文件所在目录
      appender.filename = path.resolve(config.log_path + '/' + appender.filename);
    }
  }
});

log4j.configure(log4jConfig);
