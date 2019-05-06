const CryptoJS = require('crypto-js')
const LoginHandler = require('../../../common/logic/handler/login/LoginHandler')
const Application = require('../../LKApplication')

class LKLoginHandler extends LoginHandler {
  needLogin() {
    return false
  }

  async asyLogin(userId, password, pwdHash) {
    const result = await Promise.all([Application.getCurrentApp().getLKUserProvider().asyGet(userId), pwdHash])
    const user = result[0]
    const hc = result[1]
    if (hc === user.password) {
      const bytes = CryptoJS.AES.decrypt(user.privateKey, password)
      user.privateKey = bytes.toString(CryptoJS.enc.Utf8)
      Application.getCurrentApp().setCurrentUser(user)
    }
    return userId
  }

  getLogin() {
    return true
  }
}

module.exports = new LKLoginHandler()
