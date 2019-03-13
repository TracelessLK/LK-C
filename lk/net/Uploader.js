
const net = require('net');
const fs = require("fs");
const path = require('path');
class Uploader{
    constructor(filePath,ip,port){
        this._filePath = filePath;
        this._ip = ip;
        this._port = port;
        this._completedSize = 0;
    }
    start(){
        let socket = net.createConnection(this._port,this._ip, () => {
            console.log('connected to UploadChannel!');
            //获取文件信息包括文件大小
            fs.stat(this._filePath,(err,stat)=>{
                console.info("fs.stat");
                console.info(JSON.stringify(stat))
                this._size = stat.size;
            })
            //读取文件开始传输
            const readable = fs.createReadStream(this._filePath);
            readable.on('close',function () {
                console.info("readable close")
            });
            //发送流量大小变化事件
            readable.on('data',function (chunk) {
                console.info("readable data "+chunk.length)
                this._completedSize+=chunk.length;
                if(this._onScheduleChanged)
                    this._onScheduleChanged(this._completedSize);
            });
            //发送完成
            readable.on('end',function () {
                console.info("readable end")
                if(this._onCompleted){
                    this._onCompleted();
                }
            });
            //发生错误
            readable.on('error',function (err) {
                console.info("readable error :"+err)
                if(this._onError){
                    this._onError(err);
                }
            });
            readable.on('readable',function () {
                console.info("readable readable")
            });

            readable.pipe(socket);
        });



        socket.on('data', (data) => {
            data = data.toString();
            console.info(data);

        });
        socket.on('error', (err) => {
            console.log('_daemonSocket err:'+err);
        });
        socket.on('end', () => {
            socket.end()
        });

        socket.on('close',()=>{
            socket = null;


        });

        socket.on('timeout',()=>{
            socket.end();
        });
    }
    onScheduleChanged(fun){
        this._onScheduleChanged = fun;
    }
    onError(fun){
        this._onError = fun;
    }
    onCompleted(fun){
        this._onCompleted = fun;
    }

}