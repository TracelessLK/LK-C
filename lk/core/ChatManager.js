const UUID = require('uuid/v4')
const RSAKey = require("react-native-rsa")
const _ = require('lodash')

const EventTarget = require('../../common/core/EventTarget')

const LKChatProvider = require('../logic/provider/LKChatProvider')
const LKContactProvider = require('../logic/provider/LKContactProvider')
const LKDeviceProvider = require('../logic/provider/LKDeviceProvider')
const LKChatHandler = require('../logic/handler/LKChatHandler')
const LKDeviceHandler = require('../logic/handler/LKDeviceHandler')
const Chat = require('../store/Chat')
const DbUtil = require('../store/DbUtil')
const Contact = require('../store/Contact')
const Record = require('../store/Record')
const Application = require('../../common/core/Application')

class ChatManager extends EventTarget {
  constructor() {
    super()
    //承担 发送消息的random缓存
    this._recentChats = []//
    this._recentChatsIndex = {}
    this._maxRecent = 6

    //接收消息的random缓存
    this._hotChatRandomReceived = {}

    this.MESSAGE_STATE_SENDING = 0
    this.MESSAGE_STATE_SERVER_NOT_RECEIVE = 1
    this.MESSAGE_STATE_SERVER_RECEIVE = 2
    this.MESSAGE_STATE_TARGET_RECEIVE = 3
    this.MESSAGE_STATE_TARGET_READ = 4

    this.MESSAGE_TYPE_TEXT = 0
    this.MESSAGE_TYPE_IMAGE = 1
    this.MESSAGE_TYPE_FILE = 2
    this.MESSAGE_TYPE_AUDIO = 3

    this.MESSAGE_READSTATE_READ = 1
    this.MESSAGE_READSTATE_READREPORT = 2

    this._sendOrderSeed = Date.now()
    this._allChatSendOrder = {}
    const source = 'chatManager constructor'

    this.on('otherMsgRead', ({ param }) => {
      const { chatId } = param
      this.fireChatNotReadNum({ chatId, sourceEvent: 'otherMsgRead' })
    })

    this.on('otherMsgReceived', ({ param }) => {
      const { chatId } = param
      this.fireChatNotReadNum({ chatId, sourceEvent: 'otherMsgReceived' })
      this.fire('recentChange', {
        sourceEvent: 'otherMsgReceived',
        source
      })

      this.fire('msgListChange', {
        sourceEvent: 'otherMsgReceived',
        source,
        chatId
      })
    })

    this.on('groupNameChange', ({ param }) => {
      const { chatId } = param
      this.fire('chatChange', {
        chatId,
        sourceEvent: "groupNameChange",
        source
      })
    })

    this.on('msgSend', ({ param }) => {
      const option = {
        source,
        sourceEvent: 'msgSend',
        chatId: param.chatId
      }
      this.fire('msgListChange', option)
      this.fire('chatChange', option)
      this.fire('recentChange', option)
    })

    this.on('selfMsgRead', ({ param, event }) => {
      const { msgId, state } = param
      this.fire("msgStateChange", {
        msgId, state, source, sourceEvent: event
      })
    })

    this.on('msgStateChange', ({ param, event }) => {
      const { msgId } = param
      this.fire('msgItemChange', {
        msgId, source, sourceEvent: event
      })
    })

    this.on('groupMemberChange', ({ param, event }) => {
      const { chatId } = param
      const option = {
        chatId,
        sourceEvent: event,
        source
      }
      this.fire('chatChange', option)
      this.fire('msgListChange', option)
    })
  }

  fireChatNotReadNum({ chatId, sourceEvent }){
    const userId = Application.getCurrentApp().getCurrentUser().id
    const source = 'fireChatNotReadNum'
    this.fire('chatChange', {
      chatId,
      sourceEvent,
      source
    })
    this.asyGetAllMsgNotReadNum(userId).then((num) => {
      this.fire('msgBadgeChange',
        {
          num,
          sourceEvent,
          source
        })
    })
  }

  init(user) {
    this._recentChats = []//
    this._recentChatsIndex = {}
    this._hotChatRandomReceived = {}
    // this._allChatNewMsgNums = {};
    this._sendOrderSeed = Date.now()
    this._allChatSendOrder = {}
    if (user) {
      this._ckReportReadstate()
    }
  }

