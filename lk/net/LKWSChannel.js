const UUID = require('uuid/v4')
const CryptoJS = require('crypto-js')
const WSChannel = require('../../common/net/WSChannel')
const Application = require('../../common/core/Application')
const ChatManager = require('../core/ChatManager')
const OrgManager = require('../core/OrgManager')
const ContactManager = require("../core/ContactManager")
const MagicCodeManager = require("../core/MagicCodeManager")
const LKContactProvider = require('../logic/provider/LKContactProvider')
const LKContactHandler = require('../logic/handler/LKContactHandler')
const LKChatHandler = require('../logic/handler/LKChatHandler')
const LKChatProvider = require('../logic/provider/LKChatProvider')
const MFApplyManager = require('../core/MFApplyManager')
const FlowCursor = require('../store/FlowCursor')
const LZBase64String = require('../../common/util/lz-base64-string')

class LKChannel extends WSChannel {
  constructor(url) {
    super(url)
    this._callbacks = {}
    this._timeout = 30000
    this._chatMsgPool = new Map()
    this._flowPool = new Map()
    this._ping()
  }

  _putFlowPool(preFlowId, msg) {
    let ary = this._flowPool.get(preFlowId)
    if (!ary) {
      ary = []
      this._flowPool.set(preFlowId, ary)
    }
    ary.push(msg)
  }

  _resolveFlowPool(lastFlowId) {
    const ary = this._flowPool.get(lastFlowId)
    if (ary) {
      ary.forEach((msg) => {
        const action = msg.header.action
        const handler = this[action + "Handler"]
        if (handler) {
          handler.call(this, msg)
        }
      })
    }
  }

  _handleMsg(msg) {
    const header = msg.header
    const isResponse = header.response
    const action = header.action
    if (isResponse) {
      const msgId = header.msgId
      const callback = this._callbacks[msgId]
      if (callback) {
        callback(msg)
      }
    } else if (action) {
      // console.log({msgRecieved: msg})
      const handler = this[action + "Handler"]
      if (handler) {
        if (header.preFlowId) {
          const userId = Application.getCurrentApp().getCurrentUser().id
          FlowCursor.getLastFlowId(userId, header.flowType).then((lastFlowId) => {
            if (lastFlowId) {
              if (header.preFlowId === lastFlowId) {
                handler.call(this, msg)
              } else {
                this._putFlowPool(header.preFlowId, msg)
              }
            } else {
              handler.call(this, msg)
            }
          })
        } else {
          handler.call(this, msg)
        }
      }
    }
  }

  _reportMsgHandled(flowId, flowType) {
    if (flowId && flowType) {
      const userId = Application.getCurrentApp().getCurrentUser().id
      FlowCursor.setLastFlowId(userId, flowType, flowId).then(() => {
        this._resolveFlowPool(flowId)
      })
    }

    this.applyChannel().then((channel) => {
      channel.send(JSON.stringify({ header: {
        version: "1.0",
        flowId,
        response: true
      } }))
    })
  }

  _onmessage(message) {
    const msg = JSON.parse(message.data)
    if (msg.forEach) {
      msg.forEach((m) => {
        this._handleMsg(m)
      })
    } else {
      this._handleMsg(msg)
    }
  }

  _onreconnect() {
    this._lastPongTime = Date.now()
    if (Application.getCurrentApp().getCurrentUser()) { this.asyLogin() }
  }

  _generateMsgId() {
    return UUID()
  }

