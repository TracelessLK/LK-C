const Chat = require('../../store/Chat')
const Record = require('../../store/Record')

class LKChatProvider {
  asyDeleteChat(userId, chatId) {
    return Chat.deleteChat(userId, chatId)
  }

  asyGetChat(userId, chatId) {
    return Chat.getChat(userId, chatId)
  }

  asyGetChatName(userId, name) {
    return Chat.getChatName(userId, name)
  }

  asyGetGroupMembers(chatId) {
    return Chat.getGroupMembers(chatId)
  }

  asyGetMsgsNotRead(userId, chatId) {
    return Record.getMsgsNotRead(userId, chatId)
  }

  asyGetAllMsgNotReadNum(userId) {
    return Record.getAllMsgNotReadNum(userId)
  }

  asyGetMsg(userId, chatId, msgId, fetchData) {
    return Record.getMsg(userId, chatId, msgId, fetchData)
  }

  asyGetRelativePreSendMsg(userId, chatId, relativeMsgId, senderUid, senderDid, sendOrder) {
    return Record.getRelativePreSendMsg(userId, chatId, relativeMsgId, senderUid, senderDid, sendOrder)
  }

  asyGetRelativeNextSendMsg(userId, chatId, relativeMsgId, senderUid, senderDid, sendOrder) {
    return Record.getRelativeNextSendMsg(userId, chatId, relativeMsgId, senderUid, senderDid, sendOrder)
  }
}

module.exports = new LKChatProvider()
