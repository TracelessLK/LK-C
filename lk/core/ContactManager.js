const Application = require('../LKApplication')
const EventTarget = require('../../common/core/EventTarget')
const LKContactHandler = require('../logic/handler/LKContactHandler')
const LKMagicCodeHandler = require('../logic/handler/LKMagicCodeHandler')
const MagicCodeManager = require('./MagicCodeManager')
const Contact = require('../store/Contact')
const Device = require('../store/Device')
const ConfigManager = require('../../common/core/ConfigManager')
const LKContactProvider = require('../logic/provider/LKContactProvider')
const LKDeviceProvider = require('../logic/provider/LKDeviceProvider')

class ContactManager extends EventTarget {

    //just init when register
    asyResetContacts(newMemberMCode, members, friends, groupContacts, userId) {
        let curApp = Application.getCurrentApp();
        return LKContactHandler.asyResetContacts(members, friends, groupContacts, userId || curApp.getCurrentUser().id).then(function () {
            return LKMagicCodeHandler.asyUpdateMemberMagicCode(newMemberMCode, userId || curApp.getCurrentUser().id);
        }).then(() => {
            MagicCodeManager.setMemberMagicCode(newMemberMCode);
            this.fire("contactChanged");
        });
    }

    //rebuild the specified members when server add or modify org members
    asyRebuildMembers(newMemberMCode, ids, newMembers) {
        let curApp = Application.getCurrentApp();
        if (ids && ids.length > 0 && newMembers && newMembers.length > 0) {
            let userId = curApp.getCurrentUser().id;
            for (let i = 0; i < newMembers.length; i++) {
                let m = newMembers[i];
                if (m.id === userId) {
                    ConfigManager.getUserManager().setUserName(m.name);
                    ConfigManager.getUserManager().setUserPic(m.pic);
                    break;
                }
            }
            LKContactHandler.asyRebuidMembers(ids, newMembers, curApp.getCurrentUser().id).then(function () {
                return LKMagicCodeHandler.asyUpdateMemberMagicCode(newMemberMCode, curApp.getCurrentUser().id);
            }).then(() => {
                MagicCodeManager.setMemberMagicCode(newMemberMCode);
                this.fire("contactChanged");
            });
        }

    }

    //just update member code
    asyUpdateMemberMagicCode(newMemberMCode) {
        let curApp = Application.getCurrentApp();
        return LKMagicCodeHandler.asyUpdateMemberMagicCode(newMemberMCode, curApp.getCurrentUser().id).then(function () {
            MagicCodeManager.setMemberMagicCode(newMemberMCode);
        });
    }

    async asyAddNewFriend(friend) {
        let userId = Application.getCurrentApp().getCurrentUser().id;
        let curContact = await Contact.get(userId, friend.id);
        if (!curContact)
            await LKContactHandler.asyAddNewFriend(friend, userId);
        else if (curContact.relation == 2) {
            await Contact.updateGroupContact2Friend(friend.id, userId);
        }
        this.fire("contactChanged");
    }

    async removeAll() {
        let userId = Application.getCurrentApp().getCurrentUser().id;
        await Contact.removeAll(userId);
        await Device.removeAll(userId);
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
}


module.exports = new ContactManager();