  async _asyNewRequest(action, content, option) {
    if (option) {
      // console.log(option)
    }
    const msg = {
      header: {
        version: "1.0",
        id: (option && option.id) || this._generateMsgId(),
        action,
        // uid:uid,
        // did:did,

        //target:_target
        // targets:_targets,
        time: option && option.time || Date.now(),
        timeout: Application.getCurrentApp().getMessageTimeout()
      },
      body: {
        // content:_content
        // chatId:chatId,
        // relativeMsgId:relativeMsgId,
        // order:order
      }
    }
    if (option) {
      const target = option.target
      const targets = option.targets
      if (target) {
        msg.header.target = target
      }
      if (targets) {
        msg.header.targets = targets
      }
    }

    msg.body.content = content


    if (Application.getCurrentApp().getCurrentUser()) {
      msg.header.uid = Application.getCurrentApp().getCurrentUser().id
      msg.header.did = Application.getCurrentApp().getCurrentUser().deviceId

      if (option) {
        const chatId = option.chatId
        const relativeMsgId = option.relativeMsgId
        if (chatId) {
          const chat = await ChatManager.asyGetHotChatRandomSent(chatId)

          msg.header.targets = option.targets || chat.members
          msg.body.isGroup = option.isGroup
          msg.body.chatId = chatId
          msg.body.relativeMsgId = relativeMsgId
          msg.body.order = option.order || ChatManager.getChatSendOrder(chatId)
          if (content && content.data) {
            content.data = CryptoJS.AES.encrypt(JSON.stringify(content.data), chat.key).toString()
          }
          msg.body.content = JSON.stringify(content)
          //msg.body.content = option.content||JSON.stringify(content);
          // console.log({content: msg.body.content})
        }
      }
    }
    return msg
  }

  __sendReq(req, timeout) {
    return new Promise((resolve, reject) => {
      const msgId = req.header.id
      const callback = this._callbacks[msgId]
      callback._tryTimes++
      try {
        super.send(JSON.stringify(req))
      } catch (e) {
        if (callback._tryTimes < 2) {
          this.__sendReq(req, timeout).catch(() => {
            reject({ error: "timeout", req })
          })
        } else { reject({ error: "timeout", req }) }
      }

      setTimeout(() => {
        if (this._callbacks[msgId]) {
          if (callback._tryTimes < 2) {
            this.__sendReq(req, timeout).catch(() => {
              reject({ error: "timeout", req })
            })
          } else { reject({ error: "timeout", req }) }
        }
      }, timeout * callback._tryTimes)
    })
  }

  _sendMessage(req, timeout) {
    return new Promise((resolve, reject) => {
      const msgId = req.header.id
      const callback = this._callbacks[msgId] = (msg) => {
        delete this._callbacks[msgId]
        resolve(msg)
      }
      callback._tryTimes = 0
      const _timeout = timeout || this._timeout
      this.__sendReq(req, _timeout).catch((err) => {
        reject(err)
      })
    })
  }

  async _checkMembersDiff(serverMembers) {
    const curApp = Application.getCurrentApp()
    const added = []
    const modified = []
    const removed = []
    const remoteMembers = new Map()
    serverMembers.forEach((m) => {
      remoteMembers.set(m.id, m)
    })
    const localMembers = await LKContactProvider.asyGetAll(curApp.getCurrentUser().id)
    localMembers.forEach((lm) => {
      //let curMCode = lm.mCode
      //let curId = lm.id
      const remoteM = remoteMembers.get(lm.id)
      if (remoteM) {
        if (remoteM.mCode !== lm.mCode) {
          modified.push(lm.id)
        }
        remoteMembers.delete(lm.id)
      } else {
        removed.push(lm.id)
      }
    })
    remoteMembers.forEach((v, k) => {
      added.push(k)
    })
    return { added, modified, removed }
  }

  async _ping() {
    if (this._forceClosed) {
      return
    }
    let deprecated = false
    if (!this._lastPongTime) {
      this._lastPongTime = Date.now()
    } else if (this._openPromise && Date.now() - this._lastPongTime > 180000) {
      try {
        this._ws.close()
      } catch (e) {
        console.info(e)
      }
      delete this._openPromise
      deprecated = true
    }
    if (!deprecated) {
      try {
        const curApp = Application.getCurrentApp()
        let result
        let orgMCode
        let memberMCode
        let checkMCode = false
        if (curApp.getCurrentUser()) {
          result = await Promise.all([MagicCodeManager.asyGetOrgMCode(), MagicCodeManager.asyGetMemberMCode()])
          orgMCode = result[0]
          memberMCode = result[1]
          result = await Promise.all([this.applyChannel(), this._asyNewRequest("ping", { orgMCode, memberMCode })])
          checkMCode = true
        } else {
          result = await Promise.all([this.applyChannel(), this._asyNewRequest("ping")])
        }

        const msg = await result[0]._sendMessage(result[1])
        this._lastPongTime = Date.now()
        if (checkMCode) {
          const content = msg.body.content
          if (orgMCode !== content.orgMCode) {
            const orgs = content.orgs
            if (orgs) {
              await OrgManager.asyResetOrgs(content.orgMCode, orgs, curApp.getCurrentUser().id)
            }
          }
          if (memberMCode !== content.memberMCode) {
            const members = content.members
            if (members) {
              this._checkMembersDiff(members).then((diff) => {
                LKContactHandler.asyRemoveContacts(diff.removed, curApp.getCurrentUser().id)
                //TODO mark the contact has been unregistered
                this._asyFetchMembers(content.memberMCode, diff.added, diff.modified)
              })
            }
          }
        }
      } catch (e) {
        console.log(e)
      }
    }

    setTimeout(() => { this._ping() }, 60000)
  }

