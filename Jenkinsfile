pipeline {
    agent any

    environment {
        USER_EMAIL = "fengyan.liu@baozun.com"  //发送邮件的地址（一般为项目owner，按实际修改）
        USER = "fengyan.liu"  //发送邮件的邮箱前缀（一般为项目owner，按实际修改）
        SFTP_SECRET_ACCESS_KEY = credentials('jenkins-sftp-secret-access-key')  //SFTP的秘钥（发包使用，无需修改）
        SFTP_SERVER = "10.101.6.87"  //SFTP的地址（发包使用，无需修改）
        VALIDATE_URL = "http://10.88.26.187:6789/ci_validate/"  //SFTP的地址（发包使用，无需修改）
        REMOTE_DIR = "/upload"  //SFTP的目录（发包使用，无需修改）
        LOCAL_DIR= "$WORKSPACE/"  //生成包的位置，其中$WORKSPACE不需要修改，ecs-ofa-service-impl/target按照实际的应用目录填写
        PROJECT_NAME = "ross" //项目名，按实际修改
        APP_NAME = "ross-admin-web"  //应用名，按实际修改，如有多个，在括号内添加，以空格间隔(例如"ofa-service-a ofa-service-b ofa-service-c")
        ENV_NAME = "sit uat prod"  //发布的环境，根据自己有几个环境进行删减，但是环境名就sit uat sandbox prod这四个
        HARBOR_ADDR = "ic-harbor.baozun.com"  //Harbor地址，无需修改
        DOCKER_NAME = "docker/Dockerfile"  //Dockerfile文件位置，如有多个，在括号内添加，以空格间隔，顺序按照APP_NAME一样(例如"ecs-ofa-service-impl-a/docker/Dockerfile-ecs ecs-ofa-service-impl-a/docker/Dockerfile-ecs ecs-ofa-service-impl-c/docker/Dockerfile-ecs")
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
        stage('设置 Registry') {
            when { anyOf{ branch 'release';branch 'master';branch 'dev';branch 'ci' } }
            steps {
                timeout(time: 20, unit: 'MINUTES') {
                    sh "npm config set @baozun:registry http://npm.baozun.com:7001"
                    // sh "npm config set registry https://registry.npm.taobao.org"
                }
            }
        }

        stage('安装依赖') {
            when { anyOf{ branch 'release';branch 'master';branch 'dev'} }
            steps {
                timeout(time: 20, unit: 'MINUTES') {
                    sh "npm install"
                }
            }
        }
        stage('构建应用') {
            when { anyOf{ branch 'release';branch 'master';branch 'dev'} }
            steps {
                timeout(time: 20, unit: 'MINUTES') {
                    sh '''
                        if [[ "$BRANCH_NAME" =~ release ]];then
							npm run build-uat
						 elif [[ "$BRANCH_NAME" =~ master ]];then
							npm run build-pro
                         elif [[ "$BRANCH_NAME" =~ dev ]];then
							npm run build-sit
						fi

                    '''
                }
            }
        }

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
                            appname=(${appname[@]} $app)
                        done
                        for docker in $DOCKER_NAME;do
                            dockername=(${dockername[@]} $docker)
                        done
                                docker images  --filter="reference=${HARBOR_ADDR}/${envname[$j]}/${PROJECT_NAME}_${appname[$i]}:*" -q | xargs --no-run-if-empty docker rmi --force
                                docker build --no-cache  -t ${HARBOR_ADDR}/${envname[$j]}/${PROJECT_NAME}_${appname[$i]}:${GIT_COMMIT:0:7} -f  ${dockername} ./
                                docker push ${HARBOR_ADDR}/${envname[$j]}/${PROJECT_NAME}_${appname[$i]}:${GIT_COMMIT:0:7}
					'''
                }
            }
        }
    }
}
