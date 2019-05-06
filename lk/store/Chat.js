const DBProxy = require('./DBInit')
const Record = require('./Record')
// order默认创建时间 如果置顶order=当前时间&onTop=1
class Chat {
  getAll(userId) {
    return new Promise((resolve, reject) => {
      const db = new DBProxy()
      db.transaction(() => {
        const sql = 'select * from chat where ownerUserId=? order by topTime desc,createTime desc'
        db.getAll(sql, [userId], (results) => {
          resolve(results)
        }, (err) => {
          reject(err)
        })
      })
    })
  }

  deleteChat(userId, chatId) {
    return new Promise((resolve, reject) => {
      const db = new DBProxy()
      db.transaction(() => {
        const sql = 'delete from chat where id=? and ownerUserId=?'
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
      const db = new DBProxy()
      db.transaction(() => {
        const sql = 'select * from chat where id=? and ownerUserId=?'
        db.get(sql, [chatId, userId], (row) => {
          resolve(row)
        }, (err) => {
          reject(err)
        })
      })
    })
  }

  getGroupMembers(chatId) {
    return new Promise((resolve, reject) => {
      const db = new DBProxy()
      db.transaction(() => {
        const sql = 'select c.* from groupMember as m,contact as c where m.contactId=c.id and m.chatId=? group by c.id'
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
      const db = new DBProxy()
      db.transaction(() => {
        const sql = 'insert into chat(id,ownerUserId,createTime,topTime,isGroup) values (?,?,?,?,?)'
        db.run(sql, [chatId, userId, Date.now(), 0, 0], () => {
          resolve()
        }, (err) => {
          reject(err)
        })
      })
    })
  }

  addGroupChat(userId, chatId, name) {
    return new Promise(async (resolve, reject) => {
      const db = new DBProxy()
      db.transaction(() => {
        const sql = 'insert into chat(id,ownerUserId,name,createTime,topTime,isGroup) values (?,?,?,?,?,?)'
        db.run(sql, [chatId, userId, name, Date.now(), 0, 1], () => {
          resolve()
        }, (err) => {
          reject(err)
        })
      })
    })
  }

  getGroupMember(chatId, contactId) {
    return new Promise((resolve, reject) => {
      const db = new DBProxy()
      db.transaction(() => {
        const sql = 'select * from groupMember where chatId=? and contactId=?'
        db.get(sql, [chatId, contactId], (row) => {
          resolve(row)
        }, (err) => {
          reject(err)
        })
      })
    })
  }

  async _addGroupMember(userId, chatId, contactId) {
    const cur = await this.getGroupMember(chatId, contactId)
    if (!cur) {
      return new Promise((resolve, reject) => {
        const db = new DBProxy()
        db.transaction(() => {
          const sql = 'insert into groupMember(ownerUserId,chatId,contactId) values (?,?,?)'
          db.run(sql, [userId, chatId, contactId], () => {
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

  addGroupMembers(userId, chatId, members) {
    return new Promise((resolve, reject) => {
      const ps = []
      members.forEach((contact) => {
        const contactId = contact.id
        ps.push(this._addGroupMember(userId, chatId, contactId))
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
      const db = new DBProxy()
      db.transaction(() => {
        const db1 = new DBProxy()
        const sql = 'update chat set topTime=? where id=? and ownerUserId=?'
        db1.run(sql, [Date.now(), chatId, userId], () => {
          resolve()
        }, (err) => {
          reject(err)
        })
      })
    })
  }

  clear(userId) {
    return new Promise((resolve, reject) => {
      const db = new DBProxy()
      db.transaction(() => {
        const sql = 'delete from chat where ownerUserId=? and isGroup=?'// removeAllSingleChats
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
      const db = new DBProxy()
      db.transaction(() => {
        const sql = 'delete from chat where ownerUserId=? and isGroup=?'
        db.run(sql, [userId, 1], () => {
          const sql2 = 'delete from groupMember where ownerUserId=?'
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
      const db = new DBProxy()
      db.transaction(() => {
        const sql = 'delete from chat where ownerUserId=? '
        db.run(sql, [userId], () => {
          const sql2 = 'delete from groupMember where chatId not in (select id from chat where ownerUserId=? )'
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
      const db = new DBProxy()
      db.transaction(() => {
        const sql = 'delete from chat where ownerUserId=? and id=?'
        db.run(sql, [userId, chatId], () => {
          resolve()
          const sql2 = 'delete from groupMember where chatId = ?'
          db.run(sql2, [chatId], () => {
          }, (err) => {
            reject(err)
          })

          const sql3 = 'delete from record where ownerUserId=? and chatId=?'
          db.run(sql3, [userId, chatId], () => {
          }, (err) => {
            reject(err)
          })

          const sql4 = 'delete from group_record_state where ownerUserId=? and chatId=?'
          db.run(sql4, [userId, chatId], () => {
          }, (err) => {
            reject(err)
          })
        }, (err) => {
          reject(err)
        })
      })
    })
  }

  deleteGroupMember(userId, chatId, contactId) {
    return new Promise((resolve, reject) => {
      const db = new DBProxy()
      db.transaction(() => {
        const sql = 'delete from groupMember where chatId=? and contactId=?'
        db.run(sql, [chatId, contactId], () => {
          resolve()

          const sql3 = 'delete from record where ownerUserId=? and chatId=? and senderUid=?'
          db.run(sql3, [userId, chatId, contactId], () => {
          }, (err) => {
            reject(err)
          })

          const sql4 = 'delete from group_record_state where ownerUserId=? and chatId=? and reporterUid=?'
          db.run(sql4, [userId, chatId, contactId], () => {
          }, (err) => {
            reject(err)
          })
        }, (err) => {
          reject(err)
        })
      })
    })
  }

  setGroupName(userId, chatId, name) {
    return new Promise((resolve, reject) => {
      const db = new DBProxy()
      db.transaction(() => {
        const sql = 'update chat set name=? where id=? and ownerUserId=?'
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