  async _asyFetchMembers(remoteMemberMCode, added, modified) {
    const ids = added.concat(modified)
    if (ids.length > 0) {
      const result = await Promise.all([this.applyChannel(), this._asyNewRequest("fetchMembers", { members: ids })])
      return new Promise((resolve) => {
        result[0]._sendMessage(result[1]).then((msg) => {
          const members = msg.body.content.members
          return ContactManager.asyRebuildMembers(remoteMemberMCode, ids, members)
        }).then(() => {
          resolve()
        })
      })
    }
    return ContactManager.asyUpdateMemberMagicCode(remoteMemberMCode)
  }

  async asyLogin() {
    const result = await Promise.all([this.applyChannel(), this._asyNewRequest("login", { venderDid: Application.getCurrentApp().getVenderId() })])
    const msg = await result[0]._sendMessage(result[1])
    if (!msg.body.content.err) {
      const userId = Application.getCurrentApp().getCurrentUser().id
      const minPreFlows = msg.body.content.minPreFlows
      const groups = msg.body.content.groups
      const psAry = [FlowCursor.setLastFlowId(userId, "deviceDiffReport",
        minPreFlows.deviceDiffReport), FlowCursor.setLastFlowId(userId, "group",
        minPreFlows.group), ChatManager.asyResetGroups(groups, userId)]
      await Promise.all(psAry)
      return this.asyGetAllDetainedMsg()
    }
    throw msg.body.content.err
  }

  async asyGetAllDetainedMsg() {
    const result = await Promise.all([this.applyChannel(), this._asyNewRequest("getAllDetainedMsg")])
    return result[0]._sendMessage(result[1])
  }

  async asyRegister(ip, port, uid, did, venderDid, pk, checkCode, qrCode, description, introducerDid) {
    const msg = { uid, did, venderDid, pk, checkCode, qrCode, description, introducerDid }
    const result = await Promise.all([this.applyChannel(), this._asyNewRequest("register", msg)])
    return result[0]._sendMessage(result[1], 60000)
  }

  async asyUnRegister() {
    const result = await Promise.all([this.applyChannel(), this._asyNewRequest("unRegister")])
    return result[0]._sendMessage(result[1])
  }

  sendText(chatId, text, relativeMsgId, isGroup) {
    const content = { type: ChatManager.MESSAGE_TYPE_TEXT, data: text }
    this._sendMsg(chatId, content, relativeMsgId, isGroup)
  }

  sendImage(chatId, imgData, width, height, relativeMsgId, isGroup) {
    const content = { type: ChatManager.MESSAGE_TYPE_IMAGE, data: { data: imgData, width, height } }
    return this._sendMsg(chatId, content, relativeMsgId, isGroup)
  }

  async sendFile(Uploader, chatId, filePath, name, postfix, relativeMsgId, isGroup, onScheduleChanged, onCompleted, onError) {
    const msg = await this._applyUploadChannel(postfix)
    const port = msg.body.content.port
    const newName = msg.body.content.newName
    const upload = new Uploader(filePath, Application.getCurrentApp().getCurrentUser().serverIP, port)
    upload.start()
    upload.onScheduleChanged(onScheduleChanged)
    upload.onCompleted(() => {
      const content = { type: ChatManager.MESSAGE_TYPE_FILE, data: { name, postfix, newName } }
      this._sendMsg(chatId, content, relativeMsgId, isGroup)
      onCompleted()
    })
    upload.onError(onError)
  }

