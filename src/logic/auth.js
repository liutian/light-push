const Base64 = require('js-base64').Base64;

const config = require('../config');
const namespace = require('../base/namespace');

exports.normal = normalFn;
exports.admin = adminFn;


//*******************************************************************


async function normalFn(ctx, next) {
  let authorization = ctx.get('authorization');
  if (!authorization) {
    ctx.throw(400, 'need authorization');
  }

  if (authorization.indexOf('Basic ') === 0) {
    authorization = authorization.substr(6);
  }
  let auth = Base64.decode(authorization);
  let nspKey = auth.split(':')[0];
  let nspPasswd = auth.split(':')[1];

  let nspData = namespace.data[nspKey];
  if (!nspData) {
    ctx.throw(400, 'namespace not found');
  } else if (nspData.auth_passwd != nspPasswd) {
    ctx.throw(401, 'passwd error');
  } else {
    ctx.state.namespace = nspKey;
    await next();
  }
}

async function adminFn(ctx, next) {
  let authorization = ctx.get('authorization');
  if (!authorization) {
    ctx.throw(400, 'need authorization');
  }

  if (authorization.indexOf('Basic ') === 0) {
    authorization = authorization.substr(6);
  }
  let auth = Base64.decode(authorization);
  let name = auth.split(':')[0];
  let passwd = auth.split(':')[1];

  if (config.admin_name != name || config.admin_passwd != passwd) {
    ctx.throw(401, 'auth error');
  } else {
    await next();
  }
}
