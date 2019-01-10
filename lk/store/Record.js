const DBProxy = require('./DBInit')

class Record{

    constructor(){
        this.MESSAGE_TYPE_TEXT=0
        this.MESSAGE_TYPE_IMAGE=1
        this.MESSAGE_TYPE_FILE=2
        this.MESSAGE_TYPE_AUDIO=3

        this.MESSAGE_READSTATE_READ=1
        this.MESSAGE_READSTATE_READREPORT=2

        this.AUDIO_PLAYSTATE_PLAYED=1
    }
    _insert2DB(param){
        return new Promise((resolve,reject)=>{
            let db = new DBProxy()
            let time = Date.now();
            db.transaction((tx)=>{
                let sql = "insert into record(ownerUserId,chatId,id,senderUid,senderDid,type,content,sendTime,eventTime,state,readState,readTime,playState,relativeMsgId,relativeOrder,receiveOrder,sendOrder) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
                db.run(sql,[param.userId,param.chatId,param.msgId,param.senderUid,param.senderDid,param.type,param.content,param.sendTime,time,isNaN(param.state)?-1:param.state,-1,-1,-1,param.relativeMsgId,param.relativeOrder,param.receiveOrder,param.sendOrder],function () {
                    resolve();
                },function (err) {
                    console.info("insert2DB err:"+err)
                    reject(err);
                });
            });
        })

    }
    addMsg(userId,chatId,msgId,senderUid,senderDid,type,content,sendTime,state,relativeMsgId,relativeOrder,receiveOrder,sendOrder){
        return new Promise((resolve,reject)=>{
            let param = {userId,chatId,msgId,senderUid,senderDid,type,content,sendTime,state,relativeMsgId,relativeOrder,receiveOrder,sendOrder};
            if(type===this.MESSAGE_TYPE_TEXT){
                this._insert2DB(param).then(()=>{
                    resolve();
                }).catch((err)=>{
                    reject(err);
                });
            }else if(type===this.MESSAGE_TYPE_IMAGE||type===this.MESSAGE_TYPE_AUDIO){
                let fileDir = "/images/";
                let fileExt = "jpg";
                if(type===this.MESSAGE_TYPE_AUDIO){
                    fileDir="/audio/";
                    fileExt=content.ext;
                }
                let filePath = "/"+userId+fileDir+chatId;
                let fileName = msgId+"."+fileExt;

                DBProxy.saveFile(filePath,fileName,content.data,param).then((p)=>{
                    let url = p.url;
                    let extParam = p.param;
                    let newContent;
                    let oldContent = extParam.content;
                    let t = extParam.type;
                    if(t!=type){
                        console.info("addMsg:t!=type,"+url)
                    }
                    if(t===this.MESSAGE_TYPE_IMAGE){
                        newContent = {width:oldContent.width,height:oldContent.height,url:url};
                        console.info("addMsg:img,"+url)
                    }else{
                        newContent = {url:url};
                        console.info("addMsg:audio,"+url)
                    }
                    if(!newContent.width&&!newContent.height){
                         newContent.data = oldContent.data;
                    }
                    extParam.content = JSON.stringify(newContent);
                    this._insert2DB(extParam).then(()=>{
                        resolve();
                    }).catch((err)=>{
                        reject(err);
                    });;
                }).catch(function (e) {
                    console.info("saveFile err:"+e);
                    throw e;
                })
            }
        });
    }
    _isAllUpdate(userId,chatId,msgIds,state){
        return new Promise((resolve,reject)=>{
            let sql = "select id from record where ownerUserId=? and chatId=? and state>=? and id ";
            let num = 0;
            if(!msgIds.forEach){
                sql += "='"
                sql += msgIds;
                sql += "'";
                num = 1;
            }else{
                let _distinc = new Map();
                sql += "in (";
                for(var i=0;i<msgIds.length;i++){
                    sql+="'";
                    sql+=msgIds[i];
                    sql+="'";
                    if(i<msgIds.length-1){
                        sql+=",";
                    }
                    _distinc.set(msgIds[i],1);

                }
                sql+=")";
                num = _distinc.size;
            }
            let db = new DBProxy()
            db.transaction((tx)=>{
                db.getAll(sql,[userId,chatId,state],function (results) {
                    var len = results.length;
                    if(len==num){
                        resolve(true);
                    }else{
                        resolve(false);
                    }
                },function (err) {
                    reject(err)
                });
            });
        });

    }