  async _applyUploadChannel(postfix) {
    const result = await Promise.all([this.applyChannel(), this._asyNewRequest("applyUploadChannel", { postfix })])
    return result[0]._sendMessage(result[1])
  }

  sendAudio(chatId, audioData, audioExt, duration, relativeMsgId, isGroup) {
    const content = { type: ChatManager.MESSAGE_TYPE_AUDIO, data: { data: audioData, ext: audioExt, duration } }
    return this._sendMsg(chatId, content, relativeMsgId, isGroup)
  }

  async retrySend(chatId, msgId) {
    const curApp = Application.getCurrentApp()
    const userId = curApp.getCurrentUser().id
    const result = await Promise.all([LKChatProvider.asyGetChat(userId, chatId), LKChatProvider.asyGetMsg(userId, chatId, msgId, true)])
    const chat = result[0]
    const oldMsg = result[1]

    if (oldMsg) {
      this.updateMsgState({
        chatId,
        msgId,
        state: ChatManager.MESSAGE_STATE_SENDING
      })
      if (oldMsg.type === ChatManager.MESSAGE_TYPE_IMAGE || oldMsg.type === ChatManager.MESSAGE_TYPE_AUDIO) {
        oldMsg.content.data = LZBase64String.compressToUTF16(oldMsg.content.data)
        oldMsg.content.compress = true
      }
      const retryResult = await Promise.all([this.applyChannel(), this._asyNewRequest("sendMsg", { type: oldMsg.type, data: oldMsg.type === "0" ? oldMsg.content : JSON.parse(oldMsg.content) }, { isGroup: chat.isGroup, time: oldMsg.sendTime, chatId, relativeMsgId: oldMsg.relativeMsgId, id: oldMsg.id, order: oldMsg.order })])
      retryResult[0]._sendMessage(retryResult[1]).then(() => {
        this.updateMsgState({
          chatId,
          msgId,
          state: ChatManager.MESSAGE_STATE_SERVER_RECEIVE
        })
      }).catch(() => {
        this.updateMsgState({
          chatId,
          msgId,
          state: ChatManager.MESSAGE_STATE_SERVER_NOT_RECEIVE
        })
      })
    }
  }

  updateMsgState(option) {
    const { chatId, msgId, state } = option
    const curApp = Application.getCurrentApp()
    const userId = curApp.getCurrentUser().id
    LKChatHandler.asyUpdateMsgState(userId, chatId, msgId, state).then(() => {
      ChatManager.fire("msgStateChange", {
        msgId, state
      })
    })
  }

  sendGroupText(chatId, text, relativeMsgId) {
    this.sendText(chatId, text, relativeMsgId, true)
  }

  sendGroupImage(chatId, imgData, width, height, relativeMsgId) {
    this.sendImage(chatId, imgData, width, height, relativeMsgId, true)
  }

  sendGroupAudio(chatId, audioData, audioExt, duration, relativeMsgId) {
    this.sendAudio(chatId, audioData, audioExt, duration, relativeMsgId, true)
  }