  //TODO 在chat的成员变化后更新缓存

  //发消息时用
  /**
     *
     * _recentChatsIndex {chatId:int}
     * _recentChats [chat]
     * chat:id name, ... ,members,key,keyGenTime
     * members[{id:contactId,devices:[{id:did,random:}]}]
     *
     * @param chatId
     * @param checkChatKey
     * @returns {Promise.<Array>}
     */
  async asyGetHotChatRandomSent(chatId) {
    const curUser = Application.getCurrentApp().getCurrentUser()
    const userId = curUser.id
    const curIndex = this._recentChatsIndex[chatId]
    if (curIndex === undefined) {
      //chat&members
      const chat = await LKChatProvider.asyGetChat(userId, chatId)
      if (chat) {
        const members = []
        if (chat.isGroup) {
          const gm = await LKChatProvider.asyGetGroupMembers(chatId)
          gm.forEach((m) => {
            const nm = { id: m.id }
            members.push(nm)
            if (m.serverIP) {
              nm.serverIP = m.serverIP
              nm.serverPort = m.serverPort
            }
          })
        } else {
          const contact = await LKContactProvider.asyGet(userId, chat.id)
          const nm = { id: contact.id }
          if (contact.serverIP) {
            nm.serverIP = contact.serverIP
            nm.serverPort = contact.serverPort
          }
          members.push(nm)
          members.push({ id: userId })
        }

        //delete the oldest
        if (this._recentChats.length >= this._maxRecent) {
          const oldChatId = this._recentChats[0].chatId
          delete this._recentChatsIndex[oldChatId]
          this._recentChats.splice(0, 1)
          this._resortRecentChats()
        }
        chat.key = UUID()
        chat.keyGenTime = Date.now()


        chat.members = members
        this._recentChats.push(chat)
        this._recentChatsIndex[chatId] = this._recentChats.length - 1
        const ps = []
        members.forEach((contact) => {
          ps.push(LKDeviceProvider.asyGetAll(contact.id))
        })
        //devices
        const result = await Promise.all(ps)
        for (let i = 0; i < members.length; i++) {
          const member = members[i]
          member.devices = []
          const devices = result[i]
          devices.forEach((device) => {
            if (member.id === userId && device.id === curUser.deviceId) {
              return
            }
            const rsa = new RSAKey()
            rsa.setPublicString(device.publicKey)
            member.devices.push({ id: device.id, random: rsa.encrypt(chat.key) })
          })
        }
      }
    } else {
      const time = Date.now()
      const chat = this._recentChats[curIndex]
      if (time - chat.keyGenTime > 600000) {
        //remove
        this._recentChats.splice(curIndex, 1)
        delete this._recentChatsIndex[chatId]
        this._resortRecentChats()
        //reset
        return this.asyGetHotChatRandomSent(chatId)
      }
      //resort
      if (curIndex !== this._recentChats.length - 1) {
        const chats = this._recentChats[curIndex]
        this._recentChats.splice(curIndex, 1)
        this._recentChats.push(chats)
        this._resortRecentChats()
      }
    }
    return this._recentChats[this._recentChatsIndex[chatId]]
  }

  _resortRecentChats() {
    for (let i = 0; i < this._recentChats.length; i++) {
      this._recentChatsIndex[this._recentChats[i].id] = i
    }
  }

  getHotChatKeyReceived(chatId, senderDid, random) {
    const curApp = Application.getCurrentApp()
    let randoms = this._hotChatRandomReceived[chatId]
    if (!randoms) {
      randoms = {}

      this._hotChatRandomReceived[chatId] = randoms
    }
    let sentRandom = randoms[senderDid]
    if (!sentRandom) {
      sentRandom = { random, key: curApp.getCurrentRSA().decrypt(random) }
      randoms[senderDid] = sentRandom
    }
    if (sentRandom.random !== random) {
      sentRandom.random = random
      sentRandom.key = curApp.getCurrentRSA().decrypt(random)
    }
    return sentRandom.key
  }