    _addGroupMsgReadReport(userId,chatId,msgId,reporterUid,state){
        return new Promise((resolve,reject)=>{
            let sql = "insert into group_record_state(ownerUserId,chatId,msgId,reporterUid,state) values (?,?,?,?,?)";
            var params=[];
            params.push(userId);
            params.push(chatId);
            params.push(msgId);
            params.push(reporterUid);
            params.push(state);
            let db = new DBProxy()
            db.transaction((tx)=>{
                db.run(sql,params,function (tx,results) {
                    resolve();
                },function (err) {
                    reject();
                });
            });
        });

    }

    async msgReadReport(userId,chatId,msgIds,reporterUid,state,isGroup){
        // await this._ensureAllMsgExists(userId,chatId,msgIds);
        let num = await this._updateMsgState(userId,chatId,msgIds,state);
        if(isGroup){
            let ps = [];
            msgIds.forEach((msgId)=>{
                ps.push(this._addGroupMsgReadReport(userId,chatId,msgId,reporterUid,state));
            });
           Promise.all(ps).catch((err)=>{
               //do nothing
               console.info(err)
           });
        }
        return {isAllUpdate:this._isAllUpdate(userId,chatId,msgIds,state),updateNum:num};
    }

    _ensureAllMsgExists(userId,chatId,msgIds){
        return new Promise((resolve,reject)=>{
            var sql = "select id from record where ownerUserId=? and chatId=? and senderUid=? and id ";
            var num = 0;
            sql += "in (";
            for(var i=0;i<msgIds.length;i++){
                sql+="'";
                sql+=msgIds[i];
                sql+="'";
                if(i<msgIds.length-1){
                    sql+=",";
                }
                num++;
            }
            sql+=")";
            let db = new DBProxy()
            db.transaction((tx)=>{
                db.getAll(sql,[userId,chatId,userId],function (results) {
                    var len = results.length;
                    if(len==num){
                        resolve();
                    }
                },function (err) {
                    reject();
                });
            });
        });

    }

    _getNumNeedUpdate(userId,chatId,msgIds,state){
        return new Promise((resolve,reject)=>{
            let sql = "select id from record where state<? and ownerUserId=? and chatId=? and id ";
            if(!msgIds.forEach){
                sql += "='"
                sql += msgIds;
                sql += "'";
            }else{
                sql += "in (";
                for(var i=0;i<msgIds.length;i++){
                    sql+="'";
                    sql+=msgIds[i];
                    sql+="'";
                    if(i<msgIds.length-1){
                        sql+=",";
                    }
                }
                sql+=")";
            }
            let db = new DBProxy()
            db.transaction((tx)=>{
                db.getAll(sql,[state,userId,chatId], (res)=> {
                    resolve(res.length);
                },function (err) {
                    reject(err);
                });
            });


        });
    }

    async _updateMsgState(userId,chatId,msgIds,state){
        let updatedNum = await this._getNumNeedUpdate(userId,chatId,msgIds,state);
        return new Promise((resolve,reject)=>{
            if(updatedNum>0){
                let sql = "update record set state=? where state<? and ownerUserId=? and chatId=? and id ";
                if(!msgIds.forEach){
                    sql += "='"
                    sql += msgIds;
                    sql += "'";
                }else{
                    sql += "in (";
                    for(var i=0;i<msgIds.length;i++){
                        sql+="'";
                        sql+=msgIds[i];
                        sql+="'";
                        if(i<msgIds.length-1){
                            sql+=",";
                        }
                    }
                    sql+=")";
                }
                let db = new DBProxy()
                db.transaction((tx)=>{
                    db.run(sql,[state,state,userId,chatId], (tx,res)=> {
                        resolve(updatedNum)
                    },function (err) {
                        reject(err);
                    });
                });

            }else{
                resolve(0)
            }
        });
    }

