
exports.codeMap = {
  code_9999: '服务器端错误'
}

exports.throw = function throwFn(msg, status = 400) {
  let error = new Error();
  if (typeof msg == 'number') {
    error.message = '{"code": ' + msg + ',"msg": "' + exports.codeMap['code_' + msg] + '"}';
  } else {
    error.message = '{"code": 9999,"msg": "' + msg + '"}';
  }
  error.status = status;
  error.expose = true;
  throw error;
}
