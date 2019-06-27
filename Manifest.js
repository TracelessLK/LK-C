const Application = require('./lk/LKApplication')
const WSChannel = require('./lk/net/LKWSChannel')
const ChatManager = require('./lk/core/ChatManager')
const ContactManager = require('./lk/core/ContactManager')
const OrgManager = require('./lk/core/OrgManager')
const UserManager = require('./lk/core/UserManager')
const MagicCodeManager = require('./lk/core/MagicCodeManager')
const MFApplyManager = require('./lk/core/MFApplyManager')
const DBProxy = require('./common/store/DBProxy')

class Manifest {
    static get Application() {
        return Application
    }
    static get WSChannel() {
        return WSChannel
    }
    static get ChatManager() {
        return ChatManager
    }
    static get ContactManager() {
        return ContactManager
    }
    static get OrgManager() {
        return OrgManager
    }
    static get UserManager() {
        return UserManager
    }
    static get MagicCodeManager() {
        return MagicCodeManager
    }
    static get MFApplyManager() {
        return MFApplyManager
    }
    static get DBProxy() {
        return DBProxy
    }
}

module.exports = Manifest
