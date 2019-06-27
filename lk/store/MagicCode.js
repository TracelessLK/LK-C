const DBProxy = require('../../common/store/DBProxy')

class MagicCode {
  getMagicCode(userId) {
    return new Promise((resolve, reject) => {
      const db = new DBProxy()
      db.transaction(() => {
        const sql = 'select * from magicCode where ownerUserId=?'
        db.get(sql, [userId], (row) => {
          resolve(row)
        }, (err) => {
          reject(err)
        })
      })
    })
  }

  updateOrgMagicCode(code, userId) {
    return new Promise((resolve, reject) => {
      this.getMagicCode(userId).then((row) => {
        if (row) {
          const db = new DBProxy()
          db.transaction(() => {
            const sql = 'update magicCode set orgMCode=? where ownerUserId=?'
            db.run(sql, [code, userId], () => {
              resolve()
            }, (err) => {
              reject(err)
            })
          })
        } else {
          const db = new DBProxy()
          db.transaction(() => {
            const sql = 'insert into magicCode(orgMCode,ownerUserId) values (?,?)'
            db.run(sql, [code, userId], () => {
              resolve()
            }, (err) => {
              reject(err)
            })
          })
        }
      })
    })
  }

  updateMemberMagicCode(code, userId) {
    return new Promise((resolve, reject) => {
      this.getMagicCode(userId).then((row) => {
        if (row) {
          const db = new DBProxy()
          db.transaction(() => {
            const sql = 'update magicCode set memberMCode=? where ownerUserId=?'
            db.run(sql, [code, userId], () => {
              resolve()
            }, (err) => {
              reject(err)
            })
          })
        } else {
          const db = new DBProxy()
          db.transaction(() => {
            const sql = 'insert into magicCode(memberMCode,ownerUserId) values (?,?)'
            db.run(sql, [code, userId], () => {
              resolve()
            }, (err) => {
              reject(err)
            })
          })
        }
      })
    })
  }

  reset(orgMCode, memberMCode, userId) {
    return new Promise((resolve, reject) => {
      const db = new DBProxy()
      db.transaction(() => {
        const sql = 'delete from magicCode where ownerUserId=?'
        db.run(sql, [userId], () => {
          const sql1 = 'insert into magicCode(orgMCode,memberMCode,ownerUserId) values (?,?,?)'
          db.run(sql1, [orgMCode, memberMCode, userId], () => {
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
        const sql = 'delete from magicCode where ownerUserId=?'
        db.run(sql, [userId], () => {
          resolve()
        }, (err) => {
          reject(err)
        })
      })
    })
  }
}

module.exports = new MagicCode()
