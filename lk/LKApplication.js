const RSAKey = require('react-native-rsa')

const Application = require('../common/core/Application')

const DbUtil = require('./store/DbUtil')
const WSChannel = require('./net/LKWSChannel')
const ChatManager = require('./core/ChatManager')
const ContactManager = require('./core/ContactManager')
const UserManager = require('./core/UserManager')
const OrgManager = require('./core/OrgManager')
const MagicCodeManager = require('./core/MagicCodeManager')
const MFApplyManager = require('./core/MFApplyManager')

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
        this._channel = new WSChannel(`ws://${user.serverIP}:${user.serverPort}`, true)
        this._channel.on('channelChange', ({
          param
        }) => {
          this.fire('netStateChanged', param)
        })
      }
    }

    this.fire('currentUserChanged', { user })
    ChatManager.init(user)
    MagicCodeManager.init(user)
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
    const channel = new WSChannel(`ws://${user.serverIP}:${user.serverPort}`, true)
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
          MagicCodeManager.asyReset(orgMCode, memberMCode, user.id).then(() => OrgManager.asyResetOrgs(orgMCode, orgs, user.id)).then(() => ContactManager.asyResetContacts(memberMCode, members, friends, groupContacts, user.id))
            .then(() => ChatManager.asyResetGroups(groups, user.id))
            .then(() => {
              user.serverPublicKey = serverPK
              return UserManager.asyAddLKUser(user)
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
    // todo: 处理服务端报错和设备在服务端删除的情况
    try {
      await this._channel.asyUnRegister()
    } catch (err) {
      console.log(err)
    }
    const userId = this.getCurrentUser().id
    await ChatManager.removeAll(userId)
    await ContactManager.removeAll(userId)
    await MagicCodeManager.removeAll(userId)
    await MFApplyManager.removeAll(userId)
    await OrgManager.removeAll(userId)
    await UserManager.asyRemoveLKUser(userId)
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
