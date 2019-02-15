## 推送服务器镜像制作

### 制作基础镜像

1. 首先找一个干净的centos系统(以7.6为例)，并安装镜像制作工具 supermin
- `sudo yum install -y supermin5 supermin5-devel `
2. 基于当前系统进行编译
- `supermin5 -v --prepare yum -o supermin.d`
3. 基于编译进行构建
- `sudo supermin5 -v --build --format chroot supermin.d -o appliance.d`
4. 压缩构建目录
- `sudo tar --numeric-owner -cpf centos7-base.tar -C appliance.d . `
5. 将压缩文件导入docker
- `cat centos7-base.tar | sudo docker import - liuss/centos7-base`
6. 创建容器
- `sudo docker run -id --name centos7-base liuss/centos7-base /bin/bash`
7. 进入容器
- `sudo docker exec -it centos7-base /bin/bash`
8. 修改yum系统版本变量
- `echo 7 > /etc/yum/vars/releasever`
9. 安装epel源
- `yum install https://dl.fedoraproject.org/pub/epel/epel-release-latest-7.noarch.rpm -y && yum clean all` 或者下面
- `yum install -y epel-release && yum clean all`
1.  安装基本依赖,并新建 /etc/init.d/functions  文件
- `yum install -y bash coreutils lsof systemd vim-enhanced wget unzip make gcc-c++ `
11. 容器导出镜像
- `sudo docker export centos7-base -o centos7.tar`



### 制作推送服务器镜像

1. 导入基础镜像
- `sudo cat centos7.tar | sudo docker import - liuss/centos-7.6`
2. 创建容器
- `sudo docker run -id --name light-push --privileged liuss/centos-7.6 init`
3. 初始化系统必要组件
- `sudo docker cp /usr/sbin/ss light-push:/usr/sbin`
4. 进入容器
- `sudo docker exec -it light-push /bin/bash`
5. 初始化系统
- 设置时区 `cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && echo 'Asia/Shanghai' > /etc/timezone`
6. 安装nodejs
- `curl --silent --location https://rpm.nodesource.com/setup_11.x | bash - && yum install -y nodejs`
7. 安装pm2
- `npm install pm2 -g`
8. 安装nginx
- 添加nginx[yum源](http://nginx.org/en/linux_packages.html#RHEL-CentOS)
- `yum install -y nginx`
- `rm -rf /etc/nginx/conf.d/default.conf`
- 修改nginx配置文件(详情见项目doc/nginx)
9. 安装redis，并修改redis配置文件(后台运行，工作目录)
- `cd /usr/local/src && wget http://download.redis.io/releases/redis-5.0.3.tar.gz && tar xzf redis-5.0.3.tar.gz && cd redis-5.0.3 && make distclean && make && yum install -y tcl && make test && cp redis.conf /etc/redis.conf`
- 修改 `/etc/redis.conf` 配置如下
  ```
  bind 127.0.0.1
  daemonize yes
  logfile "/var/log/redis/6379.log"
  dir /mnt/data/db/redis
  ```
10. 创建目录
- `mkdir -p /var/log/redis && mkdir -p /mnt/data/code/server && mkdir -p /mnt/data/db/redis && mkdir -p /mnt/data/code/web && mkdir -p /mnt/data/nginx_web/light-push-admin `
11. 下载服务器端源码
- `cd /mnt/data/code && wget https://github.com/liutian/light-push/archive/master.zip && unzip master.zip -d server && rm master.zip`
12. 安装服务器端依赖
- `cd /mnt/data/code/server/light-push-master && npm install `
13. 下载web端源码
- `cd /mnt/data/code && wget https://github.com/liutian/light-push-admin/archive/master.zip && unzip master.zip -d web && rm master.zip`
14. 安装web端依赖并执行构建任务,将src/environment目录下文件中 api 字段ip地址改为自己服务器的ip地址,如果是本地允许docker镜像则不需要修改ip，默认为127.0.0.1
- `cd /mnt/data/code/web/light-push-admin-master && npm install && npm run build-docker && rm -rf /mnt/data/nginx_web/light-push-admin/*.* && cp -R dist/* /mnt/data/nginx_web/light-push-admin `
15. 编写启动服务的脚本 `/mnt/data/start.sh`
```
#!/bin/sh
/usr/sbin/nginx -c /etc/nginx/nginx.conf
/usr/local/src/redis-5.0.3/src/redis-server /etc/redis.conf
cd /mnt/data/code/server/light-push-master
/usr/bin/pm2 start app.json
/bin/bash
```
>修改权限 `chmod u+x /mnt/data/start.sh`
16. 开启服务 `/mnt/data/start.sh`
17. 验证服务 `curl http://127.0.0.1:21314/socket.io/socket.io.js`
18. 服务器端调优见 `doc/performance.md`
19. 导出镜像
- `sudo docker export light-push -o light-push.tar`
20. 导入镜像
- `sudo cat light-push.tar | sudo docker import - liuss/light-push:1.1.0`
21. 上传镜像到docker hub(需要先执行登录)
- `sudo docker push liuss/light-push:1.1.0`


### 基于推送服务器镜像创建容器
- `sudo docker run --restart=always -id -p 443:443 -p 80:80 -v ~/redis-db:/mnt/data/db/redis --name light-push-demo liuss/light-push:1.1.0 /mnt/data/start.sh`
- 调试web界面 `sudo docker run -id -p 443:443 -p 80:80 --name light-push-demo -v /home/docker/nginx_web:/mnt/data/nginx_web liuss/light-push /mnt/data/start.sh`
- 从宿主机拷贝文件到容器 `sudo docker cp ./dist light-push-demo:/mnt/data`
- 从容器拷贝文件到宿主机 `sudo docker cp light-push-demo:/mnt/data/dist ./`


