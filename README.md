### 概述
轻量级推送服务和实时在线监控平台，同时用于开发即时通信系统，基于node的socket.io，支持web、android、ios客户端，支持移动端离线推送，可进行分布式部署

### 前言
随着互联网网速的不断提升，即时消息通信的应用场景越来越多。我在参与公司多个产品的研发中，不止一次的遇到需要集成聊天功能的需求。既然是聊天就必须把消息尽快送达目标用户，做的多了就有了一套自己的经验和想法，然后借着闲暇时间一点点的就写出了这个项目。这个项目灵感来源于实际开发工作，同时又把它应用到自己的工作中。希望它能帮到你，也希望你能给我更多的反馈和改进意见，让它帮助更多的人。

<img src="https://raw.githubusercontent.com/liutian/light-push-admin/master/doc/manual-1.gif" />

### 系统概要和功能特性
- 业务系统通过`restful`接口方式调用推送服务
- 客户端通过`socket.io`协议与推送服务建立连接
- 通过命名空间对客户端进行安全隔离和管理，不同客户端之间不能相互收发消息，如果业务系统是saas模式，命名空间相当于公司或组织的概念
- 使用负载均衡器来负责每一个客户端的接入工作，每一个客户端随机分配给一个推送服务的后端节点，保证推送服务的负载更加平均(负载均衡器指类似nginx的服务)
- 单个客户端和推送服务建立强关联，即一旦客户端与推送服务的某个节点建立连接，除非客户端下线否则所有数据处理和操作都有该节点完成，同时保证会话信息不丢失，可实现多机多进程部署
- 使用`redis`保存系统运行时所需的数据，保证系统响应速度
- 可实现单个用户多端连接，满足聊天系统多端登陆需求
- 通过界面UI或者接口来监控，统计客户端在线信息
- 通过界面UI模拟客户端上线/下线
- 通过界面UI模拟推送功能
- 模拟网络异常下推送服务已经推送消息但是客户端无法接收的情况，方便客户端编写数据同步功能
- 通过界面UI或者接口统计消息到达率(需要客户端ack确认回执)
- 可查询历史消息，可统计每天的推送总量，以及当前小时/当前分钟的推送总量
- 当客户端未收到推送消息时，如果客户端为`ios`平台则用`apns`做离线推送，如果是`android`会保存该消息直到客户端上线
- 监听每一个客户端接入事件并可回调业务系统，由业务系统决定客户端是否有权接入
- 监听每一个用户的离线事件并可回调业务系统
- 客户端房间变动事件可选择性的广播推送到对应的房间中
- 客户端可主动推送消息，满足聊天系统中正在输入中的功能需求（正常情况的推送应有业务系统发起，保障推送服务的安全和稳定）
- 可为每一个客户端保存一些特殊数据，比如最后一次的接入信息，客户端操作系统信息等等，同时提供一键清除僵尸客户端功能(一定时间未接入过推送服务器)
- 推送服务本身支持cors跨域访问，方便基于推送服务来开发管理界面
- 采用消息队列方式推送离线消息，保证系统在高并发下的稳定性
- 服务运行时的各个参数可自行配置，比如消息默认失效时间，房间名最大长度等等

