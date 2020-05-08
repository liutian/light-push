
output_path="/service/logs/app/${envID}/oms4/${APPNAME}/output.log"
log_path="/service/logs/app/${envID}/oms4/${APPNAME}/"

if [[ $APPNAME == "push-socket" ]];then
  main_path="./src/socket/index.js"
  port=21315
elif [[ $APPNAME == "push-logic" ]];then
  main_path="./src/logic/index.js"
  port=10003
fi

mkdir -p ${log_path}
echo "main_path: ${main_path}   port:${port}   env:${envID}   log_path:${log_path}"
node ${main_path} -p ${port} -e ${envID} --log_path ${log_path}
