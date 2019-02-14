### 推送服务单机保持客户端连接的最高值限定为c300k，服务器配置为16核32G内存

### 系统调优

`/etc/sysctl.conf` 保存系统级别资源限制
- `fs.file-max=1000000` 整个系统可以同时打开的最大文件数
- `fs.nr_open=1000000` 单个进程可以同时打开的最大文件数，如果该值大于系统默认的1048576，需要强制重启系统
- `net.ipv4.ip_local_port_range=1024 65000` 表示用于向外连接的端口范围，对外提供请求的服务端不用考虑端口数量问题，只要监听某一个端口即可。可客户端要模拟大量的用户对服务端发起TCP请求，而每一个请求都需要一个端口，为了使一个客户端尽可能地模拟更多的用户，也就要使客户端拥有更多可使用的端口。
- `net.ipv4.tcp_tw_reuse=1` 表示是否允许重新应用处于TIME-WAIT状态的socket用于新的TCP连接。TIME_WAIT意味着连接本身是关闭的，但资源还没有释放。
- `net.ipv4.tcp_max_tw_buckets=5000` 允许TIME-WAIT套接字数量的最大值。超过些最大值，TIME-WAIT套接字将立刻被清除同时打印警告信息。过多的TIME-WAIT套接字会使系统变慢
- `net.ipv4.tcp_fin_timeout=5` 对于本端断开的socket连接，TCP保持在FIN-WAIT-2状态的时间。对方可能会断开连接或一直不结束连接或不可预料的进程死亡
- `net.ipv4.tcp_keepalive_intvl=10` 探测消息未获得响应时，重发该消息的间隔时间（秒）。默认值为75秒。 (对于普通应用来说,这个值有一些偏大,可以根据需要改小.特别是web类服务器需要改小该值)
- `net.ipv4.tcp_keepalive_time=60` TCP发送keepalive探测消息的间隔时间（秒），用于确认TCP连接是否有效，防止两边建立连接但不发送数据的攻击
- `net.ipv4.tcp_syncookies=1` 开启SYN Cookies，当出现SYN等待队列溢出时，启用cookies来处理
- `net.core.netdev_max_backlog=10000` 每个网络接口接收数据包的速率比内核处理这些包的速率快时，允许送到队列的数据包的最大数目
- `net.core.somaxconn=10000` 当一个请求（request）尚未被处理或建立时，他会进入backlog。而socket server可以一次性处理backlog中的所有请求，处理后的请求不再位于监听队列中。当server处理请求较慢，以至于监听队列被填满后，新来的请求会被拒绝
- `net.ipv4.tcp_max_syn_backlog=10000` 增大该值可以容纳更多等待连接的网络连接数
- `net.ipv4.tcp_synack_retries=1` 对于远端的连接请求SYN，内核会发送SYN ＋ ACK数据报，以确认收到上一个 SYN连接请求包。这是所谓的三次握手( threeway handshake)机制的第二个步骤。这里决定内核在放弃连接之前所送出的 SYN+ACK 数目
- `net.ipv4.tcp_syn_retries=1` 表示在内核放弃建立连接之前发送SYN包的数量
- `net.ipv4.tcp_tw_recycle=1` 打开快速 TIME-WAIT sockets 回收功能，当tcp_tw_recycle 开启时（tcp_timestamps 同时开启，快速回收效果才能达到），对于位于NAT设备后面的 Client来说，是一场灾难！会导致到NAT设备后面的Client连接Server不稳定（有的 Client 能连接 server，有的 Client 不能连接 server）。也就是说，tcp_tw_recycle这个功能，是为内部网络（网络环境自己可控不存在NAT情况）设计的，对于公网环境下，不宜使用
- `vm.overcommit_memory=1` 表示内核允许分配所有的物理内存，而不管当前的内存状态如何，用于redis
> 修改完参数后，需要重启系统


`/etc/security/limits.conf` 保存每个用户或者用户组创建的每个进程，对系统资源的使用限制，需要小于 `fs.nr_open` 通常需要修改如下配置
```
root soft nofile 1000000
root hard nofile 1000000
* soft nofile 1000000
* hard nofile 1000000
```
> 修改配置文件需要重新登陆并重新启动进程才能生效

### nginx 调优
- `worker_processes` 配置nginx创建合适的进程数来提供服务（一般为cpu数量 -1 ）
- `events --> worker_connections 60000` 配置nginx每个进程可以接收的最大连接数
- `worker_rlimit_nofile 30000` 配置nginx每个进程可以打开的最大文件数
- `events --> use epoll` 用这个模型可以高效的处理异步事件
- `http --> keepalive_timeout 60` 功能是使客户端到服务器端的连接在设定的时间内持续有效，当出现对服务器的后继请求时，该功能避免了建立或者重新建立连接
- `http --> nodelay on` 告诉nginx不要缓存数据，而是一段一段的发送.当需要及时发送数据时，就应该给应用设置这个属性
> 切记 `worker_connections` 和 `worker_rlimit_nofile` 不宜过大，否则nginx在启动时会占用过多系统内存

### 监控
```
ss -s 显示概要信息
ss -tln 查看主机监听端口
ss -tlp 查看监听端口的程序名称
ss state <state-name> | wc -l 查看处于不同状态的连接总数
ss dst *:80 | wc -l 查看连接主机80端口的连接总数
```

