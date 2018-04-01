# Install Redis v3.2 on CentOS

#### Frist, update server and install toolchian.

```bash
sudo  yum update -y
sudo yum install -y gcc make
```



#### Download and install Redis

```bash
cd /usr/local/src
sudo wget http://download.redis.io/releases/redis-3.2.0.tar.gz
sudo tar xzf redis-3.2.0.tar.gzÍ
sudo rm -f 3.2.0.tar.gz

cd redis-3.2.0
sudo make distclean
sudo make

sudo yum install -y tcl
sudo make test

sudo mkdir -p /etc/redis /var/lib/redis /var/redis/6379
sudo cp src/redis-server src/redis-cli /usr/local/bin
sudo cp redis.conf /etc/redis/6379.conf
```



#### Configure Redis

```bash
sudo vim /etc/redis/6379.conf
<<<
  bind 127.0.0.1                                # line 61
  daemonize yes                                 # line 127
  logfile "/var/log/redis_6379.log"             # line 162
  dir /var/redis/6379                           # line 246
<<<
```



#### Download and install the init script.

```bash
sudo wget https://raw.githubusercontent.com/SAMZONG/light-push/doc/redis-server
sudo mv redis-server /etc/rc.d/init.d
sudo chmod 755 /etc/rc.d/init.d/redis-server
```



#### Edit the script and change redis config file path.

```bash
sudo vim /etc/rc.d/init.d/redis-server
>>>
  REDIS_CONF_FILE="/etc/redis/6379.conf"                 # line 26
>>>
```



#### Auto-enable start the Redis server.

```bash
sudo chkconfig --add redis-server
sudo chkconfig redis-server on
sudo service redis-server start
```



#### Change the system controller config file

```bash
sudo vim /etc/sysctl.conf
>>> 
  # ensure redis background save issue
  vm.overcommit_memory = 1
>>>

sysctl -p
```

