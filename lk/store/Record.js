const DBProxy = require('../../common/store/DBProxy')
const SqlUtil = require('../../util/SqlUtil')

class Record {
  constructor() {
    this.MESSAGE_TYPE_TEXT = 0
    this.MESSAGE_TYPE_IMAGE = 1
    this.MESSAGE_TYPE_FILE = 2
    this.MESSAGE_TYPE_AUDIO = 3

    this.MESSAGE_READSTATE_READ = 1
    this.MESSAGE_READSTATE_READREPORT = 2

    this.AUDIO_PLAYSTATE_PLAYED = 1
  }

  _insert2DB(param) {
    return new Promise((resolve, reject) => {
      const db = new DBProxy()
      const time = Date.now()
      db.transaction(() => {
        const sql = 'insert into record(ownerUserId,chatId,id,senderUid,senderDid,type,content,sendTime,eventTime,state,readState,readTime,playState,relativeMsgId,relativeOrder,receiveOrder,sendOrder) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
        db.run(sql, [param.userId, param.chatId, param.msgId, param.senderUid, param.senderDid, param.type, param.content, param.sendTime, time, isNaN(param.state) ? -1 : param.state, -1, -1, -1, param.relativeMsgId, param.relativeOrder, param.receiveOrder, param.sendOrder], () => {
          resolve()
        }, (err) => {
          console.info(`insert2DB err:${err}`)
          reject(err)
        })
      })
    })
  }

  addMsg(userId, chatId, msgId, senderUid, senderDid, type, content, sendTime, state, relativeMsgId, relativeOrder, receiveOrder, sendOrder) {
    return new Promise((resolve, reject) => {
      const param = {
        userId,
        chatId,
        msgId,
        senderUid,
        senderDid,
        type,
        content,
        sendTime,
        state,
        relativeMsgId,
        relativeOrder,
        receiveOrder,
        sendOrder
      }
      if (type === this.MESSAGE_TYPE_TEXT) {
        this._insert2DB(param).then(() => {
          resolve()
        }).catch((err) => {
          reject(err)
        })
      } else if (type === this.MESSAGE_TYPE_IMAGE || type === this.MESSAGE_TYPE_AUDIO) {
        let fileDir = '/images/'
        let fileExt = 'jpg'
        if (type === this.MESSAGE_TYPE_AUDIO) {
          fileDir = '/audio/'
          fileExt = content.ext
        }
        const filePath = `/${userId}${fileDir}${chatId}`
        const fileName = `${msgId}.${fileExt}`

        DBProxy.saveFile(filePath, fileName, content.data, param).then((p) => {
          const { url } = p
          const extParam = p.param
          let newContent
          const oldContent = extParam.content
          const t = extParam.type
          if (t != type) {
            console.info(`addMsg:t!=type,${url}`)
          }
          if (t === this.MESSAGE_TYPE_IMAGE) {
            newContent = { width: oldContent.width, height: oldContent.height, url }
          } else {
            newContent = { url }
          }
          if (!newContent.width && !newContent.height) {
            newContent.data = oldContent.data
          }
          extParam.content = JSON.stringify(newContent)
          this._insert2DB(extParam).then(() => {
            resolve()
          }).catch((err) => {
            reject(err)
          })
        }).catch((e) => {
          console.info(`saveFile err:${e}`)
          throw e
        })
      }
    })
  }

  _isAllUpdate(userId, chatId, msgIds, state) {
    return new Promise((resolve, reject) => {
      let sql = 'select id from record where ownerUserId=? and chatId=? and state>=? and id '
      let num = 0
      if (!msgIds.forEach) {
        sql += "='"
        sql += msgIds
        sql += "'"
        num = 1
      } else {
        const _distinc = new Map()
        sql += 'in ('
        for (let i = 0; i < msgIds.length; i++) {
          sql += "'"
          sql += msgIds[i]
          sql += "'"
          if (i < msgIds.length - 1) {
            sql += ','
          }
          _distinc.set(msgIds[i], 1)
        }
        sql += ')'
        num = _distinc.size
      }
      const db = new DBProxy()
      db.transaction(() => {
        db.getAll(sql, [userId, chatId, state], (results) => {
          const len = results.length
          if (len == num) {
            resolve(true)
          } else {
            resolve(false)
          }
        }, (err) => {
          reject(err)
        })
      })
    })
  }