  async _sendMsg(chatId, content, relativeMsgId, isGroup) {
    const curApp = Application.getCurrentApp()
    const userId = curApp.getCurrentUser().id
    const did = curApp.getCurrentUser().deviceId
    let sendContent = content
    if (content.type === ChatManager.MESSAGE_TYPE_IMAGE) {
      sendContent = { type: content.type, data: { width: content.data.width, height: content.data.height, compress: true } }
      sendContent.data.data = LZBase64String.compressToUTF16(content.data.data)
    } else if (content.type === ChatManager.MESSAGE_TYPE_AUDIO) {
      sendContent = { type: content.type, data: { compress: true, ext: content.data.ext, duration: content.data.duration } }
      sendContent.data.data = LZBase64String.compressToUTF16(content.data.data)
    } else {
      sendContent = { type: content.type, data: content.data }
    }
    const result = await Promise.all([this.applyChannel(), this._asyNewRequest("sendMsg", sendContent, { isGroup, chatId, relativeMsgId })])
    const msgId = result[1].header.id
    const time = result[1].header.time
    const curTime = Date.now()
    let relativeOrder = curTime
    if (relativeMsgId) {
      const relativeMsg = await LKChatProvider.asyGetMsg(userId, chatId, relativeMsgId)
      if (relativeMsg) { relativeOrder = relativeMsg.receiveOrder }
    }
    const psAry = [
      LKChatHandler.asyAddMsg(userId, chatId, msgId, userId, did, content.type, content.data, time, ChatManager.MESSAGE_STATE_SENDING, relativeMsgId, relativeOrder, curTime, result[1].body.order)]
    const dbChangePs = Promise.all(psAry).then(() => {
      ChatManager.fire("msgSend", { chatId, msgId, senderName: curApp.getCurrentUser().name })
    })
    try {
      const psAry2 = [
        result[0]._sendMessage(result[1]),
        dbChangePs
      ]
      await Promise.all(psAry2)
      this.updateMsgState({
        chatId,
        msgId,
        state: ChatManager.MESSAGE_STATE_SERVER_RECEIVE
      })
    } catch (err) {
      await dbChangePs
      this.updateMsgState({
        chatId,
        msgId,
        state: ChatManager.MESSAGE_STATE_SERVER_NOT_RECEIVE
      })
    }
  }

  async msgDeviceDiffReportHandler(msg) {
    const header = msg.header
    const content = msg.body.content
    const msgId = content.msgId
    const chatId = content.chatId
    const diff = content.diff
    if (diff) {
      const added = await ChatManager.deviceChanged(chatId, diff)
      if (added && added.length > 0) {
        const userId = Application.getCurrentApp().getCurrentUser().id
        const result = await Promise.all([LKChatProvider.asyGetChat(userId, chatId), LKChatProvider.asyGetMsg(userId, chatId, msgId, true)])
        const chat = result[0]
        const oldMsg = result[1]
        if (oldMsg) {
          const contentData = oldMsg.type === ChatManager.MESSAGE_TYPE_TEXT ? oldMsg.content : JSON.parse(oldMsg.content)
          if (oldMsg.type === ChatManager.MESSAGE_TYPE_IMAGE || oldMsg.type === ChatManager.MESSAGE_TYPE_AUDIO) {
            contentData.data = LZBase64String.compressToUTF16(oldMsg.data)
            contentData.compress = true
          }
          this._asyNewRequest("sendMsg2", { type: oldMsg.type, data: contentData }, { isGroup: chat.isGroup, time: oldMsg.sendTime, chatId, relativeMsgId: oldMsg.relativeMsgId, id: oldMsg.id, targets: added, order: oldMsg.order }).then((req) => {
            this._sendMessage(req).then(() => {
              this._reportMsgHandled(header.flowId, header.flowType)
              this.updateMsgState({
                chatId,
                msgId,
                state: ChatManager.MESSAGE_STATE_SERVER_RECEIVE
              })
            }).catch(() => {
              this.updateMsgState({
                chatId,
                msgId,
                state: ChatManager.MESSAGE_STATE_SERVER_NOT_RECEIVE
              })
            })
          })
        } else {
          this._reportMsgHandled(header.flowId, header.flowType)
        }
      } else {
        this._reportMsgHandled(header.flowId, header.flowType)
      }
    } else {
      this._reportMsgHandled(header.flowId, header.flowType)
    }
  }

  _getFromChatMsgPool(chatId, msgId) {
    const msgs = this._chatMsgPool.get(chatId)
    if (msgs) {
      return msgs.get(msgId)
    }
  }

  _putChatMsgPool(chatId, msg) {
    let msgs = this._chatMsgPool.get(chatId)
    if (!msgs) {
      msgs = new Map()
      this._chatMsgPool.set(chatId, msgs)
    }
    msgs.set(msg.header.id, msg)
  }

