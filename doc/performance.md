### 推送服务单机保持客户端连接的最高值限定为c300k，服务器配置为16核32G内存

### 系统调优

`/etc/sysctl.conf` 保存系统级别资源限制
- `fs.file-max=1000000` 整个系统可以同时打开的最大文件数
- `fs.nr_open=1000000` 单个进程可以同时打开的最大文件数，如果该值大于系统默认的1048576，需要强制重启系统
- `net.ipv4.ip_local_port_range=1024 65535` 表示用于向外连接的端口范围，对外提供请求的服务端不用考虑端口数量问题，只要监听某一个端口即可。可客户端要模拟大量的用户对服务端发起TCP请求，而每一个请求都需要一个端口，为了使一个客户端尽可能地模拟更多的用户，也就要使客户端拥有更多可使用的端口。

以下为可选配置：
- `net.core.somaxconn=2048` 当一个请求（request）尚未被处理或建立时，他会进入backlog。而socket server可以一次性处理backlog中的所有请求，处理后的请求不再位于监听队列中。当server处理请求较慢，以至于监听队列被填满后，新来的请求会被拒绝
- `net.core.rmem_default=262144` 接收套接字缓冲区大小的默认值
- `net.core.wmem_default=262144` 发送套接字缓冲区大小的默认值
- `net.core.rmem_max=16777216` 接收套接字缓冲区大小的最大值
- `net.core.wmem_max=16777216` 发送套接字缓冲区大小的最大值
- `net.ipv4.tcp_rmem=4096 4096 16777216`
- `net.ipv4.tcp_wmem=4096 4096 16777216`
- `net.ipv4.tcp_mem=786432 2097152 3145728`
- `net.core.netdev_max_backlog=10000` 每个网络接口接收数据包的速率比内核处理这些包的速率快时，允许送到队列的数据包的最大数目
- `net.ipv4.tcp_fin_timeout=5` 对于本端断开的socket连接，TCP保持在FIN-WAIT-2状态的时间。对方可能会断开连接或一直不结束连接或不可预料的进程死亡
- `net.ipv4.tcp_max_syn_backlog=10000` 增大该值可以容纳更多等待连接的网络连接数
- `net.ipv4.tcp_tw_reuse=1` 表示是否允许重新应用处于TIME-WAIT状态的socket用于新的TCP连接。TIME_WAIT意味着连接本身是关闭的，但资源还没有释放。
- `net.ipv4.tcp_max_orphans=131072`
- `net.ipv4.tcp_syncookies=1` 开启SYN Cookies，当出现SYN等待队列溢出时，启用cookies来处理
- `vm.overcommit_memory=1` 表示内核允许分配所有的物理内存，而不管当前的内存状态如何，用于redis
> 修改完参数后，需要重启系统
> 如果是通过docker方式启动服务，则宿主机也需要进行这些改动


`/etc/security/limits.conf` 保存每个用户或者用户组创建的每个进程，对系统资源的使用限制，需要小于 `fs.nr_open` 通常需要修改如下配置
```
root soft nofile 1000000
root hard nofile 1000000
* soft nofile 1000000
* hard nofile 1000000
```
> 修改配置文件需要重新登陆并重新启动进程才能生效
> 如果是通过docker方式启动服务，则宿主机也需要进行这些改动

### nginx 调优
- `worker_processes 3` 配置nginx创建合适的进程数来提供服务（一般为cpu数量 -1 ）
- `events --> worker_connections 100000` 配置nginx每个进程可以接收的最大连接数
- `http --> request_pool_size 1k` 每个请求分配的内存大小
- `http --> access_log off` 关闭访问日子记录
- `worker_rlimit_nofile 100000` 配置nginx每个进程可以打开的最大文件数
> 切记 `worker_connections` 和 `worker_rlimit_nofile` 不宜过大，否则nginx在启动时会占用过多系统内存

### 调优
```
ss -s #显示概要信息
ss -tln #查看主机监听端口
ss -tlp #查看监听端口的程序名称
ss state <state-name> | wc -l #查看处于不同状态的连接总数
ss dst *:80 | wc -l #查看连接主机80端口的连接总数
lsof -p <进程号> | wc -l #查看某个进程打开的文件总数
lsof -n|awk '{print $2}'|sort|uniq -c|sort -nr|more #统计所有进程打开的文件总数
dmesg | tail -n 100 #查看系统日志
```

### 待改进
针对大房间高频推送导致系统崩溃的问题，解决方案：
- 对 `Adapter.prototype.broadcast` 的执行时间进行后置检测，超过一定时间(3s)，定为该次推送为高危推送
- 将高危推送的房间缓存下来，并以执行时间*2创建定时器，并在定时器中执行清除缓存操作
- 在定时器执行之前如果遇到同样房间的推送，则清除之前的定时器创建新的定时器，当该次推送耗时3s以上则将该房间正式标记为高危房间，如果耗时没有超过3s则清楚缓存
- 正式标记为高危房间的推送在耗时T*3时间内进行延迟推送，并建立延迟推送队列
- 延迟队列中的推送都被以延迟T*2*index进行推送，同时延迟推送接触时间响应增加