  /**
     *  ensure single chat exist
     * @param contactId
     * @returns {Promise}
     */
  asyEnsureSingleChat(contactId) {
    const userId = Application.getCurrentApp().getCurrentUser().id
    return new Promise((resovle) => {
      LKChatProvider.asyGetChat(userId, contactId).then((chat) => {
        if (chat) {
          resovle(true)
        } else {
          LKChatHandler.asyAddSingleChat(userId, contactId).then(() => {
            this.fire("recentChange", {
              source: 'asyEnsureSingleChat'
            })
            resovle(true)
          })
        }
      })
    })
  }

  async mockSingleMsg({contactId, content, unixTime}) {
  	const userId = Application.getCurrentApp().getCurrentUser().id
  	await Record.addMsg(
        	userId, contactId,
        	UUID(), contactId, UUID(), 0,
        	content,
        	unixTime, 2, null, null, null, null, 2)
  }

  async mockMultipleMsg({contactId}) {
		await this.mockSingleMsg({
			contactId,
			content: '22日消息',
			unixTime: 1600731904631
		})
		await this.mockSingleMsg({
        			contactId,
        			content: '21日消息',
        			unixTime: 1600645504631
        		})
        await this.mockSingleMsg({
                			contactId,
                			content: '20日消息',
                			unixTime: 1600559104631
                		})
  	  	this.asyEnsureSingleChat(contactId)
  }

  async ensureNotReadChat() {
    const userId = Application.getCurrentApp().getCurrentUser().id

    const itemAry = await Chat.getNotExistUnreadContact({ userId })
    itemAry.forEach(item => {
      this.asyEnsureSingleChat(item.chatId)
    })
  }


  /**
     * read chat msg
     * @param chatId
     * @param limit
     * @returns {Promise.<{msgs: *, newMsgs: *}>}
     */
  async asyReadMsgs(chatId) {
    const userId = Application.getCurrentApp().getCurrentUser().id
    const newMsgs = await LKChatProvider.asyGetMsgsNotRead(userId, chatId)
    const readNewMsgs = []
    const targets = new Map()
    newMsgs.forEach((record) => {
      readNewMsgs.push(record.id)
      if (!targets.has(record.senderUid)) {
        targets.set(record.senderUid, [])
      }
      targets.get(record.senderUid).push(record.id)
    })
    await LKChatHandler.asyUpdateReadState(readNewMsgs, this.MESSAGE_READSTATE_READ)
    if (newMsgs.length) {
      this.fire("otherMsgRead", { chatId })
    }
    LKChatProvider.asyGetChat(userId, chatId).then((chat) => {
      targets.forEach((v, k) => {
        Contact.get(userId, k).then((contact) => {
          Application.getCurrentApp().getLKWSChannel().readReport(
            {
              chatId,
              isGroup: chat.isGroup,
              senderUid: k,
              serverIP: contact.serverIP,
              serverPort: contact.serverPort,
              msgIds: v
            }
          )
        })
      })
    })
  }

  /**
     * notify the audio has played
     * @param msgId
     * @returns {Promise.<void>}
     */
  async setAudioPlayed(msgId) {
    await Record.setAudioPlayed(msgId)
    this.fire('msgItemChange', {
      msgId,
      source:'setAudioPlayed'
    })
  }

  /**
   * delete the specified msgs
   * @param msgIds string ary or  string
   * @returns {*}
   */
  deleteMsgs(msgIds) {
    return Record.deleteMsgs(msgIds)
  }

  //each 5 minutes check readstate and send readreport

  async _ckReportReadstate() {
    const user = Application.getCurrentApp().getCurrentUser()
    if (user) {
      const chats = await Chat.getAll(user.id)
      const ps = []
      if (chats) {
        chats.forEach((chat) => {
          ps.push(Record.getReadNotReportMsgs(user.id, chat.id))
        })
        const rs = await Promise.all(ps)
        for (let i = 0; i < rs.length; i++) {
          const msgs = rs[i]
          if (msgs) {
            const targets = new Map()
            msgs.forEach((record) => {
              if (!targets.has(record.senderUid)) {
                targets.set(record.senderUid, [])
              }
              targets.get(record.senderUid).push(record.id)
            })
            targets.forEach((v, k) => {
              Contact.get(user.id, k).then((contact) => {
                Application.getCurrentApp().getLKWSChannel().readReport({
                  chatId: chats[i].id,
                  isGroup: chats[i].isGroup,
                  senderUid: k,
                  serverIP: contact.serverIP,
                  serverPort: contact.serverPort,
                  msgIds: v
                })
              })
            })
          }
        }
      }

      setTimeout(() => {
        this._ckReportReadstate()
      }, 5 * 60 * 1000)
    }
  }

