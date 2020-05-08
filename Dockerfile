ARG APP_NAME
ARG ENV_NAME

From ic-harbor.baozun.com/ic/alpine-node10:v1.1

USER vmuser
RUN mkdir /opt/project/src -p
WORKDIR  /opt/project
ADD  ./src  /opt/project/src
Add  ./package.json /opt/project
Add  ./startup.sh /opt/project
RUN yarn install

ENV APP_NAME=${APP_NAME}
ENV ENV_NAME=${ENV_NAME}

ENTRYPOINT sh startup.sh ${APP_NAME} ${ENV_NAME}
