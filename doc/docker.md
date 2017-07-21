## 推送服务器镜像制作

### 制作基础镜像

1. 首先找一个干净的centos系统(以7.3为例)，并安装镜像制作工具 supermin
- `sudo yum install -y supermin*`
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
- `yum install -y epel-release && yum clean all`
10. 安装基本依赖,并新建 /etc/init.d/functions  文件
- `yum install -y bash coreutils lsof systemd vim-enhanced wget unzip make gcc-c++ `
11. 容器导出镜像
- `sudo docker export centos7-base -o centos7.tar`



### 制作推送服务器镜像

1. 导入基础镜像
- `sudo cat centos7.tar | sudo docker import - liuss/centos7`
2. 创建容器
- `sudo docker run -id --name push --privileged liuss/centos7 init`
3. 进入容器
- `sudo docker exec -it push /bin/bash`
4. 安装nodejs
- `curl --silent --location https://rpm.nodesource.com/setup_8.x | bash - && yum install -y nodejs`
5. 安装pm2
- `npm install pm2 -g`
6. 安装nginx，并修改nginx配置文件(详情见项目doc/nginx)
- `yum install -y nginx`
7. 安装redis，并修改redis配置文件(后台运行，工作目录)
- `wget http://download.redis.io/releases/redis-4.0.0.tar.gz && tar xzf redis-4.0.0.tar.gz && cd redis-4.0.0 && make && make install && cp redis.conf`
8. 创建目录
- `mkdir -p /root/push/code/server && mkdir -p /root/push/db/redis && mkdir -p /root/push/code/web && mkdir -p /home/web/push-admin && chown -R nginx:nginx /home/web/push-admin`
9. 下载服务器端源码
- `cd /root/push/code && wget https://github.com/liutian/push/archive/master.zip && unzip master.zip -d server && rm master.zip`
10. 安装服务器端依赖
- `cd /root/push/code/server/push-master && npm install `
11. 下载web端源码
- `cd /root/push/code && wget https://github.com/liutian/push-admin/archive/master.zip && unzip master.zip -d web && rm master.zip`
12. 安装web端依赖并执行构建任务,将src/environment目录下文件中 api 字段ip地址改为自己服务器的ip地址 
- `cd /root/push/code/web/push-admin-master && npm install && npm run build && rm -rf /home/web/push-admin/*.* && cp -R dist/* /home/web/push-admin && chown -R nginx:nginx /home/web/push-admin`
13. 启动项目
- `systemctl start nginx && redis-server /etc/redis.conf && cd /root/push/code/server/push-master && pm2 start app.json`
14. 开机自启动,修改/etc/rc.local 新增 命令： `redis-server /etc/redis.conf`  `cd /root/push/code/server/push-master && pm2 delete all && pm2 start app.json`
- `systemctl enable nginx.service`
15. 导出镜像
- `sudo docker export push -o push.tar`


### 基于推送服务器镜像启动容器
1. 导入镜像
- `sudo cat push.tar | sudo docker import - liuss/push`
2. 创建容器
- `sudo docker run -id -p 80:80 --name push --privileged liuss/push init`
3. 进入容器
- `sudo docker exec -it push /bin/bash`
4. 启动服务[可选]
- `systemctl start nginx && redis-server /etc/redis.conf && cd /root/push/code/server/push-master && pm2 start app.json`