  async _checkChatMsgPool(chatId, relativeMsgId, relativeOrder) {
    const msgs = this._chatMsgPool.get(chatId)
    if (msgs) {
      const ps = []
      const followMsgIds = []
      msgs.forEach((msg) => {
        const header = msg.header
        const body = msg.body
        if (body.relativeMsgId === relativeMsgId) {
          ps.push(this._getReceiveOrder(chatId, relativeMsgId, header.uid, header.did, body.order))
          followMsgIds.push(header.id)
        }
      })
      const orders = await Promise.all(ps)
      for (let i = 0; i < orders.length; i++) {
        const receiveOrder = orders[i]
        const msg = msgs.get(followMsgIds[i])
        this._receiveMsg(chatId, msg, relativeOrder, receiveOrder)
      }
    }
  }

  _delayFire(name, param) {
    if (!this._delayEvents) { this._delayEvents = new Map() }
    let params = this._delayEvents.get(name)
    if (!params) {
      params = []
      this._delayEvents.set(name, params)
    }
    let exists = false
    for (let i = 0; i < params.length; i++) {
      const p = params[i]
      if (JSON.stringify(p) === JSON.stringify(param)) {
        exists = true
        break
      }
    }
    if (!exists) {
      params.push(param)
    }
    this._lastFireTime = Date.now()
    setTimeout(() => {
      this._checkFireDelayEvent()
    }, 3000)
  }

  _checkFireDelayEvent() {
    const now = Date.now()
    if (this._lastFireTime && now - this._lastFireTime > 3000) {
      //fire
      this._delayEvents.forEach((v, k) => {
        v.forEach((ele) => {
          ChatManager.fire(k, ele)
        })
      })
      delete this._delayEvents
      delete this._lastFireTime
    }
  }

  async _receiveMsg(chatId, msg, relativeOrder, receiveOrder) {
    const userId = Application.getCurrentApp().getCurrentUser().id
    const header = msg.header
    const body = msg.body
    const random = header.target.random
    const key = ChatManager.getHotChatKeyReceived(chatId, header.did, random)
    const content = JSON.parse(msg.body.content)
    try {
      const bytes = CryptoJS.AES.decrypt(content.data.toString(), key)
      const data = bytes.toString(CryptoJS.enc.Utf8)
      content.data = JSON.parse(data)
    } catch (e) {
      console.info(e)
    }

    const state = userId === header.uid ? ChatManager.MESSAGE_STATE_SERVER_RECEIVE : null
    if ((content.type === ChatManager.MESSAGE_TYPE_IMAGE || content.type === ChatManager.MESSAGE_TYPE_AUDIO) && content.data.compress) {
      content.data.data = LZBase64String.decompressFromUTF16(content.data.data)
    }
    await LKChatHandler.asyAddMsg(userId, chatId, header.id, header.uid, header.did, content.type, content.data, header.time, state, body.relativeMsgId, relativeOrder, receiveOrder, body.order)
    this._reportMsgHandled(header.flowId, header.flowType)
    this._checkChatMsgPool(chatId, header.id, receiveOrder)
    const option = {
      chatId,
      source: '_receiveMsg'
    }
    ChatManager.fire("otherMsgReceived", option)
  }

  async _getReceiveOrder(chatId, relativeMsgId, senderUid, senderDid, sendOrder) {
    const userId = Application.getCurrentApp().getCurrentUser().id
    const nextMsg = await LKChatProvider.asyGetRelativeNextSendMsg(userId, chatId, relativeMsgId, senderUid, senderDid, sendOrder)
    let receiveOrder
    if (!nextMsg) {
      receiveOrder = Date.now()
    } else {
      receiveOrder = nextMsg.receiveOrder
    }
    return receiveOrder
  }

  sendMsg2Handler(msg) {
    this.sendMsgHandler(msg)
  }

