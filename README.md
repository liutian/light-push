#push
Push service based on Web Technology such as `polling` or `webSocket`

#Quickstart
```
$ git clone https://github.com/liutian/push.git
$ cd push
$ npm install
$ pm2 start app.json
```

> 如果 `npm install` 长时间没有响应 直接解压 `node_modules.zip` 也可以

> 如果启动有问题请检查启动日志 `pm2 logs`

###架构概述
- 客户端通过socket.io协议访问服务器并建立持久连接(长链接或者websocket),服务器会通过几个纬度(命名空间,房间,用户)对客户端进行分类管理
- 服务器还可以和第三方服务器进行相互的接口调用
- 服务器分为连接服务器(connector-x)，接口服务器(logic-x)，延迟消息处理服务器(worker-message-x),
连接服务器用来实时处理消息,接口服务器用来提供restful接口供第三方服务器调用，延迟消息服务器用来处理消息离线保存和apns推送，端口配置请查看 `app.json`
- 系统通过redis保存所有数据包括客户端信息,消息等


###环境搭建
- nodejs `curl --silent --location https://rpm.nodesource.com/setup_8.x | sudo bash -`  `sudo yum install -y nodejs` (需要超级管理员权限) 然后看输出说明  [详情](https://nodejs.org/en/download/package-manager/#freebsd-and-openbsd)
- pm2 `npm install -g pm2`  如果安装中报错或者长时间没有响应 尝试通过镜像安装 例如： `npm install -g pm2 --registry=https://registry.npm.taobao.org`
- redis 3.0 以上版本 [官网详情](http://redis.io/download) [安装步骤](http://blog.csdn.net/zhenzhendeblog/article/details/52161515)
 `src/config.yaml` 中的 `redis_address` 用来配置redis服务器地址 ， 如果redis是集群模式，则将该配置改为数组类型
- nginx 非必需，如果需要集群部署服务时才需要； [yum源](http://nginx.org/en/linux_packages.html#stable) `yum install nginx`

> 系统初始化之后，需要调用 `/api/admin/namespace/save` 接口来生成一个命名空间，客户的通过这个命名空间连接服务器，
每个客户的必须有一个所属的命名空间才能连接服务器，否则服务器会拒绝任何没有命名空间的客户端的所有请求

> 集群部署，nginx 参考 doc/nginx.conf 配置，redis  参考 doc/redis.conf 配置，node 单机集群 参考 app.json ， [pm2使用说明](https://github.com/Unitech/pm2)

> 端口配置 见 `src/config.yaml` 中端 `connector_port` : 连接服务器 `logic_port` : 接口服务器

> 如果 `app.json` 中 `args` 有 `-p` 参数，则会覆盖 `src/config.yaml` 中端口配置

###客户端连接服务器
```
var socket = io.connect('http://host:21314/<namespace>?[userid]=u001&<uuid>=edgw453&[platform]=ios');
```
- `namespace` : 命名空间,不同的命名空间下的客户端不能相互发消息,必填
- `userid` : 用户ID,系统支持单用户多端登陆,如果空则取uuid作为userid
- `uuid` : 客户端唯一标示,必填
- `platform` : 客户端平台类型,默认web
- `activityBroadcast` : (true|false)客户端每次上线下线时是否向它所在的房间发起一次广播  广播事件，下线: `peopleLeave` 上线: `peopleJoin` 事件参数: `sid` `uuid` `userid` `rooms` `clientOffline`

> android和ios平台只需要记住服务器链接地址,并将地址传递给相对应的接口就可以了

- 客户端连接服务器时,客户端信息会被更新,包括登陆时间和设备信息(需要客户端提供)
- 客户端链接服务器时,服务器会主动将客户端加入到对应的房间(或者由第三方服务器指定)中
- 如果是android客户端,则服务器会主动推送离线消息,客户端通过`offlineMessage`事件接收离线消息 数据格式为 `[{id: ...,room: ...,pushData: ...},...]`
- 每一个客户端至少有一个默认房间，房间名为 `user_` + `userid`
- 服务器在连接成功之后会发送 `ok` 事件客户端,并告诉客户端一些基本对服务器信息 `{system:<服务器系统信息>,port:<服务器端口>,clientId:<客户端ID>}`

###客户端加入/离开房间
```
socket.on('connect', function(){
    var rooms = ['r001','r002',...];
    socket.emit('joinRoom',rooms,callback);
    socket.emit('leaveRoom',rooms,callback);
});
```
请求参数:
- `rooms` : `[String]` 房间列表
- `callback` : `Function` 回调函数接收服务器的响应
返回值:
```
{status: 200,msg: 'ok'}
 或
{status: 500,msg: 'Error ....'}
```

###推送消息
第三方服务器
```
/api/auth/push POST
```
- 服务器会把消息保存到redis数据库中,同时设置过期时间

请求参数:
- `room` : `[String]` 接受消息的房间名 必填
- `pushData` : `[Object]` 推送数据 必填
- `apnsName` : `[String]` apns推送配置名称 如果为空则使用默认apns推送即：`/` 命名空间下 `apnsName` 为 `default` 的证书进行推送，所以如果想使用默认apns推送需要保证 `/` 命名空间存在，同时 `apnsName` 为空
- `leaveMessage` : `[Boolean]` 是否开启离线消息，针对 ios 平台就是是否开启 `apns` 推送，针对 android 平台就是是否保存为离线消息
- `except` : `[String]` 哪些客户端不需要收到推送，当不希望推送房间中某个客户端收到时有用
- `expire` : `[Number]` 每条消息的失效时间，单位小时
- `extra` : `[String]` 额外字段，当值为`lost`时，服务器会放弃推送该条消息，但是数据会保留下来

> - 客户的接收到推送消息之后必须向服务器发送消息回执: `socket.emit('ackPush',{id: data.id});`
> - 如果 `apnsName` 不为空则 `pushData` 对象中需要 `apsData` 字段结构为 `apsData: {aps: {alert: '.....', ......}, .....}` 如果不是这样的结构 , 离线ios客户端将无法查看到推送的通知
> - 如果 `apnsName` 不为空同时  `pushData` 对象中没有 `apsData` 或者 `aps` , 则服务会提供默认值 `apsData: {aps: {alert: '通知'}}`
> - `aps`  参数说明请移步 [极光推送apns参数说明](http://docs.jiguang.cn/jpush/server/push/rest_api_v3_push/#notification)
或者 [ios开发官网](https://developer.apple.com/library/content/documentation/NetworkingInternet/Conceptual/RemoteNotificationsPG/Chapters/TheNotificationPayload.html#//apple_ref/doc/uid/TP40008194-CH107-SW1)


返回值: `Object`
- `id` : `[Number]` 推送消息的ID,递增
- `expectAckCount` : `[Number]` 能即时收到消息的客户端总数(预测可能和实际情况有偏差)

###客户端接收消息
```
socket.on('push',function(data){
    //如果为true则客户端必需发送回执消息
    socket.emit('ackPush',{id: data.id});
    ...
});
```
消息体:
- `id` : `[Number]` 消息ID
- `pushData` : `[any]` 推送数据
- `room` : `[String]` 推送的目标房间
- `sendDate` : `[Number]` 推送时间

###第三方服务器设置房间下的客户端apns消息免打扰
```
/api/auth/room-apns POST
```
请求参数:
- `room` : `[String]` 房间名称
- `add` : `[[String]]` 向免打扰列表添加房间名,类型为数组
- `remove` : `[[String]]` 从免打扰列表中删除房间名,类型为数组


###第三方服务器设置房间下所有客户端是否保存离线消息
```
/api/auth/room-leave-message POST
```
请求参数:
- `room` : `[String]` 房间名称
- `leaveMessage` : `[Boolean]` 是否保存离线消息


###ios客户端读取/设置apns消息免打扰
```
socket.emit('apns', data, callback)
```
请求参数:
- `{}` 获取免打扰的房间列表,以逗号分割的字符串列表 ; 格式 `"[房间名],[房间名],..."`
- `{"add": ["","",...]}` 向免打扰列表添加数据
- `{"remove": ["","",...]}` 从免打扰列表中删除数据
- 添加和删除操作可同时存在,删除优先级最高

> 注意该接口只是禁止apns服务器向ios客户端推送消息,如果客户端在线,服务器还是会将消息发送给客户端的,在线情况下的消息免打扰需要由客户端自行解决

###获取客户端信息
```
socket.emit('info', data, callback)
```
请求参数:
```
{}
```
返回值: `Object`
- `userid` : [String] 服务器根据url中的userid设置
- `last_connect_time` : [String] 最后一次的上线时间
- `last_disconnect_time` : [String] 最后一次下线的时间
- `update_date` : [String] 更新时间,该时间只有在客户端主动设置信息时才会更新
- `mobile` : [String] 客户端手机号
- `system` : [String] 客户端系统信息
- `device_token` : [String] ios设备device_token
- `no_send_apns` : [String] ios客户端消息免打扰列表
- `leaveMessage` : [String] 是否需要缓存离线消息

###设置客户端信息
```
socket.emit('info', data, callback)
```
请求参数:
- `clientId` : `[String]` 客户端ID 来源于 连接就绪后服务器 `ok` 事件发送过来的数据  通常情况下设置客户端信息不需要传递这个参数，服务器会根据当前连接自动获得，这个只在特殊情况下需要设置其它设备信息时有效
- `device_token` : `[String]` ios客户端用户登出前可以设置 `device_token` 为空字符串，这样服务器就不会在向该设备发送apns推送
- `mobile` : `[String]` 客户端手机号
- `system` : `[String]` 客户端系统信息
- `leaveMessage` : `[Boolean]` 是否需要存储离线消息(ios设置如果将该值为false,能达到device_token = ''一样的效果,也就是不会触发apns推送),设备每次接入服务器后，服务器都会强制将该值设置为 true



###客户端接收到其他消息
```
//客户端被动加入某个房间
socket.on('joinRoom',function(data){
    alert('joinRoom:' + data);
});
//客户端被动离开某个房间
socket.on('leaveRoom',function(data){
    alert('leaveRoom:' + data);
});
//其他客户端离开某个房间
socket.on('peopleJoin',function(data){
    alert('peopleJoin:' + data);
});
//其他客户端离开某个房间
socket.on('peopleLeave',function(data){
    alert('peopleLeave:' + data);
});
```

###查询推送报告
查询单个推送报告详情
```
/api/auth/report/push/:id?ackDetail GET
```
请求参数:
- `id` : `[Number]` 消息ID
- `page` : `[Number]` 查询整个命名空间下的推送消息时用到,当前第几页数据
- `size` : `[Number]` 查询整个命名空间下的推送消息时用到,当前页显示多少条数据
- `ackDetail` : `[Boolean]` 是否查询所有提交过确认回执的客户端ID
返回值: `[Object]`
返回结果:
- `id` : `[Number]` 消息ID
- `room` : `[String]` 推送的房间
- `namespace` : `[String]` 推送的命名空间
- `sendDate` : `[Number]` 推送日期
- `pushData` : `[String]` 推送数据,json字符串
- `onlineClientCount` : `[Number]` 即时推送到的客户端总数
- `ackCount` : `[Number]` 客户端确认回执总数包括ios/andorid/web
- `ackIOSCount` : `[Number]` ios客户端确认回执数
- `ackAndroidCount` : `[Number]` android客户端确认回执数
- `apnsName` : `[String]` apns名称，等于命名空间更新/创建接口中 `apns_list`  `name`
- `apnsEnv` : `[String]` apns推送环境，取值 `dev` | `production`
- `apnsCount` : `[Number]` apns推送次数
- `apnsSuccessCount` : `[Number]` apns成功推送的数量
- `ackIOSDetail` : `[String]` 提交过确认回执的ios客户端的ID
- `ackAndroidDetail` : `[String]` 提交过确认回执的android客户端的ID
- `ackWebDetail` : `[String]` 提交过确认回执的web客户端的ID


分页查询推送报告列表
```
/api/auth/report/push GET
```
请求参数:
- `page` : `[Number]` 当前第几页数据
- `size` : `[Number]` 当前页显示多少条数据
返回值: `[Array]`
返回结果: 见 `查询单个推送报告详情`

> 列表结构不返回 `ackIOSDetail` `ackAndroidDetail` `ackWebDetail` 三个字段

###统计在线信息
> 待续....


###邀请加入/踢人

第三方服务器
```
/api/auth/transfer POST
```
请求参数：

- `namespace` : `[String]` 命名空间,客户端调用可不填
- `sourceRooms` : `[Array[String]]` 源房间
- `targetRoom` : `[String]` 目标房间
- `type` : `String` 行为 `join` 或 `leave`

`返回值`：`空`

> 如果`type` 为 `join` 是将源房间中的所有客户端添加到目标房间，如果为 `leave` 是将源房间中的所有客户端从目标房间中移除掉，`targetRoom` 与 `sourceRooms` 可以相同，

###客户端与服务器握手
在客户端第一次连接服务器时，服务器会向第三方服务器发送验证请求，如果第三方服务器返回状态码为 `200` 验证通过，否则失败。

###与第三方服务器通讯
- 当客户端上线时会向第三方服务器发送请求并将客户端的cookie信息提供给第三方服务器
- 当客户端下线时会向第三方服务器发送请求并将客户端的cookie信息和http query提供给第三方服务器
> 客户端的cookie信息指的是客户端和服务器进行握手时所发送的http请求中的cookie信息
> http query 信息指的是客户端和服务器进行握手时所发送的http请求中的链接参数: `http://host:21314/<namespace>?[userid]=u001&uuid=edgw453&[platform]=ios` 中 `?` 后面的信息

###查询单个客户端信息
第三方服务器
```
/api/auth/client/:id GET
```
请求参数:
- `id` : `[String]` 客户端uuid
返回值: `[Object]`
- `userid` 用户ID
- `first_connect_time` 首次接入的时间
- `last_connect_time` 最后一次上线的时间
- `last_disconnect_time` 最后一次下线的时间
- `system` 客户端操作系统信息
- `mobile` ios/android客户端的手机号
- `device_token` 只有ios客户端有这个字段,用于apns推送
- `no_send_apns` 只有ios客户端有这个字段,表示是否禁用apns推送

###获取命名空间信息
第三方服务器
```
/api/auth/namespace GET
```
返回值: `[Object]`
- `key` 命名空间
- `name` 命名空间描述
- `connect_callback` 客户端上线后向第三方服务器发送请求的地址
- `disconnect_callback` 客户端下线后向第三方服务器发送请求的地址
- `callback_auth` 当向第三方服务器发送请求时提交给第三方服务器的校验信息(采用HTTP Basic Auth校验)
- `auth_passwd` 命名空间密码
- `apns_list` apns配置项列表 数组类型
- `update_date` 更新时间
- `client_ip` 更新命名空间的第三方服务器地址
- `offline` 是否离线，on|off 如果为 on 则不接入任何客户端连接

`apns_list` : `[Array]` 数组中的元素结构如下
- `name` apns配置名称 和推送接口的 `apnsName` 参数对应
- `apns_expiration` apns消息推送过期时间
- `apns_topic` apns推送的topic
- `apns_env` apns推送环境 和推送接口的 `apnsEnv` 参数对应 `dev` 开发环境 `production` 生产环境
- `apns_production_cert` apns生产推送接口证书文件内容
- `apns_production_key` apns生产推送接口证书文件内容
- `apns_dev_cert` apns开发推送接口证书文件内容
- `apns_dev_key` apns开发推送接口证书文件内容
- `token_key` apns推送,token认证方式中的 `key`
- `token_keyId` apns推送,token认证方式中的 `keyId`
- `token_teamId` apns推送,token认证方式中的 `teamId`
- `del` `Boolean` 是否删除apns配置项,该字段只有在更新命名空间下配置项列表的时候用到

> apns推送时，如果有 `token_key` 则以 token 方式做推送认证

###删除指定的命名空间相关的数据
第三方服务器
```
/api/admin/namespace/del/:key?flushAll=true GET
```
请求参数
- `key` 命名空间
- `flushAll` 是否删除命名空间本身数据

###命名空间列表
第三方服务器
```
/api/admin/namespace/list GET
```
返回结果 `[Array[Object]]` 详情见获取命名空间信息接口

###新建或者更新命名空间
第三方服务器
```
/api/admin/namespace/save POST
```
请求参数见获取命名空间信息接口
> 参数 `key` 必填,如果服务器根据key查询不到命名空间信息则认为是新建操作否则为更新操作

###清除命名空间相关的实时数据防止实时统计数据有误差
第三方服务器
```
/api/admin/namespace/clear-realtime-data POST
```
请求参数见获取命名空间信息接口
> 参数 `namespace` 必填,命名空间

###清除长时间不登陆的客户端
第三方服务器
```
/api/admin/clear-legacy-client POST
```
请求参数见获取命名空间信息接口
> 参数 `namespace` 必填,命名空间

返回结果为删除的客户端ID列表




###接口规范
- 凡是提供给第三方服务器可以调用的接口都需要经HTTP Basic Auth校验
- 第三方服务器必须在请求header中追加 `Authorization` 字段 , 字段的值需要 base64 加密
- `/api/auth` 开头的接口 `Authorization` 字段值为 `namespace:auth_passwd`
- `/api/admin` 开头的接口 `Authorization` 字段值为 `admin_name:admin_passwd` ; 字段 `admin_name` `admin_passwd` 在 `config.yaml` 中配置
- 所有接口提到的namespace一律加 `/` 前缀



### APNs 客户端证书生成
```
openssl pkcs12 -in key.p12 -clcerts -nokeys -out cert.pem -nodes
openssl pkcs12 -in key.p12 -nocerts -out key.pem -nodes
```
> 检验证书是否正确的方法：
> $ telnet gateway.sandbox.push.apple.com 2195
> Trying 17.172.232.226…
> Connected to gateway.sandbox.push-apple.com.akadns.net.
> Escape character is ‘^]’.
> 它将尝试发送一个规则的，不加密的连接到APNS服务。如果你看到上面的反馈，那说明你的MAC能够到达APNS。按下Ctrl C 关闭连接。如果得到一个错误信息，那么你需要确保你的防火墙允许2195端口。

> 然后再次连接，这次用我们的SSL证书和私钥来设置一个安全的连接：
> $ openssl s_client -connect gateway.sandbox.push.apple.com:2195
> -cert cert.pem -key key.pem
> Enter pass phrase for key.pem:
> 你会看到一个完整的输出，让你明白OpenSSL在后台做什么。如果连接是成功的，你可以键入一些字符。当你按下回车后，服务就会断开连接。如果在建立连接时有问题，OpenSSL将会给你一个错误消息，但是你不得不向上翻输出LOG，来找到它。

> 当然上面要测试prodution版本是否正确的话，把 `gateway.sandbox.push.apple.com` 换成 `gateway.push.apple.com` 就好。


### 安装运行环境
- [安装nodejs](https://nodejs.org/en/download/package-manager/) 版本 v8.2.1 以上
- 安装pm2 : `npm install -g pm2` 版本 v2.6.1 以上
- [安装redis](https://redis.io/download) 版本 4.0.0 以上

### 通过docker快速构建整个推送服务
- `docker run -id -p 80:80 443:443 --name push-demo liuss/push /root/push/start.sh`
- 访问管理页面: `http://127.0.0.1/push-admin` 登录名 liuss 密码 123456  勾选管理员登陆

### 如何避免因网络不稳定造成的影响
- 每次发送消息后延迟5s(清除旧的定时器创建新的定时器，保证只有一个最新的定时器)，验证发送的消息是否被对方接收，
  如果对方没有接收到，则该消息标记：“对方可能已离线，无法及时查看该消息” 或者 “消息发送异常” 或者 图标提示，
  当对方上线时清除标记（客服端实现即可）当接收到对方发来的任何消息时清除标记 (“客户” 端实现即可)   
- 消息计数器：客户端和服务器端都会对每一个会话维护一个消息计数器：对于客户端来说，当本地发送消息或者接收到推送的消息时进行+1(但不一定总是进行+1操作)；对于服务器端来说，只有当执行完推送消息并且成功时进行+1；当本地发送消息给服务器时，服务器会返回当前缓存中的消息计数器(注意不是回话真实的消息总数)，当服务器推送消息时也会附带当前缓存中的消息计数器(注意不是回话真实的消息总数)，推送成功之后将缓存中的计数器+1
- 本地客户端消息同步规则：
  ```
  let localData = {
    clientNum: 0,// 本地消息计数器
    msgList: [],// 本地消息列表
    syncMsgTimeout: null // 定时器
  }

  // 当客户端首次运行时，主动向后端请求消息计数器
  syncMsg('init', 0);

  // reason 发起同步的原因
  // timeout 执行同步的延迟时间
  // fetch 当本地计数器和服务器计数器不一致时，服务器是否需要返回最新的消息列表，只有首次执行为false，其他情况都为true
  function syncMsg(reason, timeout, fetch){
    // 清除定时器
    clearTimeout(localData.syncMsgTimeout);
    // 如果延迟执行则创建定时器
    if(timeout){
      localData.syncMsgTimeout = setTimeout(syncMsg, timeout, reason, 0, fetch);
      return;
    }

    let query = {
      fetch: fetch,
      reason: reason,
      clientNum: localData.clientNum
    }
    xhr.get(url, query, function(res){
      // 当本地计数器小于服务器计数器时说明本地网络不稳定，将连接模式降级为长连接
      if(localData.clientNum < res.serverNum){
        socket.io.opts.transports = ['polling'];
      }
      localData.clientNum = res.serverNum;
      // 当服务器返回最新数据时覆盖本地列表
      if(res.msgList.length > 0){
        localData.msgList = res.msgList;
      }
      // 每次执行完同步操作之后，开启下一次同步操作
      localData.syncMsgTimeout = setTimeout(syncMsg, 60000, 'tick', 0, true);
    })
  }

  // 发送消息
  function sendMsg(data){
    xhr.post(url, data, function(res){
      if(localData.clientNum < res.serverNum){
        syncMsg('sendMsg', 2000, true);
      }
      ++localData.clientNum;
    })
  }

  // 接收消息
  function onPush(data){
    if(localData.clientNum < data.serverNum){
      syncMsg('push', 2000, true);
    }
    ++localData.clientNum;
  }

  //当发生重连操作时切换连接模式
  socket.on('reconnect_attempt', () => {
    socket.io.opts.transports = ['polling'];
  })
  ```