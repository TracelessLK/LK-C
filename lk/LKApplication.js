const RSAKey = require('react-native-rsa')

const Application = require('../common/core/Application')
const ConfigManager = require('../common/core/ConfigManager')
const DbUtil = require('./store/DbUtil')

const { prepareDb } = DbUtil

class LKApplication extends Application {
  constructor(name) {
    super(name)
  }

  setCurrentUser(user, venderId, preventAutoLogin) {
    super.setCurrentUser(user, venderId)
    delete this._rsa


    const url = user ? `ws://${user.serverIP}:${user.serverPort}` : null
    if (!this._channel || (this._channel.getUrl() !== url)) {
      if (this._channel) {
        this._channel.close()
        delete this._channel
      }
      if (url) {
        this._channel = new (ConfigManager.getWSChannel())(`ws://${user.serverIP}:${user.serverPort}`, true)
        this._channel.on('connectionFail', () => {
          this.fire('netStateChanged', false)
        })
        this._channel.on('connectionOpen', () => {
          this.fire('netStateChanged', true)
        })
      }
    }

    this.fire('currentUserChanged', user)
    ConfigManager.getChatManager().init(user)
    ConfigManager.getMagicCodeManager().init(user)
    if (preventAutoLogin !== true) {
      this.login()
    }
  }

  login() {
    const user = this._user
    if (user) {
      const rsa = new RSAKey()
      rsa.setPrivateString(user.privateKey)
      this._rsa = rsa
    }
    if (this._channel) {
      this._channel.applyChannel().then((channel) => {
        channel.asyLogin(user.id, user.password)
      })
    }
  }

  getLogin() {
    return this._login
  }

  setLogin(user) {
    this._login = user
  }

  start(db, platform) {
    super.start(db, platform)

    return prepareDb()
  }

  getCurrentRSA() {
    return this._rsa
  }

  asyAuthorize(user, introducerDid, description) {
    return this.asyRegister(user, null, null, null, description, introducerDid)
  }

  asyRegister(user, venderDid, checkCode, qrcode, description, introducerDid) {
    return this.register({
      user,
      venderDid,
      checkCode,
      qrcode,
      description,
      introducerDid,
      requestName: 'register'
    })
  }

  updateRegister({ user, venderDid, description }) {
    return this.register({
      user, venderDid, description, requestName: 'updateRegister'
    })
  }

  register({
    user, venderDid, checkCode, qrcode, description, introducerDid, requestName
  }) {
    const channel = new (ConfigManager.getWSChannel())(`ws://${user.serverIP}:${user.serverPort}`, true)
    return new Promise((resolve, reject) => {
      channel.asyRegister(user.serverIP, user.serverPort, user.id, user.deviceId, venderDid, user.publicKey, checkCode, qrcode, description, introducerDid, requestName).then((msg) => {
        const { content } = msg.body
        if (content.error) {
          reject(content.error)
        } else {
          // console.log({content})
          const serverPK = content.publicKey
          const { orgMCode } = content
          const { orgs } = content
          const { memberMCode } = content
          const { members } = content
          const { friends } = content
          const { groupContacts } = content
          const { groups } = content
          ConfigManager.getMagicCodeManager().asyReset(orgMCode, memberMCode, user.id).then(() => ConfigManager.getOrgManager().asyResetOrgs(orgMCode, orgs, user.id)).then(() => ConfigManager.getContactManager().asyResetContacts(memberMCode, members, friends, groupContacts, user.id))
            .then(() => ConfigManager.getChatManager().asyResetGroups(groups, user.id))
            .then(() => {
              user.serverPublicKey = serverPK
              return ConfigManager.getUserManager().asyAddLKUser(user)
            })
            .then(() => {
              resolve(user)
            })
            .catch((err) => {
              reject(err)
            })
        }
      })
    })
  }

  async asyUnRegister() {
    await this._channel.asyUnRegister()
    const userId = this.getCurrentUser().id
    await ConfigManager.getChatManager().removeAll(userId)
    await ConfigManager.getContactManager().removeAll(userId)
    await ConfigManager.getMagicCodeManager().removeAll(userId)
    await ConfigManager.getMFApplyManager().removeAll(userId)
    await ConfigManager.getOrgManager().removeAll(userId)
    await ConfigManager.getUserManager().asyRemoveLKUser(userId)
    this.setCurrentUser(null)
  }

  getLKWSChannel() {
    return this._channel
  }

  setMessageTimeout(timeout) {
    this._messageTimeout = timeout
  }

  getMessageTimeout() {
    return this._messageTimeout
  }
}


new LKApplication('LK')
module.exports = LKApplication
