const Device = require('../../store/Device')

class LKDeviceHandler {
  asyAddDevices(userId, contactId, devices) {
    return Device.addDevices(userId, contactId, devices)
  }

  asyRemoveDevices(contactId, devices) {
    return Device.removeDevices(contactId, devices)
  }
}

module.exports = new LKDeviceHandler()
