const DBProxy = require('../../common/store/DBProxy')
const Application = require('../LKApplication')
Application.getCurrentApp().on("dbReady", function () {

})



module.exports = DBProxy;
