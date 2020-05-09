From ic-harbor.baozun.com/ic/alpine-node10:v1.1

USER vmuser
RUN mkdir /opt/project/src -p
WORKDIR  /opt/project
ADD  ./src  /opt/project/src
Add  ./package.json /opt/project
Add  ./startup.sh /opt/project
Add  ./node_modules.tar.gz /opt/project
RUN  tar -zxf node_modules.tar.gz

ENTRYPOINT sh startup.sh