    updateMsgState(userId,chatId,msgIds,state){
        return this._updateMsgState(userId,chatId,msgIds,state)
    }
    getGroupMsgReadReport(userId,chatId,msgId){
        return new Promise((resolve,reject)=>{
            let db = new DBProxy()
            db.transaction((tx)=>{
                let sql = `select contact.id,contact.name,group_record_state.state from group_record_state ,contact 
                where group_record_state.reporterUid = contact.id 
                and group_record_state.ownerUserId=? 
                and group_record_state.chatId=? 
                and group_record_state.msgId=? 
                and contact.ownerUserId=?
                `;
                db.getAll(sql,[userId,chatId,msgId,userId],function (results) {
                    resolve(results);
                },function (err) {
                    reject(err);
                });
            });
        });
    }

    getMsgs(userId,chatId,limit){
        return new Promise((resolve,reject)=>{
            let db = new DBProxy()
            var sql = "select * from record where ownerUserId=? and chatId=?";
            if(limit&&limit>0){
                //sql += " order by relativeOrder desc,receiveOrder desc,sendOrder desc";
                sql += " order by eventTime desc";
                sql += " limit ";
                sql += limit;
            }else{
                // sql += " order by relativeOrder,receiveOrder,sendOrder";
                sql += " order by eventTime";
            }
            db.transaction((tx)=>{
                db.getAll(sql,[userId,chatId],function (results) {
                    let rs = results;
                    if(limit&&limit>0)
                        rs = rs.reverse();
                    resolve(rs);
                },function (err) {
                    reject(err);
                });
            });
        });
    }

    updateReadState(msgIds,state){
        return new Promise((resolve,reject)=>{
            let sql = "update record set readState=?";
            if(state==this.MESSAGE_READSTATE_READ){
                sql += ",readTime=?";
            }
            sql += " where readState<? and id ";
            sql += "in (";
            for(var i=0;i<msgIds.length;i++){
                sql+="'";
                sql+=msgIds[i];
                sql+="'";
                if(i<msgIds.length-1){
                    sql+=",";
                }
            }
            sql+=")";
            let db = new DBProxy()
            db.transaction((tx)=>{
                let params = [state,state];
                if(state==this.MESSAGE_READSTATE_READ){
                    params.push(Date.now());
                }
                db.run(sql,params, ()=> {
                    resolve();
                },function (err) {
                    reject(err);
                });
            });


        });
    }

    getReadNotReportMsgs(userId,chatId){
        return new Promise((resolve,reject)=>{
            var sql = "select * from record where ownerUserId=? and senderUid<>? and chatId=? and readState=1";
            let db = new DBProxy()
            db.transaction((tx)=>{
                db.getAll(sql,[userId,userId,chatId],function (results) {
                    resolve(results);
                },function (err) {
                    reject(err);
                });
            });
        });
    }

    getMsgsNotRead(userId,chatId){
        return new Promise((resolve,reject)=>{
            let db = new DBProxy()
            var sql = "select * from record where ownerUserId=? and chatId=? and senderUid<>? and readState<1";
            db.transaction((tx)=>{
                db.getAll(sql,[userId,chatId,userId],function (results) {
                    resolve(results);
                },function (err) {
                    reject(err);
                });
            });
        });
    }
    getAllMsgNotReadNum (userId) {
      return new Promise((resolve,reject)=>{
          let db = new DBProxy()
        db.transaction((tx)=>{
          var sql = "select * from record where ownerUserId=? and senderUid<>? and readState<1";
            db.getAll(sql,[userId,userId],function (results) {
              var len = results.length;
              resolve(len);
            },function (err) {
              reject(err);
            });
        });
      });
    }

