const DBProxy = require('../../common/store/DBProxy')

class Device {
  getAll(contactId) {
    return new Promise((resolve, reject) => {
      const db = new DBProxy()
      db.transaction(() => {
        const sql = 'select * from device where contactId=?'
        db.getAll(sql, [contactId], (results) => {
          resolve(results)
        }, (err) => {
          reject(err)
        })
      })
    })
  }

  getDevice(deviceId) {
    return new Promise((resolve, reject) => {
      const db = new DBProxy()
      db.transaction(() => {
        const sql = 'select * from device where id=?'
        db.get(sql, [deviceId], (row) => {
          resolve(row)
        }, (err) => {
          reject(err)
        })
      })
    })
  }

  _addDevice(userId, contactId, device) {
    return new Promise((resolve, reject) => {
      const db = new DBProxy()
      db.transaction(() => {
        if (contactId && device) {
          let sql = 'insert into device(ownerUserId,id,publicKey,contactId) values '
          sql += '(?,?,?,?)'
          db.run(sql, [userId, device.id, device.pk, contactId], () => {
            resolve()
          }, (err) => {
            reject(err)
          })
        } else {
          resolve()
        }
      })
    })
  }

  addDevices(userId, contactId, devices) {
    return new Promise((resolve) => {
      const ps = []
      if (devices && devices.length > 0) {
        devices.forEach((device) => {
          ps.push(this._addDevice(userId, contactId, device))
        })
      }
      Promise.all(ps).catch(() => {
        // console.info(err)
      })
      resolve()
      // db.transaction((tx)=>{
      //     if(devices&&devices.length>0){
      //         let sql = "insert into device(id,publicKey,contactId) values ";
      //         var params=[];
      //         for(var i=0;i<devices.length;i++){
      //             var device = devices[i];
      //             sql += "(?,?,?)";
      //             if(i<devices.length-1){
      //                 sql +=",";
      //             }
      //             params.push(device.id);
      //             params.push(device.pk);
      //             params.push(contactId);
      //         }
      //         console.log({params})
      //
      //         tx.executeSql(sql,params,function () {
      //             resolve();
      //         },function (err) {
      //             reject(err);
      //         });
      //     }else{
      //         resolve();
      //     }
      // });
    })
  }

  removeDevices(contactId, devices) {
    return new Promise((resolve, reject) => {
      const db = new DBProxy()
      db.transaction(() => {
        if (devices && devices.length > 0) {
          let sql = 'delete from device where contactId=? and id in( '
          for (let i = 0; i < devices.length; i++) {
            sql += '?'
            if (i < devices.length - 1) {
              sql += ','
            }
          }
          sql += ')'
          const param = [contactId]
          db.run(sql, param.concat(devices), () => {
            resolve()
          }, (err) => {
            reject(err)
          })
        } else {
          resolve()
        }
      })
    })
  }

  removeAll(userId) {
    return new Promise((resolve, reject) => {
      const db = new DBProxy()
      db.transaction(() => {
        const sql2 = 'delete from device where contactId not in (select id from contact where ownerUserId=? )'
        db.run(sql2, [userId], () => {
          resolve()
        }, (err) => {
          reject(err)
        })
      })
    })
  }
}

module.exports = new Device()