  /**
     * get new msg num
     * @param chatId
     * @returns {number}
     */
  async asyGetNewMsgNum(chatId) {
    const userId = Application.getCurrentApp().getCurrentUser().id
    const newMsgs = await LKChatProvider.asyGetMsgsNotRead(userId, chatId)
    return newMsgs.length
  }

  getChatSendOrder(chatId) {
    let sendOrder = this._allChatSendOrder[chatId]
    if (!sendOrder) {
      sendOrder = 0
    }
    sendOrder++
    this._allChatSendOrder[chatId] = sendOrder
    return this._sendOrderSeed + sendOrder
  }

  async deviceChanged(chatId, changedMembers) {
    const returnAdded = []
    await this.asyGetHotChatRandomSent(chatId)//make sure the chat in the recent hot list
    const userId = Application.getCurrentApp().getCurrentUser().id
    changedMembers.forEach((changed) => {
      LKDeviceHandler.asyAddDevices(userId, changed.id, changed.added)
      LKDeviceHandler.asyRemoveDevices(changed.id, changed.removed)
    })
    // let chat = this._recentChats[this._recentChatsIndex[chatId]];
    this._recentChats.forEach((chat) => {
      const members = chat.members
      for (let i = 0; i < members.length; i++) {
        const member = members[i]
        for (let j = 0; j < changedMembers.length; j++) {
          const changedMember = changedMembers[j]
          if (member.id === changedMember.id) {
            const localDevices = member.devices
            const removed = changedMember.removed
            const added = changedMember.added
            for (let k = 0; k < localDevices.length; k++) {
              if (removed.indexOf(localDevices[k].id) !== -1) {
                localDevices.splice(k, 1)
                k--
              }
            }
            if (added.length > 0) {
              const addDevices = []
              added.forEach((addDevice) => {
                let exists = false
                for (let m = 0; m < localDevices.length; m++) {
                  if (localDevices[m].id === addDevice.id) {
                    exists = true
                    if (chat.id === chatId) { addDevices.push(localDevices[m]) }
                    break
                  }
                }
                if (!exists) {
                  const rsa = new RSAKey()
                  rsa.setPublicString(addDevice.pk)
                  const random = rsa.encrypt(chat.key)
                  const newD = { id: addDevice.id, random }
                  localDevices.push(newD)
                  if (chat.id === chatId) { addDevices.push(newD) }
                }
              })
              if (chat.id === chatId) {
                returnAdded.push({
                  id: member.id,
                  serverIP: member.serverIP,
                  serverPort: member.serverPort,
                  devices: addDevices
                })
              }
            }
          }
        }
      }
    })

    return returnAdded
  }

  /**
     * clear recent list
     */
  async clear() {
    await LKChatHandler.asyClear(Application.getCurrentApp().getCurrentUser().id)
    this.fire("recentChange", {
      source: 'clearChat'
    })
  }

  /**
     * create new group chat
     * @param name
     * @param members members:{id,name,pic,serverIP,serverPort}
     * @returns {Promise.<Promise|*>}
     */

  async newGroupChat(name, members, groupAdministrator) {
    const chatId = UUID()
    await Application.getCurrentApp().getLKWSChannel().addGroupChat(chatId, name, members)
    await this.addGroupChat(chatId, name, members, true, groupAdministrator)
  }

  async addGroupChat(chatId, name, members, local, groupAdministrator) {
    const userId = Application.getCurrentApp().getCurrentUser().id
    const chat = await Chat.getChat(userId, chatId)
    if (!chat) {
      if (!local) { await Contact.addNewGroupContactIFNotExist(members, userId) }
      const param = {
        userId,
        chatId,
        name,
        MessageCeiling: null,
        focus: null,
        reserve1: null
      }
      await Promise.all([Chat.addGroupChat(param), Chat.addGroupMembers(userId, chatId, members, groupAdministrator)])
      this.fire("recentChange", {
        source: 'addGroupChat'
      })
    }
  }

