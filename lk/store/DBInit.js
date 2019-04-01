const DBProxy = require('../../common/store/DBProxy')
const Application = require('../LKApplication')
Application.getCurrentApp().on("dbReady", function () {
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
            `create view if not exists contactView as 
        select 
		t3.name lkuserName,
        t2.name orgName, 
		t1.*
        from 
        contact t1
        join org t2 
		join lkuser t3
        on
        t1.orgId = t2.id
		and t1.ownerUserId = t3.id`,
            `create view if not exists deviceView as 
        select 
        t2.name contactName,
        t1.* 
        from 
        device t1 
        join contact t2   
        on 
        t1.contactId = t2.id`,
            `create view if not exists flowCursorView as 
        select 
        t2.name lkuserName,
        t1.* 
        from 
        flowCursor t1 
        join lkuser t2 
        on 
        t1.ownerUserId = t2.id`,
            `create view if not exists groupMemberView as
        select
        t2.name chatName,
        t3.name contactName, 
        t1. * 
        from groupMember t1 
        join chat t2 
        join contact t3 
        on 
        t1.chatId = t2.id and 
        t1.contactId = t3.id`,
            `create view if not exists group_record_stateView as
        select 
        t2.name lkuserName,
        t3.name chatName,
        t1.* 
        from 
        group_record_state t1 join 
        lkuser t2 join 
        chat t3   
        on 
        t1.ownerUserId = t2.id and 
        t1.chatId = t3.id`,
            `create view if NOT EXISTS magicCodeView AS 
        SELECT t2.name lkuserName,
		t1.*
        FROM magicCode t1
        JOIN lkuser t2
	    ON t1.ownerUserId = t2 .id `,
            `create view if NOT EXISTS orgView AS 
        SELECT t2.name lkuserName,
		t1.*
        FROM org t1
        JOIN lkuser t2
        ON t1.ownerUserId = t2.id `,
            `create view if NOT EXISTS recordView AS
        SELECT t2.name lkuserName,
		t3.name chatName,
		t1.*
        FROM record t1
        JOIN lkuser t2
        JOIN chat t3
	    ON t1.ownerUserId = t2.id
		AND t1.chatId = t3.id`
        ]
        psAry = viewAry.map((ele) => {
            return runSql(db, ele)
        })
        await Promise.all(psAry)
    db.serialize(function () {
        db.transaction(()=>{
            db.run("create table if not exists chat(id TEXT,ownerUserId TEXT,name TEXT,createTime INTEGER,topTime INTEGER,isGroup INTEGER,reserve1 TEXT,PRIMARY KEY(ownerUserId,id))",[],function () {
            },function (err) {
            });
            db.run("create table if not exists groupMember(ownerUserId TEXT,chatId TEXT,contactId TEXT,reserve1 TEXT,primary key(chatId,contactId))",[],function () {
            },function (err) {
            });
        });

        db.transaction(()=>{
            //include org members 0 & foreign contacts 1 & group contacts 2
            let sql ="create table if not exists contact(id TEXT,name TEXT,pic TEXT,serverIP TEXT,serverPort INTEGER,relation INTEGER,orgId TEXT,mCode TEXT,ownerUserId TEXT,reserve1 TEXT,PRIMARY KEY(id,ownerUserId))";
            db.run(sql,[],function () {
            },function (err) {
            });
        });

        db.transaction((tx)=>{
            db.run("create table if not exists device(ownerUserId TEXT,id TEXT PRIMARY KEY NOT NULL,publicKey TEXT,contactId TEXT,remark TEXT,reserve1 TEXT)",[],function () {
            },function (err) {
            });
        });

        db.transaction((tx)=>{
            let sql = "create table if not exists flowCursor(ownerUserId TEXT,flowId TEXT not null,flowType TEXT,PRIMARY KEY(ownerUserId,flowType))";
            db.run(sql,[],function () {
            },function (err) {
            });
        });

        db.transaction((tx)=>{
            db.run("create table if not exists lkuser(id TEXT PRIMARY KEY NOT NULL,name TEXT,pic TEXT,publicKey TEXT,privateKey TEXT,deviceId TEXT,serverIP TEXT,serverPort INTEGER,serverPublicKey TEXT,orgId TEXT,mCode TEXT,password TEXT,reserve1 TEXT)",[],function () {
            },function (err) {
            });
        });

        db.transaction((tx)=>{
            let sql = "create table if not exists magicCode(ownerUserId TEXT PRIMARY KEY NOT NULL,orgMCode TEXT,memberMCode TEXT,reserve1 TEXT)";
            db.run(sql,[],function () {
            },function (err) {
            });
        });

        db.transaction((tx)=>{
            db.run("create table if not exists mfapply(ownerUserId TEXT,id TEXT NOT NULL,name TEXT,pic TEXT,serverIP TEXT,serverPort INTEGER,mCode TEXT,time INTEGER,state INTEGER,PRIMARY KEY(ownerUserId,id))",[],function () {
            },function (err) {
            });
        });

        db.transaction((tx)=>{
            let sql = "create table if not exists org(id TEXT PRIMARY KEY NOT NULL,name TEXT,parentId TEXT,ownerUserId TEXT,reserve1 TEXT)";
            db.run(sql,[],function () {
            },function (err) {
            });
        });

        db.transaction((tx)=>{
            db.run("create table if not exists record(ownerUserId TEXT,chatId TEXT,id TEXT,senderUid TEXT,senderDid TEXT,type INTEGER,content TEXT,sendTime INTEGER,eventTime INTEGER,state INTEGER,readState INTEGER,readTime INTEGER,playState INTEGER,relativeMsgId TEXT,relativeOrder INTEGER,receiveOrder INTEGER,sendOrder INTEGER,PRIMARY KEY(ownerUserId,chatId,id))",[],function () {
            },function (err) {
            });
            db.run("create table if not exists group_record_state(ownerUserId TEXT,chatId TEXT,msgId TEXT ,reporterUid TEXT NOT NULL,state INTEGER,PRIMARY KEY(ownerUserId,chatId,msgId,reporterUid))",[],function () {
            },function (err) {
            });
        });
    })
})

function runSql(db, sql, param = []) {
    return new Promise((res, rej) => {
        db.run(sql, param, res, rej)
    })
}

module.exports = DBProxy;
