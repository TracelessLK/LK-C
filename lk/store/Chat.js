const DBProxy = require('../../common/store/DBProxy')
const Record = require('./Record')
const SqlUtil = require('../../util/SqlUtil')

//order默认创建时间 如果置顶order=当前时间&onTop=1
class Chat {
  getAllChat(option = {}) {
    const { userId } = option

    return SqlUtil.transaction({
      sql: `
      select 
      * 
      from 
      chatTableView 
      where ownerUserId = ?
      order by MessageCeiling desc, activeTime desc
      `,
      paramAry: [userId]
    })
  }

  async getSingeChat({userId, chatId}) {
    let result
    const returnAry = await SqlUtil.transaction({
      sql: `select * from chatTableView where ownerUserId = ? and id = ?`,
      paramAry: [userId, chatId]
    })

    if (returnAry.length) {
      result = returnAry[0]
    }

    return result
  }

  getChatID(userId) {
    return new Promise((resolve, reject) => {
      let db = new DBProxy()
      db.transaction(() => {
        let sql = "select * from chat where ownerUserId=? and isGroup=? "
        db.getAll(sql, [userId, 1], (row) => {
          resolve(row)
        }, (err) => {
          reject(err)
        })
      })
    })
  }
  deleteChat(userId, chatId) {
    return new Promise((resolve, reject) => {
      let db = new DBProxy()
      db.transaction(() => {
        let sql = "delete from chat where id=? and ownerUserId=?"
        db.run(sql, [chatId, userId], () => {
          resolve()
        }, (err) => {
          reject(err)
        })
      })
    })
  }
  getChat(userId, chatId) {
    return new Promise((resolve, reject) => {
      let db = new DBProxy()
      db.transaction(() => {
        let sql = "select * from chat where id=? and ownerUserId=?"
        db.get(sql, [chatId, userId], (row) => {
          resolve(row)
        }, (err) => {
          reject(err)
        })
      })
    })
  }

  getChatName(userId, name) {
    return new Promise((resolve, reject) => {
      let db = new DBProxy()
      db.transaction(() => {
        let sql = "select * from chat where name=? and ownerUserId=? and isGroup=1 "
        db.get(sql, [name, userId], (row) => {
          resolve(row)
        }, (err) => {
          reject(err)
        })
      })
    })
  }

  getGroupMembers(chatId) {
    return new Promise((resolve, reject) => {
      let db = new DBProxy()
      db.transaction(() => {
        let sql = "select c.*, m.groupAdministrator from groupMember as m,contact as c where m.contactId=c.id and m.chatId=? group by c.id"
        db.getAll(sql, [chatId], (results) => {
          resolve(results)
        }, (err) => {
          reject(err)
        })
      })
    })
  }

  addSingleChat(userId, chatId) {
    return new Promise((resolve, reject) => {
      let db = new DBProxy()
      db.transaction(() => {
        let sql = "insert into chat(id,ownerUserId,createTime,topTime,isGroup) values (?,?,?,?,?)"
        db.run(sql, [chatId, userId, Date.now(), null, 0], () => {
          resolve()
        }, (err) => {
          reject(err)
        })
      })
    })
  }
  addGroupChat(userId, chatId, name, topTime, MessageCeiling, focus, reserve1) {
    return new Promise(async (resolve, reject) => {
      let db = new DBProxy()
      db.transaction(() => {
        let sql = "insert into chat(id,ownerUserId,name,createTime,topTime,isGroup,MessageCeiling,focus,reserve1) values (?,?,?,?,?,?,?,?,?)"
        db.run(sql, [chatId, userId, name, Date.now(), topTime, 1, MessageCeiling, focus, reserve1], () => {
          resolve()
        }, (err) => {
          reject(err)
        })
      })
    })
  }

  getGroupMember(chatId, contactId) {
    return new Promise((resolve, reject) => {
      let db = new DBProxy()
      db.transaction(() => {
        let sql = "select * from groupMember where chatId=? and contactId=?"
        db.get(sql, [chatId, contactId], (row) => {
          resolve(row)
        }, (err) => {
          reject(err)
        })
      })
    })
  }

  async _addGroupMember(userId, chatId, contactId, groupAdministrator) {
    let cur = await this.getGroupMember(chatId, contactId)
    if (!cur) {
      return new Promise((resolve, reject) => {
        let db = new DBProxy()
        db.transaction(() => {
          let sql = "insert into groupMember(ownerUserId,chatId,contactId,groupAdministrator) values (?,?,?,?)"
          db.run(sql, [userId, chatId, contactId, groupAdministrator], () => {
            resolve()
          }, (err) => {
            reject(err)
          })
        }, (err) => {
          reject(err)
        })
      })
    }
  }

  addGroupMembers(userId, chatId, members, groupAdministrator) {
    return new Promise((resolve, reject) => {
      let ps = []
      members.forEach((contact) => {
        let contactId = contact.id
        ps.push(this._addGroupMember(userId, chatId, contactId, groupAdministrator))
      })
      Promise.all(ps).then(() => {
        resolve()
      }).catch((err) => {
        reject(err)
      })
    })
  }

  topChat(userId, chatId) {
    return new Promise((resolve, reject) => {
      let db = new DBProxy()
      db.transaction(() => {
        let sql = "update chat set topTime=? where id=? and ownerUserId=?"
        db.run(sql, [Date.now(), chatId, userId], () => {
          resolve()
        }, (err) => {
          reject(err)
        })
      })
    })
  }

