const DBProxy = require('../../common/store/DBProxy')

class LKUser {
  add(lkUser) {
    return new Promise((resolve, reject) => {
      const db = new DBProxy()
      db.transaction(() => {
        const sql = 'insert into lkuser(id,name,pic,publicKey,privateKey,deviceId,serverIP,serverPort,serverPublicKey,orgId,mCode,password,reserve1) values(?,?,?,?,?,?,?,?,?,?,?,?,?)'
        db.run(sql, [lkUser.id, lkUser.name, lkUser.pic, lkUser.publicKey, lkUser.privateKey, lkUser.deviceId, lkUser.serverIP, lkUser.serverPort, lkUser.serverPublicKey, lkUser.orgId, lkUser.mCode, lkUser.password, lkUser.reserve1], () => {
          resolve()
        }, (err) => {
          reject(err)
        })
      })
    })
  }

  getAll() {
    return new Promise((resolve, reject) => {
      const db = new DBProxy()
      db.transaction(() => {
        const sql = 'select * from lkuser'
        db.getAll(sql, [], (results) => {
          resolve(results)
        }, (err) => {
          reject(err)
        })
      })
    })
  }

  get(id) {
    return new Promise((resolve, reject) => {
      const db = new DBProxy()
      db.transaction(() => {
        const sql = 'select * from lkuser where id=?'
        db.get(sql, [id], (row) => {
          resolve(row)
        }, (err) => {
          reject(err)
        })
      })
    })
  }

  remove(id) {
    return new Promise((resolve, reject) => {
      const db = new DBProxy()
      db.transaction(() => {
        const sql = 'delete from lkuser where id=?'
        db.run(sql, [id], () => {
          resolve()
        }, (err) => {
          reject(err)
        })
      })
    })
  }

  setUserName(name, id) {
    return new Promise((resolve, reject) => {
      const db = new DBProxy()
      db.transaction(() => {
        const sql = 'update lkuser set name=? where id=?'
        db.run(sql, [name, id], () => {
          resolve()
        }, (err) => {
          reject(err)
        })
      })
    })
  }

  setUserPic(pic, id) {
    return new Promise((resolve, reject) => {
      const db = new DBProxy()
      db.transaction(() => {
        const sql = 'update lkuser set pic=? where id=?'
        db.run(sql, [pic, id], () => {
          resolve()
        }, (err) => {
          reject(err)
        })
      })
    })
  }
}

module.exports = new LKUser()