  /**
     * add new group members
     * @param chatId
     * @param newMembers
     * @returns {Promise.<void>}
     */
  async newGroupMembers(chatId, name, newMembers) {
    const userId = Application.getCurrentApp().getCurrentUser().id
    await Application.getCurrentApp().getLKWSChannel().addGroupMembers(chatId, name, newMembers)
    await Chat.addGroupMembers(userId, chatId, newMembers)
    this.fire('groupMemberChange', { chatId })
  }

  async addGroupMembers(chatId, newMembers) {
    const userId = Application.getCurrentApp().getCurrentUser().id
    await Promise.all([Contact.addNewGroupContactIFNotExist(newMembers, userId), Chat.addGroupMembers(userId, chatId, newMembers)])
  }

  async asyResetGroups(groups, userId) {
    const groupChatAry = await Chat.getChatID(userId)
    const groupsAdd = _.differenceBy(groups, groupChatAry, 'id')
    const groupsDelete = _.differenceBy(groupChatAry, groups, 'id')
    const ps = []
    if (groupsAdd.length > 0) {
      groupsAdd.forEach((group) => {
        const param = {
          userId,
          chatId: group.id,
          name: group.name,
          MessageCeiling: null,
          focus: null,
          reserve1: null
        }
        ps.push(Chat.addGroupChat(param))
        ps.push(Chat.addGroupMembers(userId, group.id, group.members))
      })
    } else if (groupsDelete.length > 0) {
      groupsDelete.forEach((group) => {
        ps.push(Chat.deleteGroup(userId, group.id))
      })
    }
    if (ps.length) {
      await Promise.all(ps)
      this.fire('recentChange', {
        source: 'asyResetGroups'
      })
    }
  }

  /**
     * leave the group
     * @param chatId
     */
  async leaveGroup(chatId) {
    await Application.getCurrentApp().getLKWSChannel().leaveGroup(chatId)
    await this.deleteGroup(chatId)
    this.fire("recentChange", {
      source: 'leaveGroup'
    })
  }

  deleteGroup(chatId) {
    const userId = Application.getCurrentApp().getCurrentUser().id
    return Chat.deleteGroup(userId, chatId)
  }

  deleteGroupMember(chatId, memberId) {
    const userId = Application.getCurrentApp().getCurrentUser().id
    return Chat.deleteGroupMember(userId, chatId, memberId)
  }

  async removeAll() {
    const userId = Application.getCurrentApp().getCurrentUser().id
    await Chat.removeAll(userId)
    await Record.removeAll(userId)
  }

  async msgReadReport(reporterUid, chatId, msgIds, state) {
    const userId = Application.getCurrentApp().getCurrentUser().id
    const chat = await LKChatProvider.asyGetChat(userId, chatId)
    if (chat) {
      return Record.msgReadReport(userId, chatId, msgIds, reporterUid, state, chat.isGroup)
    }
    return { isAllUpdate: true, updateNum: 0 }
  }

  /**
     * update group name
     * @param chatId
     * @param name
     * @returns {Promise.<*|Promise>}
     */
  async asySetGroupName(chatId, name) {
    await Application.getCurrentApp().getLKWSChannel().setGroupName(chatId, name)
    this.asyUpdateGroupName(chatId, name)
    this.fire('groupNameChange', {
      chatId,
      name
    })
  }

  asyUpdateGroupName(chatId, name) {
    const userId = Application.getCurrentApp().getCurrentUser().id
    return Chat.setGroupName(userId, chatId, name)
  }

  /**
     * @param userId
     * @param chatId
     * @returns {*}
     */
  asyGetChat(userId, chatId) {
    return LKChatProvider.asyGetChat(userId, chatId)
  }

  asyGetChatName(userId, name) {
    return LKChatProvider.asyGetChatName(userId, name)
  }

  async asyMessageCeiling(MessageCeiling, userId, chatId) {
    await Chat.MessageCeiling(MessageCeiling, userId, chatId)
    this.fire('recentChange', {
      source: 'topChat'
    })
  }

 async asyMessageFocus(focus, userId, chatId) {
   await Chat.messageFocus(focus, userId, chatId)
   this.fire("chatChange", {
     source: 'asyMessageFocus',
     focus,userId, chatId
   })
  }

  async asymessageDraft(reserve1, userId, chatId) {
    await Chat.messageDraft(reserve1, userId, chatId)
    this.fire("chatChange", {
      source: 'asymessageDraft',
      chatId
    })
  }

