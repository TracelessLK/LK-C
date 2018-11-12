const Mainfest = require('./Manifest')
const lkApplication = require('./lk/LKApplication')

const obj = {
  lkApplication,
  Mainfest
}

Object.freeze(obj)
// console.log({obj})

module.exports = obj