  _addGroupMsgReadReport(userId, chatId, msgId, reporterUid, state) {
    return new Promise((resolve, reject) => {
      const sql = 'insert into group_record_state(ownerUserId,chatId,msgId,reporterUid,state) values (?,?,?,?,?)'
      const params = []
      params.push(userId)
      params.push(chatId)
      params.push(msgId)
      params.push(reporterUid)
      params.push(state)
      const db = new DBProxy()
      db.transaction(() => {
        db.run(sql, params, () => {
          resolve()
        }, () => {
          reject()
        })
      })
    })
  }

  async msgReadReport(userId, chatId, msgIds, reporterUid, state, isGroup) {
    // await this._ensureAllMsgExists(userId,chatId,msgIds);
    const num = await this._updateMsgState(userId, chatId, msgIds, state)
    if (isGroup) {
      const ps = []
      msgIds.forEach((msgId) => {
        ps.push(this._addGroupMsgReadReport(userId, chatId, msgId, reporterUid, state))
      })
      Promise.all(ps).catch((err) => {
        // do nothing
        console.info(err)
      })
    }
    return { isAllUpdate: this._isAllUpdate(userId, chatId, msgIds, state), updateNum: num }
  }

  _ensureAllMsgExists(userId, chatId, msgIds) {
    return new Promise((resolve, reject) => {
      let sql = 'select id from record where ownerUserId=? and chatId=? and senderUid=? and id '
      let num = 0
      sql += 'in ('
      for (let i = 0; i < msgIds.length; i++) {
        sql += "'"
        sql += msgIds[i]
        sql += "'"
        if (i < msgIds.length - 1) {
          sql += ','
        }
        num++
      }
      sql += ')'
      const db = new DBProxy()
      db.transaction(() => {
        db.getAll(sql, [userId, chatId, userId], (results) => {
          const len = results.length
          if (len == num) {
            resolve()
          }
        }, () => {
          reject()
        })
      })
    })
  }

  _getNumNeedUpdate(userId, chatId, msgIds, state) {
    return new Promise((resolve, reject) => {
      let sql = 'select id from record where state<? and ownerUserId=? and chatId=? and id '
      if (!msgIds.forEach) {
        sql += "='"
        sql += msgIds
        sql += "'"
      } else {
        sql += 'in ('
        for (let i = 0; i < msgIds.length; i++) {
          sql += "'"
          sql += msgIds[i]
          sql += "'"
          if (i < msgIds.length - 1) {
            sql += ','
          }
        }
        sql += ')'
      }
      const db = new DBProxy()
      db.transaction(() => {
        db.getAll(sql, [state, userId, chatId], (res) => {
          resolve(res.length)
        }, (err) => {
          reject(err)
        })
      })
    })
  }

  _updateMsgState(userId, chatId, msgIds, state) {
    return new Promise((resolve, reject) => {
      this._getNumNeedUpdate(userId, chatId, msgIds, state).then((updatedNum) => {
        if (updatedNum > 0) {
          let sql = 'update record set state=? where state<? and ownerUserId=? and chatId=? and id '
          if (!msgIds.forEach) {
            sql += "='"
            sql += msgIds
            sql += "'"
          } else {
            sql += 'in ('
            for (let i = 0; i < msgIds.length; i++) {
              sql += "'"
              sql += msgIds[i]
              sql += "'"
              if (i < msgIds.length - 1) {
                sql += ','
              }
            }
            sql += ')'
          }
          const db = new DBProxy()
          db.transaction(() => {
            db.run(sql, [state, state, userId, chatId], () => {
              resolve(updatedNum)
            }, (err) => {
              reject(err)
            })
          })
        } else {
          resolve(0)
        }
      }).catch(() => {

      })
    })
  }

  updateMsgState(userId, chatId, msgIds, state) {
    return this._updateMsgState(userId, chatId, msgIds, state)
  }