  /**
     *
     * @param chatId
     * @returns {*}
     */
  asyGetGroupMembers(chatId) {
    return LKChatProvider.asyGetGroupMembers(chatId)
  }


  asyGetGroupMember(chatId, contactId) {
    return Chat.getGroupMember(chatId, contactId)
  }

  /**
     *
     * @param userId
     * @returns {*}
     */
  asyGetAllMsgNotReadNum(userId) {
    const id = userId || Application.getCurrentApp().getCurrentUser().id
    return LKChatProvider.asyGetAllMsgNotReadNum(id)
  }

  getAllChat(userId) {
    return Chat.getAllChat({ userId })
  }

  /**
     *
     * @param userId
     * @param chatId
     * @returns {*}
     */
  async asyDeleteChat({ chatId }) {
    const userId = Application.getCurrentApp().getCurrentUser().id
    await LKChatProvider.asyDeleteChat(userId, chatId)
    this.fire('recentChange', {
      source: 'asyDeleteChat'
    })
  }

  /**
     *
     * @param userId
     * @param chatId
     * @param msgId
     * @param fetchData
     */
  asyGetMsg(userId, chatId, msgId, fetchData) {
    return LKChatProvider.asyGetMsg(userId, chatId, msgId, fetchData)
  }

  asyGetMessageSearch(userId, content) {
    return Record.getMessageSearch(userId, content)
  }

  /*
  * @param viewName
  */
  asyGetAllViewData(viewName) {
    return DbUtil.getAllViewData(viewName)
  }

  /*
   * @param tableName
   */
  asyGetAllData(tableName) {
    return DbUtil.getAllTableData(tableName)
  }

  /*
     * 获取所有表名
     */
  getAllTableAry() {
    return DbUtil.getAllTableAry()
  }

  /*
   * 获取所有view名
   */
  getAllViewAry() {
    return DbUtil.getAllViewAry()
  }

  /*
   * @param sql
   * @param param
   * 运行传入的sql,返回结果
   */

  runSql(sql, param) {
    return DbUtil.runSql(sql, param)
  }

  /**
     * 消息类型显示
     * @param stat 类型
     * @param content 消息内容
     * @returns {*} 返回结果
     */
  asyMessageType(type, content) {
    if (type === 0) {
      return content
    } if (type === 1) {
      return '[图片]'
    } if (type === 2) {
      return '[文件]'
    } if (type === 3) {
      return '[语音消息]'
    }
  }

  getLastMsgContent({
    type, content, senderUid, senderName
  }) {
    let result
    const curUser = Application.getCurrentApp().getCurrentUser()
    const userId = curUser.id
    let prefix
    if (userId === senderUid) {
      prefix = "我"
    } else {
      prefix = senderName
    }
    prefix += ': '
    if (type === this.MESSAGE_TYPE_TEXT) {
      content = content.trim().replace(/&nbsp||\n/g, ' ')
      result = content
    } if (type === this.MESSAGE_TYPE_IMAGE) {
      result = '[图片]'
    } if (type === this.MESSAGE_TYPE_FILE) {
      result = '[文件]'
    } if (type === this.MESSAGE_TYPE_AUDIO) {
      result = '[语音]'
    }
    result = prefix + result
    return result
  }

  // option {
  // userId, chatId, limit
  // }
  getAllMsg(option) {
    return Record.getAllMsg(option)
  }

  getAllReadState(option) {
    return Record.getAllReadState(option)
  }

  getAllGroupMember(option) {
    const { chatId } = option
    const curUser = Application.getCurrentApp().getCurrentUser()
    const userId = curUser.id
    return Chat.getAllGroupMember({
      chatId, userId
    })
  }

  getNonGroupMember(option) {
    const { chatId } = option
    const curUser = Application.getCurrentApp().getCurrentUser()
    const userId = curUser.id
    return Chat.getNonGroupMember({
      chatId, userId
    })
  }

  getTotalCount(option) {
    return Record.getTotalMsgCount(option)
  }

  getSingeChat({ chatId }) {
    const curUser = Application.getCurrentApp().getCurrentUser()
    const userId = curUser.id
    return Chat.getSingeChat({
      chatId, userId
    })
  }

  getSingleMsg(option) {
    return Record.getSingleMsg(option)
  }
}


module.exports = new ChatManager()
