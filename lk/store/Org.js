const DBProxy = require('./DBInit')

class Org {
  getChildren(parentId, userId) {
    return new Promise((resolve, reject) => {
      const db = new DBProxy()
      db.transaction(() => {
        let sql = 'select * from org where ownerUserId=? and '
        const param = [userId]
        if (parentId) {
          sql += "parentId='"
          sql += parentId
          sql += "'"
        } else {
          sql += 'parentId is null'
        }

        db.getAll(sql, param, (results) => {
          resolve(results)
        }, (err) => {
          reject(err)
        })
      })
    })
  }

  reset(orgs, userId) {
    return new Promise((resolve, reject) => {
      const db = new DBProxy()
      db.transaction(() => {
        const sql = 'delete from org'
        db.run(sql, [], () => {
          if (orgs && orgs.length > 0) {
            let sql1 = 'insert into org(id,name,parentId,ownerUserId) values '
            const params = []
            for (let i = 0; i < orgs.length; i++) {
              const org = orgs[i]
              sql1 += '(?,?,?,?)'
              if (i < orgs.length - 1) {
                sql1 += ','
              }
              params.push(org.id)
              params.push(org.name)
              params.push(org.parentId)
              params.push(userId)
            }
            db.run(sql1, params, () => {
              resolve()
            }, (err) => {
              reject(err)
            })
          } else {
            resolve()
          }
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
        const sql = 'delete from org where ownerUserId=?'
        db.run(sql, [userId], () => {
          resolve()
        }, (err) => {
          reject(err)
        })
      })
    })
  }
}

module.exports = new Org()
