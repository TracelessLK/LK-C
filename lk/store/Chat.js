const DBProxy = require('./DBInit')
const Record = require('./Record')
//order默认创建时间 如果置顶order=当前时间&onTop=1
class Chat {
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
  getAllNew(userId) {
    return new Promise((resolve, reject) => {
      let db = new DBProxy()
      db.transaction(() => {
        let sql1 = "select t1.* ,(select count(*) from record t2 where t2.ownerUserId=? and t2.chatId=t1.Id and t2.senderUid<>? and t2.readState<1 ) as \"notReadNum\" from chat t1 where t1.ownerUserId=?  order by MessageCeiling desc,topTime desc,createTime desc"
        let sql = "select * from chat where ownerUserId=? order by MessageCeiling desc,topTime desc,createTime desc"
        db.getAll(sql1, [userId,userId,userId], (results) => {
          resolve(results)
        }, (err) => {
          reject(err)
        })
      })
    })
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
        db.run(sql, [chatId, userId, Date.now(), 0, 0], () => {
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
}
module.exports = new Chat()
