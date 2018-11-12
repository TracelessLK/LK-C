const Manifest = require('./Manifest')
const lkApplication = require('./lk/LKApplication')

const obj = {
  lkApplication,
  Manifest
}

Object.freeze(obj)
// console.log({obj})

module.exports = obj
