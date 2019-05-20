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
  `,
  '0.0.2': `
  alter table chat add column MessageCeiling INTEGER
  `,
  '0.0.3': `alter table chat add column focus INTEGER`
}

const versionAry = Object.keys(updateSqlObj)

class DbUtil {
  static async prepareDb() {
    let db = new DBProxy()
    db.serialize(async () => {
      const allTableAry = await DbUtil.getAllTableAry()

      //如果没有contact, db_version表,说明数据库重置了或者初次生成,需要插入最新数据库版本号
      if (!allTableAry.includes('contact')) {
        const insertDbVersionSqlAry = [
          `
create table if not exists db_version(
  version varchar(100),
  description TEXT,
  updateAt datetime,
  engineVersion varchar(100),
  primary key(version)
)`,
          `insert into db_version values('${_.last(versionAry)}', ' ', '${moment().format('YYYY-MM-DD h:mm:ss')}', '${require('../../package.json').version}')`
        ]
        await DbUtil.runSqlBatch(insertDbVersionSqlAry)
      }
      const sqlAry = [
        "create table if not exists chat(id TEXT,ownerUserId TEXT,name TEXT,createTime INTEGER,topTime INTEGER,isGroup INTEGER,reserve1 TEXT,MessageCeiling INTEGER,focus INTEGER,PRIMARY KEY(ownerUserId,id))",
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
      let psAry = sqlAry.map(ele => DbUtil.runSql(ele))
      await Promise.all(psAry)
      await DbUtil.updateDb()
      prepareDbAsyncTask()
    })
  }

  static async updateDb() {
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
      for (let sentence of sqlBlock.split(';')) {
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

  static async createView() {
    //const db = new DBProxy()
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
        t1.contactId = t2.id 
        order by t2.name`,
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
		t4.name senderName,
		t1.*
        FROM record t1
        JOIN lkuser t2
        JOIN chat t3
        join contact t4
	    ON t1.ownerUserId = t2.id
		AND t1.chatId = t3.id
		and t4.id = t1.senderUid
		
		`
    }
    const viewAry = Object.keys(viewWrapper)
    // drop all view
    psAry = viewAry.map(ele => DbUtil.runSql(`drop view if exists ${ele}`))
    await Promise.all(psAry)
    psAry = viewAry.map(ele => DbUtil.runSql(viewWrapper[ele]))

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
  static async runSqlBatch(sqlAry) {
    for (let sql of sqlAry) {
      await DbUtil.runSql(sql)
    }
  }

  static async getAllTableData(schemeName) {
    return DbUtil.getAllSchemeData('table', schemeName)
  }

  static async getAllViewData(schemeName) {
    return DbUtil.getAllSchemeData('view', schemeName)
  }

  // 如果schemeName为空,返回所有数据
  static async getAllSchemeData(type, schemeName) {
    let nameAry = []
    if (schemeName) {
      nameAry.push(schemeName)
    } else {
      nameAry = await DbUtil.getAllScheme(type)
    }
    const obj = {}
    const psAry = []

    for (let ele of nameAry) {
      const ps = new Promise(async (resolve) => {
        const recordAry = await DbUtil.runSql(`
        select * from ${ele}
      `)
        obj[ele] = recordAry
        resolve()
      })
      psAry.push(ps)
    }
    await Promise.all(psAry)
    let result = obj
    if (schemeName) {
      result = obj[schemeName]
    }
    return result
  }

  // 获取所有的table
  static async getAllTableAry() {
    return DbUtil.getAllScheme('table')
  }

  // 获取所有的view
  static async getAllViewAry() {
    return DbUtil.getAllScheme('view')
  }

  // 获取所有的view或table
  /*
    * @return array
   */
  static async getAllScheme(type) {
    const nameAry = await DbUtil.runSql(`SELECT 
    name
FROM 
    sqlite_master 
WHERE 
    type ='${type}' AND 
    name NOT LIKE 'sqlite_%' order by name`)
    return nameAry.map(ele => ele.name)
  }
}


async function prepareDbAsyncTask() {
  await DbUtil.createView()
  if (displayAllData) {
    const result = await DbUtil.getAllTableAry()
    console.log(result)
  }
}

module.exports = DbUtil