  MessageCeiling(MessageCeiling, userId, chatId) {
    return new Promise((resolve, reject) => {
      let db = new DBProxy()
      db.transaction(() => {
        let sql = "update chat set MessageCeiling=? where id=? and ownerUserId=?"
        db.run(sql, [MessageCeiling, chatId, userId], () => {
          resolve()
        }, (err) => {
          reject(err)
        })
      })
    })
  }
  messageFocus(focus, userId, chatId) {
    return new Promise((resolve, reject) => {
      let db = new DBProxy()
      db.transaction(() => {
        let sql = "update chat set focus=? where id=? and ownerUserId=?"
        db.run(sql, [focus, chatId, userId], () => {
          resolve()
        }, (err) => {
          reject(err)
        })
      })
    })
  }
  messageDraft(reserve1, userId, chatId) {
    return new Promise((resolve, reject) => {
      let db = new DBProxy()
      db.transaction(() => {
        let sql = "update chat set reserve1=? where id=? and ownerUserId=?"
        db.run(sql, [reserve1, chatId, userId], () => {
          resolve()
        }, (err) => {
          reject(err)
        })
      })
    })
  }

  clear(userId) {
    return new Promise((resolve, reject) => {
      let db = new DBProxy()
      db.transaction(() => {
        let sql = "delete from chat where ownerUserId=? and isGroup=?"//removeAllSingleChats
        db.run(sql, [userId, 0], () => {
          Record.removeAll(userId).then(() => {
            resolve()
          }).catch((err) => {
            reject(err)
          })
        }, (err) => {
          reject(err)
        })
      })
    })
  }

  deleteGroups(userId) {
    return new Promise((resolve, reject) => {
      let db = new DBProxy()
      db.transaction(() => {
        let sql = "delete from chat where ownerUserId=? and isGroup=?"
        db.run(sql, [userId, 1], () => {
          let sql2 = "delete from groupMember where ownerUserId=?"
          db.run(sql2, [userId], () => {
            resolve()
          }, (err) => {
            reject(err)
          })
        }, (err) => {
          reject(err)
        })
      })
    })
  }

  removeAll(userId) {
    return new Promise((resolve, reject) => {
      let db = new DBProxy()
      db.transaction(() => {
        let sql = "delete from chat where ownerUserId=? "
        db.run(sql, [userId], () => {
          let sql2 = "delete from groupMember where chatId not in (select id from chat where ownerUserId=? )"
          db.run(sql2, [userId], () => {
            resolve()
          }, (err) => {
            reject(err)
          })
        }, (err) => {
          reject(err)
        })
      })
    })
  }

  deleteGroup(userId, chatId) {
    return new Promise((resolve, reject) => {
      let db = new DBProxy()
      db.transaction(() => {
        let sql = "delete from chat where ownerUserId=? and id=?"
        db.run(sql, [userId, chatId], () => {
          resolve()
          let sql2 = "delete from groupMember where chatId = ?"
          db.run(sql2, [chatId], () => {
          }, () => {
          })

          let sql3 = "delete from record where ownerUserId=? and chatId=?"
          db.run(sql3, [userId, chatId], () => {
          }, () => {
          })

          let sql4 = "delete from group_record_state where ownerUserId=? and chatId=?"
          db.run(sql4, [userId, chatId], () => {
          }, () => {
          })
        }, (err) => {
          reject(err)
        })
      })
    })
  }

  deleteGroupMember(uerId, chatId, contactId) {
    return new Promise((resolve, reject) => {
      let db = new DBProxy()
      db.transaction(() => {
        let sql = "delete from groupMember where chatId=? and contactId=?"
        db.run(sql, [chatId, contactId], () => {
          resolve()

          let sql3 = "delete from record where ownerUserId=? and chatId=? and senderUid=?"
          db.run(sql3, [uerId, chatId, contactId], () => {
          }, () => {
          })

          let sql4 = "delete from group_record_state where ownerUserId=? and chatId=? and reporterUid=?"
          db.run(sql4, [uerId, chatId, contactId], () => {
          }, () => {
          })
        }, (err) => {
          reject(err)
        })
      })
    })
  }

  setGroupName(userId, chatId, name) {
    return new Promise((resolve, reject) => {
      let db = new DBProxy()
      db.transaction(() => {
        let sql = "update chat set name=? where id=? and ownerUserId=?"
        db.run(sql, [name, chatId, userId], () => {
          resolve()
        }, (err) => {
          reject(err)
        })
      })
    })
  }

  getAllGroupMember({
    userId, chatId
  }) {
    const sql = `
    select 
t1.contactId,
t2.pic,
case when t1.contactId = ? then t2.name||" (我) " else t2.name end as name
from 
groupMember as t1
join contact as t2
on t1.contactId = t2.id and t2.ownerUserId = ?
where chatId = ?
order by t2.name
    `
    return SqlUtil.transaction({
      sql,
      paramAry: [userId, userId, chatId]
    })
  }

  getNonGroupMember({
    userId, chatId
  }) {
    const sql = `
    select 
id, pic, name 
from 
contact 
where id not in (
select contactId from groupMember where chatId = ?
) and ownerUserId = ?
order by name
    `
    return SqlUtil.transaction({
      sql,
      paramAry: [chatId, userId]
    })
  }

  getAll(userId) {
    return new Promise((resolve, reject) => {
      let db = new DBProxy()
      db.transaction(() => {
        let sql = "select * from chat where ownerUserId=? order by MessageCeiling desc,topTime desc,createTime desc"
        db.getAll(sql, [userId], (results) => {
          resolve(results)
        }, (err) => {
          reject(err)
        })
      })
    })
  }

  getNotExistUnreadContact({userId}) {
    const sql = `
     select 
        chatId 
        from 
        record 
        where senderUid<>ownerUserId and readState<1 and ownerUserId = ?
and chatId not in (select id from chat where ownerUserId = ?)
    group by chatId
    `
    return SqlUtil.transaction({
      sql,
      paramAry: [userId, userId]
    })
  }
}
module.exports = new Chat()
