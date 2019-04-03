const _ = require('lodash')
const moment = require('moment')

const DBProxy = require('../../common/store/DBProxy')
const config = require('../../config')
const {displayAllData} = config

const updateSqlObj = {
  '0.0.1': `
    alter table groupMember add column ownerUserId TEXT;
    alter table device add column ownerUserId TEXT;
    update groupMember set ownerUserId = (select id from lkuser limit 1) where ownerUserId is null;
    update device set ownerUserId = (select id from lkuser limit 1) where ownerUserId is null;
  `
}

class DbUtil {
  static async prepareDb() {
    let db = new DBProxy();
    db.serialize(async () => {
      const sqlAry = [
        "create table if not exists chat(id TEXT,ownerUserId TEXT,name TEXT,createTime INTEGER,topTime INTEGER,isGroup INTEGER,reserve1 TEXT,PRIMARY KEY(ownerUserId,id))",
        "create table if not exists groupMember(ownerUserId TEXT,chatId TEXT,contactId TEXT,reserve1 TEXT,primary key(chatId,contactId))",
        //include org members 0 & foreign contacts 1 & group contacts 2
        "create table if not exists contact(id TEXT,name TEXT,pic TEXT,serverIP TEXT,serverPort INTEGER,relation INTEGER,orgId TEXT,mCode TEXT,ownerUserId TEXT,reserve1 TEXT,PRIMARY KEY(id,ownerUserId))",
        "create table if not exists device(ownerUserId TEXT,id TEXT PRIMARY KEY NOT NULL,publicKey TEXT,contactId TEXT,remark TEXT,reserve1 TEXT)",
        "create table if not exists flowCursor(ownerUserId TEXT,flowId TEXT not null,flowType TEXT,PRIMARY KEY(ownerUserId,flowType))",
        "create table if not exists lkuser(id TEXT PRIMARY KEY NOT NULL,name TEXT,pic TEXT,publicKey TEXT,privateKey TEXT,deviceId TEXT,serverIP TEXT,serverPort INTEGER,serverPublicKey TEXT,orgId TEXT,mCode TEXT,password TEXT,reserve1 TEXT)",
        "create table if not exists magicCode(ownerUserId TEXT PRIMARY KEY NOT NULL,orgMCode TEXT,memberMCode TEXT,reserve1 TEXT)",
        "create table if not exists mfapply(ownerUserId TEXT,id TEXT NOT NULL,name TEXT,pic TEXT,serverIP TEXT,serverPort INTEGER,mCode TEXT,time INTEGER,state INTEGER,PRIMARY KEY(ownerUserId,id))",
        "create table if not exists org(id TEXT PRIMARY KEY NOT NULL,name TEXT,parentId TEXT,ownerUserId TEXT,reserve1 TEXT)",
        "create table if not exists record(ownerUserId TEXT,chatId TEXT,id TEXT,senderUid TEXT,senderDid TEXT,type INTEGER,content TEXT,sendTime INTEGER,eventTime INTEGER,state INTEGER,readState INTEGER,readTime INTEGER,playState INTEGER,relativeMsgId TEXT,relativeOrder INTEGER,receiveOrder INTEGER,sendOrder INTEGER,PRIMARY KEY(ownerUserId,chatId,id))",
        "create table if not exists group_record_state(ownerUserId TEXT,chatId TEXT,msgId TEXT ,reporterUid TEXT NOT NULL,state INTEGER,PRIMARY KEY(ownerUserId,chatId,msgId,reporterUid))"
      ]
      let psAry = sqlAry.map((ele) => {
        return DbUtil.runSql(ele)
      })
      await Promise.all(psAry)
      await DbUtil.updateDb()
      DbUtil.createView()
      if (displayAllData) {
        const result = await DbUtil.getAllData('lkuser')
        console.log(result)
      }
    })
  }

