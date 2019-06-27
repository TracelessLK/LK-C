const DBProxy = require('../../common/store/DBProxy')

class MFApply {
  add(apply, userId) {
    return new Promise((resolve) => {
      const db = new DBProxy()
      db.transaction(() => {
        const sql = 'insert into mfapply(ownerUserId,id,name,pic,serverIP,serverPort,mCode,time,state) values(?,?,?,?,?,?,?,?,?)'
        db.run(sql, [userId, apply.id, apply.name, apply.pic, apply.serverIP, apply.serverPort, apply.mCode, Date.now(), -1], () => {
          resolve(true)
        }, (err) => {
          console.log(err)
          resolve(false)
        })
      })
    })
  }

  getAll(userId) {
    return new Promise((resolve, reject) => {
      const db = new DBProxy()
      db.transaction(() => {
        const sql = 'select * from mfapply where ownerUserId=? order by time desc'
        db.getAll(sql, [userId], (results) => {
          resolve(results)
        }, (err) => {
          reject(err)
        })
      })
    })
  }

  get(id, userId) {
    return new Promise((resolve, reject) => {
      const db = new DBProxy()
      db.transaction(() => {
        const sql = 'select * from mfapply where id=? and ownerUserId=?'
        db.get(sql, [id, userId], (row) => {
          resolve(row)
        }, (err) => {
          reject(err)
        })
      })
    })
  }

  accept(id, userId) {
    return new Promise((resolve, reject) => {
      const db = new DBProxy()
      db.transaction(() => {
        const sql = 'update mfapply set state=1 where id=? and ownerUserId=?'
        db.run(sql, [id, userId], () => {
          resolve()
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
        const sql = 'delete from mfapply where ownerUserId=?'
        db.run(sql, [userId], () => {
          resolve()
        }, (err) => {
          reject(err)
        })
      })
    })
  }
}

module.exports = new MFApply()
