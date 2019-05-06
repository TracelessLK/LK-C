const EventTarget = require('./EventTarget')

class ConfigManager extends EventTarget {
  configure(name, obj) {
    if (this[name]) {
      throw `${name} already exist`
    }
    this[name] = obj
    this[`get${name}`] = () => obj
  }

  get(name) {
    return this[name]
  }
}
module.exports = new ConfigManager()
