const DBProxy = require('../../common/store/DBProxy')
const Application = require('../LKApplication')
Application.getCurrentApp().on("dbReady",function () {
    let db = new DBProxy();
    db.serialize(async () => {
      const sqlAry = [
        "create table if not exists chat(id TEXT,ownerUserId TEXT,name TEXT,createTime INTEGER,topTime INTEGER,isGroup INTEGER,reserve1 TEXT,PRIMARY KEY(ownerUserId,id))",
        "create table if not exists groupMember(chatId TEXT,contactId TEXT,reserve1 TEXT,primary key(chatId,contactId))",
        //include org members 0 & foreign contacts 1 & group contacts 2
        "create table if not exists contact(id TEXT,name TEXT,pic TEXT,serverIP TEXT,serverPort INTEGER,relation INTEGER,orgId TEXT,mCode TEXT,ownerUserId TEXT,reserve1 TEXT,PRIMARY KEY(id,ownerUserId))",
        "create table if not exists device(id TEXT PRIMARY KEY NOT NULL,publicKey TEXT,contactId TEXT,remark TEXT,reserve1 TEXT)",
        "create table if not exists flowCursor(ownerUserId TEXT,flowId TEXT not null,flowType TEXT,PRIMARY KEY(ownerUserId,flowType))",
        "create table if not exists lkuser(id TEXT PRIMARY KEY NOT NULL,name TEXT,pic TEXT,publicKey TEXT,privateKey TEXT,deviceId TEXT,serverIP TEXT,serverPort INTEGER,serverPublicKey TEXT,orgId TEXT,mCode TEXT,password TEXT,reserve1 TEXT)",
        "create table if not exists magicCode(ownerUserId TEXT PRIMARY KEY NOT NULL,orgMCode TEXT,memberMCode TEXT,reserve1 TEXT)",
        "create table if not exists mfapply(ownerUserId TEXT,id TEXT NOT NULL,name TEXT,pic TEXT,serverIP TEXT,serverPort INTEGER,mCode TEXT,time INTEGER,state INTEGER,PRIMARY KEY(ownerUserId,id))",
        "create table if not exists org(id TEXT PRIMARY KEY NOT NULL,name TEXT,parentId TEXT,ownerUserId TEXT,reserve1 TEXT)",
        "create table if not exists record(ownerUserId TEXT,chatId TEXT,id TEXT,senderUid TEXT,senderDid TEXT,type INTEGER,content TEXT,sendTime INTEGER,eventTime INTEGER,state INTEGER,readState INTEGER,readTime INTEGER,playState INTEGER,relativeMsgId TEXT,relativeOrder INTEGER,receiveOrder INTEGER,sendOrder INTEGER,PRIMARY KEY(ownerUserId,chatId,id))",
        "create table if not exists group_record_state(ownerUserId TEXT,chatId TEXT,msgId TEXT ,reporterUid TEXT NOT NULL,state INTEGER,PRIMARY KEY(ownerUserId,chatId,msgId,reporterUid))"
      ]
      let psAry = sqlAry.map((ele) => {
        return runSql(db, ele)
      })
      await Promise.all(psAry)
      const viewAry = [
        `create view if not exists groupView as 
        select 
        t3.name chatName
        , t2.name contactName
        , t1.*
        from 
        groupMember t1
        join contact t2
        join chat t3
        on
        t1.chatId = t3.id
        and t1.contactId = t2.id`
      ]
      psAry = viewAry.map((ele) => {
        return runSql(db, ele)
      })
      await Promise.all(psAry)
    })
})

function runSql(db, sql, param = []) {
  return new Promise((res, rej) => {
    db.run(sql, param, res, rej)
  })
}

module.exports = DBProxy;
