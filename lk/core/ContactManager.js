const Application = require('../../common/core/Application')
const EventTarget = require('../../common/core/EventTarget')
const LKContactHandler = require('../logic/handler/LKContactHandler')
const LKMagicCodeHandler = require('../logic/handler/LKMagicCodeHandler')
const MagicCodeManager = require('./MagicCodeManager')
const Contact = require('../store/Contact')
const Device = require('../store/Device')
const Manifest = require('../../Manifest')
const LKContactProvider = require('../logic/provider/LKContactProvider')
const LKDeviceProvider = require('../logic/provider/LKDeviceProvider')

class ContactManager extends EventTarget {
  // just init when register
  asyResetContacts(newMemberMCode, members, friends, groupContacts, userId) {
    const curApp = Application.getCurrentApp()
    return LKContactHandler.asyResetContacts(members, friends, groupContacts, userId || curApp.getCurrentUser().id).then(() => LKMagicCodeHandler.asyUpdateMemberMagicCode(newMemberMCode, userId || curApp.getCurrentUser().id)).then(() => {
      MagicCodeManager.setMemberMagicCode(newMemberMCode)
      this.fire('contactChanged')
    })
  }

  // rebuild the specified members when server add or modify org members
  asyRebuildMembers(newMemberMCode, ids, newMembers) {
    const curApp = Application.getCurrentApp()
    if (ids && ids.length > 0 && newMembers && newMembers.length > 0) {
      const userId = curApp.getCurrentUser().id
      for (let i = 0; i < newMembers.length; i++) {
        const m = newMembers[i]
        if (m.id === userId) {
          Manifest.UserManager.setUserName(m.name)
          Manifest.UserManager.setUserPic(m.pic)
          break
        }
      }
      LKContactHandler.asyRebuidMembers(ids, newMembers, curApp.getCurrentUser().id).then(() => LKMagicCodeHandler.asyUpdateMemberMagicCode(newMemberMCode, curApp.getCurrentUser().id)).then(() => {
        MagicCodeManager.setMemberMagicCode(newMemberMCode)
        this.fire('contactChanged')
      })
    }
  }

  // just update member code
  asyUpdateMemberMagicCode(newMemberMCode) {
    const curApp = Application.getCurrentApp()
    return LKMagicCodeHandler.asyUpdateMemberMagicCode(newMemberMCode, curApp.getCurrentUser().id).then(() => {
      MagicCodeManager.setMemberMagicCode(newMemberMCode)
    })
  }

  async asyAddNewFriend(friend) {
    const userId = Application.getCurrentApp().getCurrentUser().id
    const curContact = await Contact.get(userId, friend.id)
    if (!curContact) { await LKContactHandler.asyAddNewFriend(friend, userId) } else if (curContact.relation == 2) {
      await Contact.updateGroupContact2Friend(friend.id, userId)
    }
    this.fire('contactChanged')
  }

  async removeAll() {
    const userId = Application.getCurrentApp().getCurrentUser().id
    await Contact.removeAll(userId)
    await Device.removeAll(userId)
  }

  /**
     *
     * @param userId
     * @param contactId
     * @returns {*}
     */
  asyGet(userId, contactId) {
    return LKContactProvider.asyGet(userId, contactId)
  }

  /**
     *
     * @param userId
     * @returns {*}
     */
  asyGetAllMembers(userId) {
    return LKContactProvider.asyGetAllMembers(userId)
  }

  /**
     *
     * @param userId
     * @returns {*}
     */
  asyGetAllFriends(userId) {
    return LKContactProvider.asyGetAllFriends(userId)
  }

  /**
     *
     * @param contactId
     * @returns {*}
     */
  asyGetAllDevice(contactId) {
    return LKDeviceProvider.asyGetAll(contactId)
  }

  /**
     *
     * @param userId
     * @param orgId
     * @returns {*}
     */
  asyGetMembersByOrg(userId, orgId) {
    return LKContactProvider.asyGetMembersByOrg(userId, orgId)
  }

  /**
     *
     * @param chatId
     * @returns {*}
     */
  asyGetgroupMemberImg(chatId) {
    return LKContactProvider.asyGetgroupMemberImg(chatId)
  }

  async setContactName(name, id) {
    await Contact.setContactName(name, id)
    // this.fire("contactChanged");
  }

  async setContactPic(pic, id) {
    await Contact.setContactPic(pic, id)
  }
}


module.exports = new ContactManager()
