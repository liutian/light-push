From ic-harbor.baozun.com/ic/alpine-node12:v2.3

USER vmuser
RUN mkdir /opt/project/ -p
WORKDIR  /opt/project
ADD  ./src  /opt/project
ADD  ./app.json  /opt/project
Add  ./package.json /opt/project
RUN npm i
RUN npm install pm2 -g
ENTRYPOINT ["sh", "startup.sh"]