  async sendMsgHandler(msg) {
    const userId = Application.getCurrentApp().getCurrentUser().id
    const header = msg.header
    const body = msg.body
    const senderUid = header.uid
    const senderDid = header.did
    const isGroup = body.isGroup
    const chatId = isGroup ? body.chatId : userId === senderUid ? body.chatId : senderUid
    const _received = await LKChatProvider.asyGetMsg(userId, chatId, header.id)
    if (_received) {
      this._reportMsgHandled(header.flowId)
      return
    } if (this._getFromChatMsgPool(chatId, header.id)) {
      return
    }
    let exits
    if (isGroup) {
      exits = await LKChatProvider.asyGetChat(userId, chatId)
    } else {
      exits = await ChatManager.asyEnsureSingleChat(chatId)
    }
    if (exits) {
      const relativeMsgId = body.relativeMsgId
      const sendOrder = body.order
      let relativeOrder
      let receiveOrder
      if (relativeMsgId) {
        const relativeMsg = await LKChatProvider.asyGetMsg(userId, chatId, relativeMsgId)
        if (relativeMsg) {
          relativeOrder = relativeMsg.receiveOrder
          receiveOrder = await this._getReceiveOrder(chatId, relativeMsgId, senderUid, senderDid, sendOrder)
        } else if (header.RFExist === 0) { //relative msg flow has been deleted by server as a receive report or timeout or this is a new device after relative msg or eat by ghost
          const order = Date.now()
          this._receiveMsg(chatId, msg, order, order)
        } else {
          this._putChatMsgPool(chatId, msg)
        }
      } else {
        relativeOrder = Date.now()
        receiveOrder = await this._getReceiveOrder(chatId, relativeMsgId, senderUid, senderDid, sendOrder)
      }
      if (relativeOrder && receiveOrder) {
        this._receiveMsg(chatId, msg, relativeOrder, receiveOrder)
      }
    } else {
      this._reportMsgHandled(header.flowId)
    }
  }

  async readReport({ chatId, isGroup, senderUid, serverIP, serverPort, msgIds }) {
    const result = await Promise.all([this.applyChannel(), this._asyNewRequest("readReport", { msgIds, chatId, isGroup }, { target: { id: senderUid, serverIP, serverPort } })])
    await result[0]._sendMessage(result[1])
    LKChatHandler.asyUpdateReadState(msgIds, ChatManager.MESSAGE_READSTATE_READREPORT)
  }

  readReportHandler(msg) {
    const userId = Application.getCurrentApp().getCurrentUser().id
    const content = msg.body.content
    const msgIds = content.msgIds
    const isGroup = content.isGroup
    const chatId = isGroup ? content.chatId : userId === msg.header.uid ? content.chatId : msg.header.uid
    const state = ChatManager.MESSAGE_STATE_TARGET_READ
    ChatManager.msgReadReport(msg.header.uid, chatId, msgIds, state).then((result) => {
      if (result.isAllUpdate) { this._reportMsgHandled(msg.header.flowId, msg.header.flowType) }
      if (result.updateNum >= 0) {
        msgIds.forEach(msgId => {
          ChatManager.fire('selfMsgRead', {
            msgId,
            state,
            source: 'readReportHandler'
          })
        })
      }
    })
  }

  async applyMF(contactId, serverIP, serverPort) {
    const result = await Promise.all([this.applyChannel(), this._asyNewRequest("applyMF", {
      name: Application.getCurrentApp().getCurrentUser().name,
      pic: Application.getCurrentApp().getCurrentUser().pic,
      mCode: Application.getCurrentApp().getCurrentUser().mCode
    },
    { target: { id: contactId, serverIP, serverPort } })])
    return result[0]._sendMessage(result[1])
  }

  applyMFHandler(msg) {
    const contactId = msg.header.uid
    const name = msg.body.content.name
    const pic = msg.body.content.pic
    const mCode = msg.body.content.mCode
    const serverIP = msg.header.serverIP
    const serverPort = msg.header.serverPort
    MFApplyManager.asyAddNewMFApply({ id: contactId, name, pic, serverIP, serverPort, mCode }).then(() => {
      this._reportMsgHandled(msg.header.flowId, msg.header.flowType)
    })
  }

  async acceptMF(contactId, contactName, contactPic, serverIP, serverPort, contactMCode) {
    const user = Application.getCurrentApp().getCurrentUser()
    const result = await Promise.all([this.applyChannel(), this._asyNewRequest("acceptMF", { accepter: { name: user.name, pic: user.pic, mCode: user.mCode }, applyer: { name: contactName, pic: contactPic, mCode: contactMCode } },
      { target: { id: contactId, serverIP, serverPort } })])
    return result[0]._sendMessage(result[1])
  }

