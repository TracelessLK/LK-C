const DBProxy = require('../../common/store/DBProxy')

class FlowCursor {
  constructor() {
    this._flows = new Map()
  }

  getLastFlowId(userId, flowType) {
    return new Promise((resolve, reject) => {
      let flowId = this._flows.get(userId + flowType)
      if (flowId === undefined) {
        const db = new DBProxy()
        db.transaction(() => {
          const sql = 'select flowId from flowCursor where ownerUserId=? and flowType=?'
          db.get(sql, [userId, flowType], (row) => {
            if (row) {
              flowId = row.flowId
              this._flows.set(userId + flowType, flowId)
              resolve(flowId)
            } else {
              this._flows.set(userId + flowType, null)
              resolve(null)
            }
          }, (err) => {
            reject(err)
          })
        })
      } else {
        resolve(flowId)
      }
    })
  }

  setLastFlowId(userId, flowType, flowId) {
    return new Promise((resolve, reject) => {
      if (flowType) {
        this.getLastFlowId(userId, flowType).then((fid) => {
          let sql
          if (fid === null) {
            sql = 'insert into flowCursor(flowId,ownerUserId,flowType) values (?,?,?)'
          } else {
            sql = 'update flowCursor set flowId=? where ownerUserId=? and flowType=?'
          }
          const db = new DBProxy()
          db.transaction(() => {
            if (!flowId) {
              flowId = ''
            }
            db.run(sql, [flowId, userId, flowType], () => {
              this._flows.set(userId + flowType, flowId)
              resolve()
            }, (err) => {
              reject(err)
            })
          })
        })
      } else {
        resolve()
      }
    })
  }
}

module.exports = new FlowCursor()
