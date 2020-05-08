From ic-harbor.baozun.com/ic/alpine-node10:v1.1

USER vmuser
RUN mkdir /opt/project/src -p
WORKDIR  /opt/project
ADD  ./src  /opt/project/src
Add  ./package.json /opt/project
Add  ./startup.sh /opt/project
RUN yarn install

ENTRYPOINT sh startup.sh
