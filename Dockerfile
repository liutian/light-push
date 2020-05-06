ARG ENV_NAME
ARG APP_NAME

From ic-harbor.baozun.com/ic/alpine-node12:v2.3

USER vmuser
RUN mkdir /opt/project/ -p
WORKDIR  /opt/project
ADD  ./src  /opt/project
Add  ./package.json /opt/project
Add  ./startup.sh /opt/project
RUN npm i
ENTRYPOINT ["sh", "startup.sh", $APP_NAME , $ENV_NAME]