  static async updateDb () {
    const sql = `
create table if not exists db_version(
  version varchar(100),
  description TEXT,
  updateAt datetime,
  engineVersion varchar(100),
  primary key(version)
)`
    await DbUtil.runSql(sql)
    const versionRecordAry = await DbUtil.runSql(`select * from db_version order by updateAt desc`)
    const versionKeyAry = Object.keys(updateSqlObj)
    let updateAry = []
    if (!versionRecordAry.length) {
      updateAry = versionKeyAry
    } else {
      const recentVersion = versionRecordAry[0].version
      updateAry = versionKeyAry.slice(versionKeyAry.indexOf(recentVersion) + 1)
    }
    for (let ele of updateAry) {
      const sqlBlock = updateSqlObj[ele]
      for(let sentence of sqlBlock.split(';')){
        sentence = sentence.trim()
        if (sentence) {
          await DbUtil.runSql(sentence.trim())
        }
      }
    }
    // 如果有更新,应当更新db_version表

    if (updateAry.length) {
      const newVersion = _.last(updateAry)
      const sql = `insert into db_version values('${newVersion}', ' ', '${moment().format('YYYY-MM-DD h:mm:ss')}', '${require('../../package.json').version}')`
      DbUtil.runSql(sql)
    }
  }

  static async createView () {
    const db = new DBProxy();
    let psAry = []
    const viewWrapper = {
      contactView: `create view if not exists contactView as 
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
      deviceView: `create view if not exists deviceView as 
        select 
        t2.name contactName,
        t1.* 
        from 
        device t1 
        join contact t2   
        on 
        t1.contactId = t2.id`,
      flowCursorView: `create view if not exists flowCursorView as 
        select 
        t2.name lkuserName,
        t1.* 
        from 
        flowCursor t1 
        join lkuser t2 
        on 
        t1.ownerUserId = t2.id`,
      groupMemberView: `create view if not exists groupMemberView as
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
      group_record_stateView: `create view if not exists group_record_stateView as
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
      magicCodeView: `create view if NOT EXISTS magicCodeView AS 
        SELECT t2.name lkuserName,
		t1.*
        FROM magicCode t1
        JOIN lkuser t2
	    ON t1.ownerUserId = t2 .id `,
      orgView: `create view if NOT EXISTS orgView AS 
        SELECT t2.name lkuserName,
		t1.*
        FROM org t1
        JOIN lkuser t2
        ON t1.ownerUserId = t2.id `,
      recordView: `create view if NOT EXISTS recordView AS
        SELECT t2.name lkuserName,
		t3.name chatName,
		t1.*
        FROM record t1
        JOIN lkuser t2
        JOIN chat t3
	    ON t1.ownerUserId = t2.id
		AND t1.chatId = t3.id`
    }
    const viewAry = Object.keys(viewWrapper)
    // drop all view
    psAry = viewAry.map(ele => {
      return DbUtil.runSql(`drop view if exists ${ele}`)
    })
    await Promise.all(psAry)
    psAry = viewAry.map((ele) => {
      return DbUtil.runSql(viewWrapper[ele])
    })
    await Promise.all(psAry)

  }


  static runSql(sql, param = []) {
    const db = new DBProxy()
    return new Promise((res, rej) => {
      db.transaction(() => {
        db.getAll(sql, param, res, rej)
      })
    })
  }
  // 如果tableName为空,返回所有数据
  static async getAllData (tableName) {
    let tableNameAry = []
    if(tableName) {
      tableNameAry.push(tableName)
    } else {
      tableNameAry = await DbUtil.getAllTableAry()
    }
    const obj = {}
    const psAry = []

    for(let ele of tableNameAry) {
      const tableName = ele
      const ps = new Promise(async resolve => {
        const recordAry = await DbUtil.runSql(`
        select * from ${tableName}
      `)
        obj[tableName] = recordAry
        resolve()
      })
      psAry.push(ps)
    }
    await Promise.all(psAry)
    let result = obj
    if(tableName) {
      result = obj[tableName]
    }
    return result
  }

  static async getAllTableAry() {
    const tableNameAry = await DbUtil.runSql(`SELECT 
    name
FROM 
    sqlite_master 
WHERE 
    type ='table' AND 
    name NOT LIKE 'sqlite_%' order by name`)
    return tableNameAry.map(ele => {
      return ele.name
    })
  }
}

module.exports = DbUtil