  acceptMFHandler(msg) {
    const header = msg.header
    const content = msg.body.content
    const user = Application.getCurrentApp().getCurrentUser()
    let friend
    if (header.uid === user.id) {
      const target = content.target
      friend = { id: target.id, serverIP: target.serverIP, serverPort: target.serverPort, name: content.applyer.name, pic: content.applyer.pic, mCode: content.applyer.mCode }
    } else {
      friend = { id: header.uid, serverIP: header.serverIP, serverPort: header.serverPort, name: content.accepter.name, pic: content.accepter.pic, mCode: content.accepter.mCode }
    }
    ContactManager.asyAddNewFriend(friend).then(() => {
      this._reportMsgHandled(header.flowId, header.flowType)
    })
  }

  //members:{id,name,pic,serverIP,serverPort}
  async addGroupChat(chatId, name, members) {
    const result = await Promise.all([this.applyChannel(), this._asyNewRequest("addGroupChat", { chatId, name, members })])
    return result[0]._sendMessage(result[1])
  }

  async addGroupChatHandler(msg) {
    const content = msg.body.content
    const chatId = content.chatId
    const name = content.name
    const members = content.members
    ChatManager.addGroupChat(chatId, name, members).then(() => {
      this._reportMsgHandled(msg.header.flowId, msg.header.flowType)
    })
  }

  async addGroupMembers(chatId, chatName, newMembers) {
    const result = await Promise.all([this.applyChannel(), this._asyNewRequest("addGroupMembers", { chatId, name: chatName, members: newMembers })])
    return result[0]._sendMessage(result[1])
  }

  async addGroupMembersHandler(msg) {
    const header = msg.header
    const content = msg.body.content
    const newMembers = content.members
    const chatId = content.chatId
    const user = Application.getCurrentApp().getCurrentUser()
    let inNewMembers = false
    for (let i = 0; i < newMembers.length; i++) {
      const member = newMembers[i]
      // fixme: ,member is null
      if (member) {
        if (member.id === user.id) {
          inNewMembers = true
          break
        }
      }
    }
    if (inNewMembers) {
      const name = content.name
      const oldMembers = content.oldMembers

      ChatManager.addGroupChat(chatId, name, newMembers.concat(oldMembers)).then(() => {
        this._reportMsgHandled(header.flowId, header.flowType)
      })
    } else {
      const chat = await LKChatProvider.asyGetChat(user.id, chatId)
      if (chat) {
        // fixme: member is null
        if (newMembers[0]) {
          ChatManager.addGroupMembers(chatId, newMembers).then(() => {
            this._reportMsgHandled(header.flowId, header.flowType)
          })
        }
      }
    }
  }

  async setGroupName(chatId, name) {
    const result = await Promise.all([this.applyChannel(), this._asyNewRequest("setGroupName", { chatId, name })])
    return result[0]._sendMessage(result[1])
  }

  async setGroupNameHandler(msg) {
    const header = msg.header
    const chatId = msg.body.content.chatId
    const name = msg.body.content.name
    ChatManager.asyUpdateGroupName(chatId, name).then(() => {
      this._reportMsgHandled(header.flowId, header.flowType)
    })
  }

  async leaveGroup(chatId) {
    const result = await Promise.all([this.applyChannel(), this._asyNewRequest("leaveGroup", { chatId })])
    return result[0]._sendMessage(result[1])
  }

  async leaveGroupHandler(msg) {
    const header = msg.header
    const sender = header.uid
    const chatId = msg.body.content.chatId
    const user = Application.getCurrentApp().getCurrentUser()
    if (sender === user.id) {
      ChatManager.deleteGroup(chatId).then(() => {
        this._reportMsgHandled(header.flowId, header.flowType)
      })
    } else {
      ChatManager.deleteGroupMember(chatId, sender).then(() => {
        this._reportMsgHandled(header.flowId, header.flowType)
      })
    }
  }

  async setUserName(name) {
    const result = await Promise.all([this.applyChannel(), this._asyNewRequest("setUserName", { name })])
    return result[0]._sendMessage(result[1])
  }

  async setUserPic(pic) {
    const result = await Promise.all([this.applyChannel(), this._asyNewRequest("setUserPic", { pic })])
    return result[0]._sendMessage(result[1])
  }
}

module.exports = LKChannel
