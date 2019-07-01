const EventTarget = require('./EventTarget')

class Application extends EventTarget {
  constructor(appName) {
    super()
    this._appName = appName
    Application._current = this
  }

  setCurrentUser(user, venderId) {
    this._user = user
    this._venderId = venderId
  }

  getCurrentUser() {
    return this._user
  }

  getVenderId() {
    return this._venderId
  }

  setLoginHandler(h) {
    this._loginHandler = h
  }

  getLoginHandler() {
    return this._loginHandler
  }

  getPlatform() {
    if (!this._platform) {
      this._platform = Application.PLATFORM_RN
    }
    return this._platform
  }

  getName() {
    return this._appName
  }

  start(db, platform) {
    this._platform = platform
    this._dataSource = db
  }

  getDataSource() {
    return this._dataSource
  }
}
Application.getCurrentApp = function () {
  return this._current
}
Application.PLATFORM_RN = 1
Application.PLATFORM_ELECTRON = 2
module.exports = Application
