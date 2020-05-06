app=${1:-"push-socket"}
env=${2:-"prod"}

output_path="/service/logs/app/${env}/oms4/${app}/output.log"
log_path="/service/logs/app/${env}/oms4/${app}/"

if [[ $app == "push-socket" ]];then
main_path="./src/socket/index.js"
port=21315
elif [[ $app == "push-logic" ]];then
main_path="./src/logic/index.js"
port=10003
fi

nohup node ${main_path} >> ${output_path} -p ${port} -e ${env} --log_path ${log_path} 2>&1 &
