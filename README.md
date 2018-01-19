### 概述
轻量级推送服务和实时在线监控平台，基于node的socket.io，支持web、android、ios客户端，支持移动端离线推送，可大规模集群部署

### 前言
随着互联网网速的不断提升，实时消息的应用场景越来越多。我在参与公司多个产品的研发中，不止一次的遇到需要集成聊天功能的需求。既然是聊天就必须把消息尽快送达目标用户，做的多了就有了一套自己的经验和想法，然后借着闲暇时间一点点的就写出了这个项目。这个项目灵感来源于实际开发工作，同时又把它应用到自己开发工作中。希望它能帮到你，也希望你能给我更多的反馈和改进意见，让它帮到更多的人。

### 功能特性
- 业务系统通过`restful`接口方式调用推送服务
- 客户端通过`socket.io`协议和推送服务器建立连接
- 通过命名空间对客户端进行安全隔离和管理，不同客户端之间不能相互收发消息，如果业务系统是saas模式，命名空间相当于公司或组织的概念
- 使用负载均衡器来负责每一个客户端的接入工作，每一个客户端随机分配给一个后端服务，保证后端服务负载更佳平均(需要安装nginx)
- 单个客户端和后端服务建立强关联，会话信息不丢失，可实现多机多进程部署
- 使用`redis`保存相关数据，后端服务的整体响应速度更快
- 可实现单个用户多端连接，满足聊天系统多端登陆需求
- 通过界面或者接口来监控和统计客户端在线信息
- 通过界面模拟客户端上线/下线
- 通过界面模拟推送功能
- 模拟网络异常下的推送，方便客户端编写数据同步功能
- 通过界面或者接口统计消息到达率(需要客户端ack确认回执)
- 可查询历史消息，可统计每天的推送总量，以及当前小时/当前分钟的推送总量
- 当客户端未收到推送消息时，如果客户端为`ios`平台则用`apns`做离线推送，如果是`android`会保存该消息直到客户端上线
- 监听每一个客户端接入事件并可回掉业务系统由业务系统决定客户端是否有权接入
- 监听每一个用户的离线事件并可会掉业务系统
- 客户端房间变动事件可选择行的广播推送到对应的房间中
- 客户端可主动推送消息，满足聊天系统中正在输入中的功能需求
- 可为每一个客户端保存一些特殊数据，比如最后一次的接入信息，操作系统信息等等，同时提供一键清除僵尸客户端功能(一定时间未接入过服务器)
- 后端服务本身支持cors跨域访问
- 采用消息队列方式推送离线消息
- 服务运行时的各个参数可自行配置，比如消息默认失效时间，房间名最大长度等等

### 快速体验
- `docker run -id -p 443:443 --name push-demo liuss/push:<version> /mnt/data/start.sh` 需要将 `version` 改成对应的版本号
- 访问管理页面: `https://127.0.0.1` 登录名 demo 密码 123456  勾选管理员选项


### 环境搭建
- 安装 `nodejs` (需要超级管理员权限) [详情](https://nodejs.org/en/download/package-manager/#freebsd-and-openbsd)
```
curl --silent --location https://rpm.nodesource.com/setup_8.x | sudo bash -
sudo yum install -y nodejs
``` 
- 安装pm2，如果安装中报错或者长时间没有响应 尝试通过镜像安装 例如： `npm install -g pm2 --registry=https://registry.npm.taobao.org`
```
npm install -g pm2
```
- 安装redis 3.0 以上版本 [官网](http://redis.io/download) [安装步骤](http://blog.csdn.net/zhenzhendeblog/article/details/52161515)
>`src/config.yaml` 中的 `redis_address` 用来配置redis服务器地址 ， 如果redis是集群模式，则将该配置改为数组类型
- 安装nginx集群部署时需要，[yum源](http://nginx.org/en/linux_packages.html#stable)
```
yum install nginx
```
- 系统初始化之后，需要调用 `/api/admin/namespace/save` 接口来生成一个命名空间，客户端通过这个命名空间连接服务器；每个客户的必须有一个所属的命名空间才能连接服务器，否则服务器会拒绝任何没有命名空间的客户端的所有请求

- 集群部署，`nginx` 参考 `doc/nginx.conf` 配置，`redis`  参考 `doc/redis.conf` 配置，`node` 单机集群 参考 `app.json` ， [pm2使用说明](https://github.com/Unitech/pm2)

- 服务的端口配置 见 `src/config.yaml` ， `connector_port` : 连接服务器 `logic_port` : 接口服务器；如果 `app.json` 中 `args` 有 `-p` 参数，则会覆盖 `src/config.yaml` 中端口配置


> 接口说明和注意事项见[wiki](https://github.com/liutian/push/wiki)

> 配套ios [演示项目](https://github.com/visionetwsk/WSK_iOS_SDK_Demo) [SDK](https://github.com/visionetwsk/WSK_iOS_SDK)

> 配套android [SDK](https://bintray.com/visionetwsk/wskcss/wsk_sdk/1.1.1)