  getGroupMsgReadReport(userId, chatId, msgId) {
    return new Promise((resolve, reject) => {
      const db = new DBProxy()
      db.transaction(() => {
        const sql = `select contact.id,contact.name,group_record_state.state from group_record_state ,contact 
                where group_record_state.reporterUid = contact.id 
                and group_record_state.ownerUserId=? 
                and group_record_state.chatId=? 
                and group_record_state.msgId=? 
                and contact.ownerUserId=?
                `
        db.getAll(sql, [userId, chatId, msgId, userId], (results) => {
          resolve(results)
        }, (err) => {
          reject(err)
        })
      })
    })
  }


  getAllMsg(option) {
    const {userId, chatId, limit} = option
    const limitStm = limit ? 'limit ?' : ''
    let sql = `
select 
* from 
(
select
count(*) as readNum,
t1.id as msgId,
t1.type,
replace(t1.content, "&nbsp;", " ") content,
t1.sendTime,
t1.state,
t1.readState, 
t1.playState,
t1.readTime,
t2.name as senderName,
t2.pic,
t1.senderUid = ? isSelf
from
record as t1
join contact as  t2
on t1.senderUid = t2.id and t2.ownerUserId = ?
left join group_record_state as t3
on t3.msgId = t1.id
where t1.chatId = ? and t1.ownerUserId = ?
group by t1.id
order by sendTime DESC
${limitStm}
)
order by sendTime 
    `
    const paramAry = [userId, userId, chatId, userId]
    if (limit) {
      paramAry.push(limit)
    }
    return SqlUtil.transaction({
      sql,
      paramAry
    })
  }

  updateReadState(msgIds, state) {
    return new Promise((resolve, reject) => {
      let sql = 'update record set readState=?'
      if (state == this.MESSAGE_READSTATE_READ) {
        sql += ',readTime=?'
      }
      sql += ' where readState<? and id '
      sql += 'in ('
      for (let i = 0; i < msgIds.length; i++) {
        sql += "'"
        sql += msgIds[i]
        sql += "'"
        if (i < msgIds.length - 1) {
          sql += ','
        }
      }
      sql += ')'
      const db = new DBProxy()
      db.transaction(() => {
        const params = [state, state]
        if (state == this.MESSAGE_READSTATE_READ) {
          params.push(Date.now())
        }
        db.run(sql, params, () => {
          resolve()
        }, (err) => {
          reject(err)
        })
      })
    })
  }

  getReadNotReportMsgs(userId, chatId) {
    return new Promise((resolve, reject) => {
      const sql = 'select * from record where ownerUserId=? and senderUid<>? and chatId=? and readState=1'
      const db = new DBProxy()
      db.transaction(() => {
        db.getAll(sql, [userId, userId, chatId], (results) => {
          resolve(results)
        }, (err) => {
          reject(err)
        })
      })
    })
  }

  getMessageSearch(userId, content) {
    return new Promise((resolve, reject) => {
      const sql = 'select * from contact where ownerUserId = ? and name like ?'
      const db = new DBProxy()
      db.transaction(() => {
        db.getAll(sql, [userId, '%' + content + '%'], (results) => {
          resolve(results)
        }, (err) => {
          reject(err)
        })
      })
    })
  }

  getMsgsNotRead(userId, chatId) {
    return new Promise((resolve, reject) => {
      const db = new DBProxy()
      const sql = 'select * from record where ownerUserId=? and chatId=? and senderUid<>? and readState<1'
      db.transaction(() => {
        db.getAll(sql, [userId, chatId, userId], (results) => {
          resolve(results)
        }, (err) => {
          reject(err)
        })
      })
    })
  }

  getAllMsgNotReadNum(userId) {
    return new Promise((resolve, reject) => {
      const db = new DBProxy()
      db.transaction(() => {
        const sql = 'select * from record where ownerUserId=? and senderUid<>? and readState<1'
        db.getAll(sql, [userId, userId], (results) => {
          const len = results.length
          resolve(len)
        }, (err) => {
          reject(err)
        })
      })
    })
  }

  getMsg(userId, chatId, msgId, fetchData) {
    return new Promise((resolve, reject) => {
      const db = new DBProxy()
      db.transaction(() => {
        const sql = 'select * from record where ownerUserId=? and chatId=? and id=?'
        db.get(sql, [userId, chatId, msgId], (result) => {
          if (result) {
            if (fetchData && this.MESSAGE_TYPE_IMAGE === result.type) {
              const content = JSON.parse(result.content)
              DBProxy.readFile(content.url).then((data) => {
                result.data = data
                resolve(result)
              }).catch((err) => {
                reject(err)
              })
            } else {
              resolve(result)
            }
          } else {
            resolve(null)
          }
        }, (err) => {
          reject(err)
        })
      })
    })
  }

