const UUID = require('uuid/v4')
const RSAKey = require('react-native-rsa')
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
const Application = require('../LKApplication')

class ChatManager extends EventTarget {
  constructor() {
    super()
    // 承担 发送消息的random缓存
    this._recentChats = []//
    this._recentChatsIndex = {}
    this._maxRecent = 6

    // 接收消息的random缓存
    this._hotChatRandomReceived = {}

    // all chat newmsgnum
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

  // TODO 在chat的成员变化后更新缓存

  // 发消息时用
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
      // chat&members
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

        // delete the oldest
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
        // devices
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
        // remove
        this._recentChats.splice(curIndex, 1)
        delete this._recentChatsIndex[chatId]
        this._resortRecentChats()
        // reset
        return this.asyGetHotChatRandomSent(chatId)
      }
      // resort
      if (curIndex != this._recentChats.length - 1) {
        //const chat = this._recentChats[curIndex]
        this._recentChats.splice(curIndex, 1)
        this._recentChats.push(chat)
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
            this.fire('recentChanged')
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
  async asyReadMsgs(chatId, limit) {
    const userId = Application.getCurrentApp().getCurrentUser().id
    const records = await LKChatProvider.asyGetMsgs(userId, chatId, limit)
    // this._allChatNewMsgNums[chatId] = 0;
    // LKChatHandler.asyUpdateNewMsgNum(userId,chatId,0);
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
    this.fire('msgRead', chatId)
    // console.log({num})
    LKChatProvider.asyGetChat(userId, chatId).then((chat) => {
      targets.forEach((v, k) => {
        Contact.get(userId, k).then((contact) => {
          Application.getCurrentApp().getLKWSChannel().readReport(chatId, chat.isGroup, k, contact.serverIP, contact.serverPort, v)
        })
      })
    })


    return { msgs: records, newMsgs }
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

  // each 5 minutes check readstate and send readreport

  async _ckReportReadstate() {
    const user = Application.getCurrentApp().getCurrentUser()
    if (user) {
      const chats = await LKChatProvider.asyGetAll(user.id)
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
    const userId = Application.getCurrentApp().getCurrentUser().id
    const newMsgs = await LKChatProvider.asyGetMsgsNotRead(userId, chatId)
    return newMsgs.length
    // let newMsgNum = this._allChatNewMsgNums[chatId];
    // return newMsgNum?newMsgNum:0;
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
    const returnAdded = []
    await this.asyGetHotChatRandomSent(chatId)// make sure the chat in the recent hot list
    const userId = Application.getCurrentApp().getCurrentUser().id
    changedMembers.forEach((changed) => {
      LKDeviceHandler.asyAddDevices(userId, changed.id, changed.added)
      LKDeviceHandler.asyRemoveDevices(changed.id, changed.removed)
    })
    // let chat = this._recentChats[this._recentChatsIndex[chatId]];
    this._recentChats.forEach((chat) => {
      const { members } = chat
      for (let i = 0; i < members.length; i++) {
        const member = members[i]
        for (let j = 0; j < changedMembers.length; j++) {
          const changedMember = changedMembers[j]
          if (member.id === changedMember.id) {
            const localDevices = member.devices
            const { removed } = changedMember
            const { added } = changedMember
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
    this.fire('recentChanged')
  }

  /**
     * create new group chat
     * @param name
     * @param members members:{id,name,pic,serverIP,serverPort}
     * @returns {Promise.<Promise|*>}
     */

  async newGroupChat(name, members) {
    const chatId = UUID()
    await Application.getCurrentApp().getLKWSChannel().addGroupChat(chatId, name, members)
    await this.addGroupChat(chatId, name, members, true)
  }

  async addGroupChat(chatId, name, members, local) {
    const userId = Application.getCurrentApp().getCurrentUser().id
    const chat = await Chat.getChat(userId, chatId)
    if (!chat) {
      if (!local) { await Contact.addNewGroupContactIFNotExist(members, userId) }
      await Promise.all([Chat.addGroupChat(userId, chatId, name), Chat.addGroupMembers(userId, chatId, members)])
      this.fire('recentChanged')
    }
  }

  /**
     * add new group members
     * @param chatId
     * @param newMembers
     * @returns {Promise.<void>}
     */
  async newGroupMembers(chatId, name, newMembers) {
    // let oldMembers = await LKChatProvider.asyGetGroupMembers(chatId);
    // let curMembers = [];
    // oldMembers.forEach(function (m) {
    //     curMembers.push(m.id);
    // });
    const userId = Application.getCurrentApp().getCurrentUser().id
    await Application.getCurrentApp().getLKWSChannel().addGroupMembers(chatId, name, newMembers)
    await Chat.addGroupMembers(userId, chatId, newMembers)
    this.fire('groupMemberChange', chatId)
  }

  async addGroupMembers(chatId, newMembers) {
    const userId = Application.getCurrentApp().getCurrentUser().id
    await Promise.all([Contact.addNewGroupContactIFNotExist(newMembers, userId), Chat.addGroupMembers(userId, chatId, newMembers)])
  }

  async asyResetGroups(groups, userId) {
    const ps = []
    // 先清空所有的group chat和group member,否则会重复插入
    await Chat.deleteGroups(userId)
    groups.forEach((group) => {
      ps.push(Chat.addGroupChat(userId, group.id, group.name))
      ps.push(Chat.addGroupMembers(userId, group.id, group.members))
    })
    await Promise.all(ps)
    this.fire('msgChanged')
  }

  /**
     * leave the group
     * @param chatId
     */
  async leaveGroup(chatId) {
    await Application.getCurrentApp().getLKWSChannel().leaveGroup(chatId)
    await this.deleteGroup(chatId)
    this.fire('recentChanged')
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
     * get read report detail of group msg
     * @param chatId
     * @param msgId
     * @returns [{name,state}]
     */
  asyGetGroupMsgReadReport(chatId, msgId) {
    const userId = Application.getCurrentApp().getCurrentUser().id
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
    this.fire('recentChanged')
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

  /**
     * @param userId
     * @param chatId
     * @returns {*}
     */
  asytopChat(userId, chatId) {
    return Chat.topChat(userId, chatId)
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

  /**
     *
     * @param userId
     * @returns {*}
     */
  asyGetAllMsgNotReadNum(userId) {
    const id = userId || Application.getCurrentApp().getCurrentUser().id
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
  asyMessageType(stat, content) {
    if (stat === 0) {
      return content
    } if (stat === 1) {
      return '[图片]'
    } if (stat === 2) {
      return '[文件]'
    } if (stat === 3) {
      return '[语音消息]'
    }
  }
}


module.exports = new ChatManager()
