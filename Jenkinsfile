pipeline {
    agent any

    environment {
        USER_EMAIL = "shunshun.liu@baozun.com"  //发送邮件的地址（一般为项目owner，按实际修改）
        USER = "shunshun.liu"  //发送邮件的邮箱前缀（一般为项目owner，按实际修改）
        PROJECT_NAME = "oms4" //项目名，按实际修改
        APP_NAME = "push-socket push-logic"  //应用名，按实际修改，如有多个，在括号内添加，以空格间隔(例如"ofa-service-a ofa-service-b ofa-service-c")
        HARBOR_ADDR = "ic-harbor.baozun.com"  //Harbor地址，无需修改
        DOCKER_NAME = "Dockerfile"  //Dockerfile文件位置，如有多个，在括号内添加，以空格间隔，顺序按照APP_NAME一样(例如"ecs-ofa-service-impl-a/docker/Dockerfile-ecs ecs-ofa-service-impl-a/docker/Dockerfile-ecs ecs-ofa-service-impl-c/docker/Dockerfile-ecs")
    }

    options {
        buildDiscarder(logRotator(numToKeepStr: '5', artifactNumToKeepStr: '5'))  //保留历史记录，无需修改
    }

    //pipeline运行结果通知给触发者，无需修改
    post {
        failure {
            script {
                wrap([$class: 'BuildUser']) {
                    emailext body: '$DEFAULT_CONTENT', recipientProviders: [developers()], mimeType: 'text/html', subject: '$DEFAULT_SUBJECT', to: "$USER_EMAIL"
                }
            }

        }
        unstable {
            script {
                wrap([$class: 'BuildUser']) {
                    emailext body: '$DEFAULT_CONTENT', recipientProviders: [developers()], mimeType: 'text/html', subject: '$DEFAULT_SUBJECT', to: "$USER_EMAIL"
                }
            }
        }
        aborted {
            script {
                wrap([$class: 'BuildUser']) {
                    emailext body: '$DEFAULT_CONTENT', recipientProviders: [developers()], mimeType: 'text/html', subject: '$DEFAULT_SUBJECT', to: "$USER_EMAIL"
                }
            }
        }
    }

	stages {

        stage('打包&上传镜像') {
            when { anyOf{ branch 'release';branch 'master';branch 'dev'} }
            steps {
                timeout(time: 20, unit: 'MINUTES') {
                    sh '''
                        if [[ "$BRANCH_NAME" =~ release ]];then
                          envname="uat"
                        elif [[ "$BRANCH_NAME" =~ master ]];then
                          envname="prod"
                        elif [[ "$BRANCH_NAME" =~ dev ]];then
                          envname="sit"
                        fi

                        for app in $APP_NAME;do
                          docker images  --filter="reference=${HARBOR_ADDR}/${envname}/${PROJECT_NAME}_${app}:*" -q | xargs --no-run-if-empty docker rmi --force
                          docker build --no-cache --build-arg APP_NAME=${app} --build-arg ENV_NAME=${envname} -t ${HARBOR_ADDR}/${envname}/${PROJECT_NAME}_${app}:${GIT_COMMIT:0:7} -f  ${DOCKER_NAME} ./
                          docker push ${HARBOR_ADDR}/${envname}/${PROJECT_NAME}_${app}:${GIT_COMMIT:0:7}
                        done
					'''
                }
            }
        }
    }
}
