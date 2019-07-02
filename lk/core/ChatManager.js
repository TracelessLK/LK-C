const UUID = require('uuid/v4')
const RSAKey = require("react-native-rsa")
const _ = require('lodash')

const EventTarget = require('../../common/core/EventTarget')
//const ContactManager = require('./ContactManager')

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
const config = require('../../config')

class ChatManager extends EventTarget {
  constructor() {
    super()
    //承担 发送消息的random缓存
    this._recentChats = []//
    this._recentChatsIndex = {}
    this._maxRecent = 6

    //接收消息的random缓存
    this._hotChatRandomReceived = {}

    //all chat newmsgnum
    // _allChatNewMsgNums = {}

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

    this.on('otherMsgRead', ({param}) => {
      const {chatId} = param
      this.fireChatNotReadNum(chatId)
    })

    this.on('otherMsgReceived', ({param}) => {
      const {chatId} = param
      this.fireChatNotReadNum(chatId)
    })

    this.on('groupNameChange', ({param}) => {
      const {chatId, name} = param
      this.fire('chatChange', {chatId, name})
    })
  }

  fireChatNotReadNum = (chatId) => {
    let curUser = Application.getCurrentApp().getCurrentUser()
    let userId = curUser.id
    this.asyGetNewMsgNum(chatId).then((chatNotReadNum) => {
      this.fire('chatChange', {chatId, chatNotReadNum})
    })
    this.asyGetAllMsgNotReadNum(userId).then((num) => {
      this.fire('msgBadgeChanged', {num})
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
    let curUser = Application.getCurrentApp().getCurrentUser()
    let userId = curUser.id
    let curIndex = this._recentChatsIndex[chatId]
    if (curIndex === undefined) {
      //chat&members
      let chat = await LKChatProvider.asyGetChat(userId, chatId)
      if (chat) {
        let members = []
        if (chat.isGroup) {
          let gm = await LKChatProvider.asyGetGroupMembers(chatId)
          gm.forEach((m) => {
            let nm = {id: m.id}
            members.push(nm)
            if (m.serverIP) {
              nm.serverIP = m.serverIP
              nm.serverPort = m.serverPort
            }
          })
        } else {
          let contact = await LKContactProvider.asyGet(userId, chat.id)
          let nm = {id: contact.id}
          if (contact.serverIP) {
            nm.serverIP = contact.serverIP
            nm.serverPort = contact.serverPort
          }
          members.push(nm)
          members.push({id: userId})
        }

        //delete the oldest
        if (this._recentChats.length >= this._maxRecent) {
          let oldChatId = this._recentChats[0].chatId
          delete this._recentChatsIndex[oldChatId]
          this._recentChats.splice(0, 1)
          this._resortRecentChats()
        }
        chat.key = UUID()
        chat.keyGenTime = Date.now()


        chat.members = members
        this._recentChats.push(chat)
        this._recentChatsIndex[chatId] = this._recentChats.length - 1
        let ps = []
        members.forEach((contact) => {
          ps.push(LKDeviceProvider.asyGetAll(contact.id))
        })
        //devices
        let result = await Promise.all(ps)
        for (let i = 0; i < members.length; i++) {
          let member = members[i]
          member.devices = []
          let devices = result[i]
          devices.forEach((device) => {
            if (member.id === userId && device.id === curUser.deviceId) {
              return
            }
            let rsa = new RSAKey()
            rsa.setPublicString(device.publicKey)
            member.devices.push({id: device.id, random: rsa.encrypt(chat.key)})
          })
        }
      }
    } else {
      let time = Date.now()
      let chat = this._recentChats[curIndex]
      if (time - chat.keyGenTime > 600000) {
        //remove
        this._recentChats.splice(curIndex, 1)
        delete this._recentChatsIndex[chatId]
        this._resortRecentChats()
        //reset
        return this.asyGetHotChatRandomSent(chatId)
      }
      //resort
      if (curIndex != this._recentChats.length - 1) {
        let chats = this._recentChats[curIndex]
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
    let curApp = Application.getCurrentApp()
    let randoms = this._hotChatRandomReceived[chatId]
    if (!randoms) {
      randoms = {}

      this._hotChatRandomReceived[chatId] = randoms
    }
    let sentRandom = randoms[senderDid]
    if (!sentRandom) {
      sentRandom = {random, key: curApp.getCurrentRSA().decrypt(random)}
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
    let userId = Application.getCurrentApp().getCurrentUser().id
    return new Promise((resovle) => {
      LKChatProvider.asyGetChat(userId, contactId).then((chat) => {
        if (chat) {
          resovle(true)
        } else {
          LKChatHandler.asyAddSingleChat(userId, contactId).then(() => {
            this.fire("recentChange")
            resovle(true)
          })
        }
      })
    })
  }


  /**
     * read chat msg
     * @param chatId
     * @param limit
     * @returns {Promise.<{msgs: *, newMsgs: *}>}
     */
  async asyReadMsgs(chatId) {
    let userId = Application.getCurrentApp().getCurrentUser().id
    let newMsgs = await LKChatProvider.asyGetMsgsNotRead(userId, chatId)
    let readNewMsgs = []
    let targets = new Map()
    newMsgs.forEach((record) => {
      readNewMsgs.push(record.id)
      if (!targets.has(record.senderUid)) {
        targets.set(record.senderUid, [])
      }
      targets.get(record.senderUid).push(record.id)
    })
    await LKChatHandler.asyUpdateReadState(readNewMsgs, this.MESSAGE_READSTATE_READ)
    this.fire("otherMsgRead", {chatId})
    // console.log({num})
    LKChatProvider.asyGetChat(userId, chatId).then((chat) => {
      targets.forEach((v, k) => {
        Contact.get(userId, k).then((contact) => {
          Application.getCurrentApp().getLKWSChannel().readReport(chatId, chat.isGroup, k, contact.serverIP, contact.serverPort, v)
        })
      })
    })
  }

  /**
     * notify the audio has played
     * @param msgId
     * @returns {Promise.<void>}
     */
  setAudioPlayed(msgId) {
    return Record.setAudioPlayed(msgId)
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
    let user = Application.getCurrentApp().getCurrentUser()
    if (user) {
      let chats = await LKChatProvider.asyGetAll(user.id)
      let ps = []
      if (chats) {
        chats.forEach((chat) => {
          ps.push(Record.getReadNotReportMsgs(user.id, chat.id))
        })
        let rs = await Promise.all(ps)
        for (let i = 0; i < rs.length; i++) {
          let msgs = rs[i]
          if (msgs) {
            let targets = new Map()
            msgs.forEach((record) => {
              if (!targets.has(record.senderUid)) {
                targets.set(record.senderUid, [])
              }
              targets.get(record.senderUid).push(record.id)
            })
            targets.forEach((v, k) => {
              Contact.get(user.id, k).then((contact) => {
                Application.getCurrentApp().getLKWSChannel().readReport(chats[i].id, chats[i].isGroup, k, contact.serverIP, contact.serverPort, v)
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

  // async _initAllChatNewMsgNums(userId){
  //     let chats = await LKChatProvider.asyGetAll(userId);
  //     chats.forEach((chat)=>{
  //         this._allChatNewMsgNums[chat.id] = chat.newMsgNum;
  //     });
  // }

  /**
     * get new msg num
     * @param chatId
     * @returns {number}
     */
  async asyGetNewMsgNum(chatId) {
    let userId = Application.getCurrentApp().getCurrentUser().id
    let newMsgs = await LKChatProvider.asyGetMsgsNotRead(userId, chatId)
    return newMsgs.length
  }

  // increaseNewMsgNum(chatId){
  //     let newMsgNum = this._allChatNewMsgNums[chatId];
  //     this._allChatNewMsgNums[chatId]= (newMsgNum?newMsgNum:0)+1;
  //     let userId = Application.getCurrentApp().getCurrentUser().id;
  //     // LKChatHandler.asyUpdateNewMsgNum(userId,chatId,this._allChatNewMsgNums[chatId]);
  //
  // }

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
    let returnAdded = []
    await this.asyGetHotChatRandomSent(chatId)//make sure the chat in the recent hot list
    let userId = Application.getCurrentApp().getCurrentUser().id
    changedMembers.forEach((changed) => {
      LKDeviceHandler.asyAddDevices(userId, changed.id, changed.added)
      LKDeviceHandler.asyRemoveDevices(changed.id, changed.removed)
    })
    // let chat = this._recentChats[this._recentChatsIndex[chatId]];
    this._recentChats.forEach((chat) => {
      let members = chat.members
      for (let i = 0; i < members.length; i++) {
        let member = members[i]
        for (let j = 0; j < changedMembers.length; j++) {
          let changedMember = changedMembers[j]
          if (member.id === changedMember.id) {
            let localDevices = member.devices
            let removed = changedMember.removed
            let added = changedMember.added
            for (let k = 0; k < localDevices.length; k++) {
              if (removed.indexOf(localDevices[k].id) != -1) {
                localDevices.splice(k, 1)
                k--
              }
            }
            if (added.length > 0) {
              let addDevices = []
              added.forEach((addDevice) => {
                let exists = false
                for (let m = 0; m < localDevices.length; m++) {
                  if (localDevices[m].id == addDevice.id) {
                    exists = true
                    if (chat.id === chatId) { addDevices.push(localDevices[m]) }
                    break
                  }
                }
                if (!exists) {
                  let rsa = new RSAKey()
                  rsa.setPublicString(addDevice.pk)
                  let random = rsa.encrypt(chat.key)
                  let newD = {id: addDevice.id, random}
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
    this.fire("recentChange")
  }

  /**
     * create new group chat
     * @param name
     * @param members members:{id,name,pic,serverIP,serverPort}
     * @returns {Promise.<Promise|*>}
     */

  async newGroupChat(name, members, groupAdministrator) {
    let chatId = UUID()
    await Application.getCurrentApp().getLKWSChannel().addGroupChat(chatId, name, members)
    await this.addGroupChat(chatId, name, members, true, groupAdministrator)
  }

  async addGroupChat(chatId, name, members, local, groupAdministrator) {
    let userId = Application.getCurrentApp().getCurrentUser().id
    const chat = await Chat.getChat(userId, chatId)
    if (!chat) {
      if (!local) { await Contact.addNewGroupContactIFNotExist(members, userId) }
      await Promise.all([Chat.addGroupChat(userId, chatId, name, Date.now(), null, null, null), Chat.addGroupMembers(userId, chatId, members, groupAdministrator)])
      this.fire("recentChange")
    }
  }

  /**
     * add new group members
     * @param chatId
     * @param newMembers
     * @returns {Promise.<void>}
     */
  async newGroupMembers(chatId, name, newMembers) {
    let userId = Application.getCurrentApp().getCurrentUser().id
    await Application.getCurrentApp().getLKWSChannel().addGroupMembers(chatId, name, newMembers)
    await Chat.addGroupMembers(userId, chatId, newMembers)
    this.fire('groupMemberChange', chatId)
  }

  async addGroupMembers(chatId, newMembers) {
    let userId = Application.getCurrentApp().getCurrentUser().id
    await Promise.all([Contact.addNewGroupContactIFNotExist(newMembers, userId), Chat.addGroupMembers(userId, chatId, newMembers)])
  }

  async asyResetGroups(groups, userId) {
    const groupChatAry = await Chat.getChatID(userId)
    const groupsAdd = _.differenceBy(groups, groupChatAry, 'id')
    const groupsDelete = _.differenceBy(groupChatAry, groups, 'id')
    const ps = []
    if (groupsAdd.length > 0) {
      groupsAdd.forEach((group) => {
        ps.push(Chat.addGroupChat(userId, group.id, group.name, null, null, false, null))
        ps.push(Chat.addGroupMembers(userId, group.id, group.members))
      })
    } else if (groupsDelete.length > 0) {
      groupsDelete.forEach((group) => {
        ps.push(Chat.deleteGroup(userId, group.id))
      })
    }

    await Promise.all(ps)
    this.fire('recentChange')
  }

  /**
     * leave the group
     * @param chatId
     */
  async leaveGroup(chatId) {
    await Application.getCurrentApp().getLKWSChannel().leaveGroup(chatId)
    await this.deleteGroup(chatId)
    this.fire("recentChange")
  }

  deleteGroup(chatId) {
    let userId = Application.getCurrentApp().getCurrentUser().id
    return Chat.deleteGroup(userId, chatId)
  }

  deleteGroupMember(chatId, memberId) {
    let userId = Application.getCurrentApp().getCurrentUser().id
    return Chat.deleteGroupMember(userId, chatId, memberId)
  }

  async removeAll() {
    let userId = Application.getCurrentApp().getCurrentUser().id
    await Chat.removeAll(userId)
    await Record.removeAll(userId)
  }

  async msgReadReport(reporterUid, chatId, msgIds, state) {
    let userId = Application.getCurrentApp().getCurrentUser().id
    let chat = await LKChatProvider.asyGetChat(userId, chatId)
    if (chat) {
      return Record.msgReadReport(userId, chatId, msgIds, reporterUid, state, chat.isGroup)
    }
    return {isAllUpdate: true, updateNum: 0}
  }

  /**
     * get read report detail of group msg
     * @param chatId
     * @param msgId
     * @returns [{name,state}]
     */
  asyGetGroupMsgReadReport(chatId, msgId) {
    let userId = Application.getCurrentApp().getCurrentUser().id
    return Record.getGroupMsgReadReport(userId, chatId, msgId)
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
    let userId = Application.getCurrentApp().getCurrentUser().id
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

  /**
     * @param userId
     * @param chatId
     * @returns {*}
     */
  asytopChat(userId, chatId) {
    return Chat.topChat(userId, chatId)
  }

  asyMessageCeiling(MessageCeiling, userId, chatId) {
    return Chat.MessageCeiling(MessageCeiling, userId, chatId)
  }

  asyMessageFocus(focus, userId, chatId) {
    return Chat.messageFocus(focus, userId, chatId)
  }

  asymessageDraft(reserve1, userId, chatId) {
    return Chat.messageDraft(reserve1, userId, chatId)
  }
  /**
     *
     * @param chatId
     * @returns {*}
     */
  asyGetGroupMembers(chatId) {
    return LKChatProvider.asyGetGroupMembers(chatId)
  }

  /**
     *
     * @param userId
     * @param chatId
     * @param limit
     * @returns {*}
     */
  asyGetMsgs(userId, chatId, limit) {
    return LKChatProvider.asyGetMsgs(userId, chatId, limit)
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
    let id = userId || Application.getCurrentApp().getCurrentUser().id
    return LKChatProvider.asyGetAllMsgNotReadNum(id)
  }

  /**
     *
     * @param userId
     * @returns {*}
     */
  asyGetAll(userId) {
    return LKChatProvider.asyGetAll(userId)
  }

  getAllChat(userId) {
    return Chat.getAllChat({userId})
  }

  /**
     *
     * @param userId
     * @param chatId
     * @returns {*}
     */
  asyDeleteChat(userId, chatId) {
    return LKChatProvider.asyDeleteChat(userId, chatId)
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

  /*
    * @param userId
    * @param chatId
    */
  asyGetLastMsg(userId, chatId) {
    return Record.getLastMsg(userId, chatId)
  }

  asyGetAllLastMsg(userId) {
    return Record.getAllLastMsg(userId)
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
    let curUser = Application.getCurrentApp().getCurrentUser()
    let userId = curUser.id
    let prefix
    if (userId === senderUid) {
      prefix = "我"
    } else {
      prefix = senderName
    }
    prefix += ': '
    if (type === this.MESSAGE_TYPE_TEXT) {
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
    const {chatId} = option
    let curUser = Application.getCurrentApp().getCurrentUser()
    let userId = curUser.id
    return Chat.getAllGroupMember({
      chatId, userId
    })
  }

  getNonGroupMember(option) {
    const {chatId} = option
    let curUser = Application.getCurrentApp().getCurrentUser()
    let userId = curUser.id
    return Chat.getNonGroupMember({
      chatId, userId
    })
  }
}


module.exports = new ChatManager()