  getRelativePreSendMsg(userId, chatId, relativeMsgId, senderUid, senderDid, sendOrder) {
    return new Promise((resolve, reject) => {
      const db = new DBProxy()
      db.transaction((tx) => {
        const sql = 'select * from record where ownerUserId=? and chatId=? and relativeMsgId=? and senderUid=? and senderDid=? and sendOrder<? order by sendOrder'
        tx.getAll(sql, [userId, chatId, relativeMsgId, senderUid, senderDid, sendOrder], (results) => {
          if (results.length > 0) {
            resolve(results[results.length - 1])
          } else {
            resolve(null)
          }
        }, (err) => {
          reject(err)
        })
      })
    })
  }

  getRelativeNextSendMsg(userId, chatId, relativeMsgId, senderUid, senderDid, sendOrder) {
    return new Promise((resolve, reject) => {
      const db = new DBProxy()
      db.transaction(() => {
        const sql = 'select * from record where ownerUserId=? and chatId=? and relativeMsgId=? and senderUid=? and senderDid=? and sendOrder>? order by sendOrder'
        db.get(sql, [userId, chatId, relativeMsgId, senderUid, senderDid, sendOrder], (row) => {
          resolve(row)
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
        const sql = 'delete from record where ownerUserId=? '
        db.run(sql, [userId], () => {
          const sql2 = 'delete from group_record_state where ownerUserId=? '
          db.run(sql2, [userId], () => {
            resolve()
          }, (err) => {
            reject(err)
          })
          DBProxy.removeAllAttachment()
        }, (err) => {
          reject(err)
        })
      })
    })
  }

  setAudioPlayed(msgId) {
    return new Promise((resolve, reject) => {
      const sql = 'update record set playState=? where id=?'
      const db = new DBProxy()
      db.transaction(() => {
        db.run(sql, [this.AUDIO_PLAYSTATE_PLAYED, msgId], () => {
          resolve()
        }, (err) => {
          reject(err)
        })
      })
    })
  }

  deleteMsgs(msgIds) {
    return new Promise((resolve, reject) => {
      let sql = 'delete from record where id '
      if (!msgIds.forEach) {
        sql += "='"
        sql += msgIds
        sql += "'"
      } else {
        sql += 'in ('
        for (let i = 0; i < msgIds.length; i++) {
          sql += "'"
          sql += msgIds[i]
          sql += "'"
          if (i < msgIds.length - 1) {
            sql += ','
          }
        }
        sql += ')'
      }
      const db = new DBProxy()
      db.transaction(() => {
        db.getAll(sql, [], () => {
          resolve()
        }, (err) => {
          reject(err)
        })
      })
    })
  }

  getLastMsg(userId, chatId) {
    return new Promise((resolve, reject) => {
      const sql = 'select t2.name,t1.* from record t1 join contact t2 where  t1.senderUid = t2.id and   t1.ownerUserId=? and t1.chatId=?  order by sendTime desc limit 1'
      const db = new DBProxy()
      db.transaction(() => {
        db.getAll(sql, [userId, chatId], (recordAry) => {
          const { length } = recordAry
          let result
          if (length) {
            result = recordAry[0]
          } else {
            result = null
          }
          resolve(result)
        }, reject)
      })
    })
  }

  getAllReadState({msgId}) {
    const sql = `
    select
t4.name,
t3.contactId,
t4.pic,
t5.state
from
record as t1
join groupMember as t3
on t3.chatId = t5.chatId
join contact t4
on t4.id = t3.contactId
join group_record_state t5
on t5.reporterUid = t4.id and t5.msgId = t1.id
where
t1.id = ?
and t3.contactId <> t1.senderUid
`
    return SqlUtil.transaction({
      sql,
      paramAry: [msgId]
    })
  }


  getTotalMsgCount({
    chatId
  }) {
    const sql = `
    select count(*) from record where chatId = ?
    `
    return SqlUtil.transaction({
      sql,
      paramAry: [chatId]
    })
  }
}

module.exports = new Record()
