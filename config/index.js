const path = require('path')
const fs = require('fs')
const _ = require('lodash')

const config = {
  // ping间隔时间
  pingInterval: 1000 * 60,
  // 打印数据库所有数据
  displayAllData: false,
}

const unversionedPath = path.resolve(__dirname, 'unversioned.js')
if (fs.existsSync(unversionedPath)) {
  _.merge(config, require(unversionedPath))
}

Object.freeze(config)
module.exports = config