### 快速体验
- `docker run -id -p 443:443 --name light-push-demo liuss/light-push:<version> /mnt/data/start.sh` 需要将 `version` 改成对应的版本号
- 访问管理页面: `https://127.0.0.1` 登录名 admin 密码 123456  勾选管理员选项
- [在线体验](https://39.104.57.212:55555)

### 客户端调用(web)
```
// demo: 命名空间；uuid: 客户端唯一标示；userid: 客户端所属的用户ID
let socket = io.connect('https://127.0.0.1:55555/demo?uuid=' + uuid + '&userid=' + userid, {
  path: '/push/socket.io/'
});

socket.on('connect', function () {
  // 客户端主动加入房间
  socket.emit('joinRoom', ['room1'], function (result) {
    console.log('joinRoom:' + JSON.stringify(result));
  });

  // 接收服务器端的推送消息
  socket.on('push', function (data) {
    console.log('push:' + JSON.stringify(data));
    // 消息确认回执
    socket.emit('ackPush', { id: data.id });
  });

  // 客户端主动离开房间
  socket.emit('leaveRoom', ['room2'], function (result) {
    console.log('leaveRoom:' + JSON.stringify(result));
  });
});
```


### 环境搭建
- 安装 `nodejs` (需要超级管理员权限) [详情](https://nodejs.org/en/download/package-manager/#freebsd-and-openbsd)
```
curl --silent --location https://rpm.nodesource.com/setup_10.x | sudo bash -
sudo yum install -y nodejs
```
- 安装pm2，如果安装中报错或者长时间没有响应 尝试通过第三方镜像安装 例如： `npm install -g pm2 --registry=https://registry.npm.taobao.org`
```
sudo npm install -g pm2
```
- 安装redis 5.0 以上版本 [官网](http://redis.io/download) [安装步骤](http://blog.csdn.net/zhenzhendeblog/article/details/52161515)
>`src/config.yaml` 中的 `redis_address` 用来配置redis服务器地址 ， 如果redis是集群模式，则将该配置改为数组类型
- 安装nginx集群部署时需要，[yum源](http://nginx.org/en/linux_packages.html#RHEL-CentOS)
```
yum install nginx
```
- 系统初始化之后，需要调用 `/api/admin/namespace/save` 接口来生成一个命名空间，客户端通过这个命名空间连接服务器；每个客户的必须有一个所属的命名空间才能连接服务器，否则服务器会拒绝客户端的所有请求

- 集群部署`nginx`方案，请参考 `doc/nginx.conf` ；`redis`配置,请参考 `doc/redis.conf`；`node`单机集群`pm2`方案配置，请参考`app.json`，[pm2使用说明](https://github.com/Unitech/pm2)

- 通过`node`命令启动服务，则端口配置见 `src/config.yaml` ， `connector_port` : 连接服务器； `logic_port` : 接口服务器；如果通过`pm2`方式启动，则`app.json` 中 `args` 有 `-p` 参数，则会覆盖 `src/config.yaml` 中端口配置

### 性能调优
详情见 `doc/performance.md`

### 客户端模拟测试
- 执行测试：`nohup node --max-old-space-size=3000 benchmark.js >> test1.log 2>&1 &`
- 根据具体情况调整 `test/benchmark.yaml` 测试配置，主要调整的参数：server，push_option_path，client_namespace，client_total，client_uuid_init
- 配置参数 `client_uuid_init` 需要在每次启动测试实例时手动修改，一般为现有在线客户端数 + `client_total`
- 开始测试之前需要手动修改 `/etc/sysctl.conf` ,增加如下配置
  ```
  fs.file-max=100000
  fs.nr_open=100000
  net.ipv4.ip_local_port_range=1024 65000
  ```
- 在推出测试终端时必须通过 `exit` 命令退出，否则后台测试进程会被系统kill

### 并发测试
- 安装测试工具 `yum install httpd-tools -y`
- 执行测试见 `test/ab.txt`
- 根据情况修改测试请求内容 `test/ab_post`

### 其他

> 接口说明和注意事项见[wiki](https://github.com/liutian/light-push/wiki)

> 推送服务控制台项目 [地址](https://github.com/liutian/light-push-admin)

> 配套ios [演示项目](https://github.com/visionetwsk/WSK_iOS_SDK_Demo) [SDK](https://github.com/visionetwsk/WSK_iOS_SDK)

> 配套android [SDK](https://bintray.com/visionetwsk/wskcss/wsk_sdk/1.1.1)

> QQ技术交流群 [643889498](https://jq.qq.com/?_wv=1027&k=5WHk8ay)
