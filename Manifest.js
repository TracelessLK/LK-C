const Application = require('./lk/LKApplication')
const WSChannel = require('./lk/net/LKWSChannel')
const ChatManager = require('./lk/core/ChatManager')
const ContactManager = require('./lk/core/ContactManager')
const OrgManager = require('./lk/core/OrgManager')
const UserManager = require('./lk/core/UserManager')
const MagicCodeManager = require('./lk/core/MagicCodeManager')
const MFApplyManager = require('./lk/core/MFApplyManager')
const DBProxy = require('./common/store/DBProxy')

const Manifest = {
  Application,
  WSChannel,
  ChatManager,
  ContactManager,
  OrgManager,
  UserManager,
  MagicCodeManager,
  MFApplyManager,
  DBProxy
}
Object.freeze(Manifest)
module.exports = Manifest