    getMsg(userId,chatId,msgId,fetchData){
        return new Promise((resolve,reject)=>{
            let db = new DBProxy()
            db.transaction((tx)=>{
                var sql = "select * from record where ownerUserId=? and chatId=? and id=?";
                db.get(sql,[userId,chatId,msgId], (result) =>{
                    if(result){
                        if(fetchData&&this.MESSAGE_TYPE_IMAGE===result.type){
                            let content = JSON.parse(result.content);
                            DBProxy.readFile(content.url).then((data)=>{
                                result.data = data;
                                resolve(result);
                            }).catch((err)=>{
                                reject(err)
                            });
                        }else{
                            resolve(result);
                        }
                    }else{
                        resolve(null);
                    }
                },function (err) {
                    reject(err);
                });
            });
        });
    }

    getRelativePreSendMsg(userId,chatId,relativeMsgId,senderUid,senderDid,sendOrder){
        return new Promise((resolve,reject)=>{
            let db = new DBProxy()
            db.transaction((tx)=>{
                var sql = "select * from record where ownerUserId=? and chatId=? and relativeMsgId=? and senderUid=? and senderDid=? and sendOrder<? order by sendOrder";
                tx.getAll(sql,[userId,chatId,relativeMsgId,senderUid,senderDid,sendOrder],function (results) {
                    if(results.length>0){
                        resolve(results[results.length-1]);
                    }else{
                        resolve(null);
                    }
                },function (err) {
                    reject(err);
                });
            });
        });
    }
    getRelativeNextSendMsg(userId,chatId,relativeMsgId,senderUid,senderDid,sendOrder){
        return new Promise((resolve,reject)=>{
            let db = new DBProxy()
            db.transaction((tx)=>{
                var sql = "select * from record where ownerUserId=? and chatId=? and relativeMsgId=? and senderUid=? and senderDid=? and sendOrder>? order by sendOrder";
                db.get(sql,[userId,chatId,relativeMsgId,senderUid,senderDid,sendOrder],function (row) {
                    resolve(row);
                },function (err) {
                    reject(err);
                });
            });
        });
    }
    removeAll(userId){
        return new Promise((resolve,reject)=>{
            let db = new DBProxy()
            db.transaction((tx)=>{
                let sql = "delete from record where ownerUserId=? ";
                db.run(sql,[userId],function () {

                    let sql2 = "delete from group_record_state where ownerUserId=? ";
                    db.run(sql2,[userId],function () {
                        resolve();
                    },function (err) {
                        reject(err);
                    });
                    DBProxy.removeAllAttachment();


                },function (err) {
                    reject(err);
                });
            });
        });
    }

    setAudioPlayed(msgId){
        return new Promise((resolve,reject)=>{
            let sql = "update record set playState=? where id=?";
            let db = new DBProxy()
            db.transaction((tx)=>{
                db.run(sql,[this.AUDIO_PLAYSTATE_PLAYED,msgId], ()=> {
                    resolve();
                },function (err) {
                    reject(err);
                });
            });


        });
    }

    deleteMsgs(msgIds){
        return new Promise((resolve,reject)=>{
            let sql = "delete from record where id ";
            if(!msgIds.forEach){
                sql += "='"
                sql += msgIds;
                sql += "'";
            }else{
                sql += "in (";
                for(var i=0;i<msgIds.length;i++){
                    sql+="'";
                    sql+=msgIds[i];
                    sql+="'";
                    if(i<msgIds.length-1){
                        sql+=",";
                    }
                }
                sql+=")";
            }
            let db = new DBProxy()
            db.transaction((tx)=>{
                db.getAll(sql,[], ()=> {
                    resolve();
                },function (err) {
                    reject(err);
                });
            });


        });
    }
}
module.exports = new Record();
