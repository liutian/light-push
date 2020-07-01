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
  let filename = appender.filename;

  if (!filename) return;

  if (config.log_prefix) {
    let separatorIndex = filename.lastIndexOf('/');

    if (separatorIndex != -1) {
      let arr = Array.from(filename);
      arr.splice(separatorIndex + 1, 0, config.log_prefix + '_');
      filename = arr.join('');
    } else {
      filename = config.log_prefix + '_' + filename;
    }
  }

  if (config.log_path) {//默认路径为程序入口主文件所在目录
    filename = path.resolve(config.log_path + '/' + filename);
  }

  appender.filename = filename
});


log4j.addLayout('json', function (config) {
  return function (logEvent) {
    const time = logEvent.startTime;

    const log = {
      timestamp: time.toISOString().substr(0, 10) + ' ' + time.toTimeString().substr(0, 8) + ':' + time.getMilliseconds(),
      level: logEvent.level.levelStr.toLowerCase(),
      project_name: 'oms4',
      category: logEvent.categoryName,
      msg: logEvent.data.join(' , ')
    }

    return JSON.stringify(log);
  }
});


log4j.configure(log4jConfig);

const logger = log4j.getLogger('console');
console.warn = logger.warn.bind(logger);
console.error = logger.error.bind(logger);
