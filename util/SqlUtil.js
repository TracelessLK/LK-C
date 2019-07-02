const DBProxy = require('../common/store/DBProxy')

class SqlUtil {
  static transaction(option) {
    const {sql, paramAry} = option
    const db = new DBProxy()

    return new Promise((resolve, reject) => {
      db.transaction(() => {
        db.getAll(sql, paramAry, (result) => {
          resolve(result)
        }, (err) => {
          reject(err)
        })
      })
    })
  }
}

Object.freeze(SqlUtil)
module.exports = SqlUtil
