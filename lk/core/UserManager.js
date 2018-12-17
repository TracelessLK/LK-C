const Application = require( '../LKApplication')
const EventTarget = require( '../../common/core/EventTarget')
const LKUserHandler = require( '../logic/handler/LKUserHandler')
const LKLoginHandler = require( '../logic/handler/LKLoginHandler')
const LKUserProvider = require( '../logic/provider/LKUserProvider')

class UserManager extends EventTarget{

    asyGetAll(){
      return LKUserProvider.asyGetAll();
    }
    asyAddLKUser(user){
       return LKUserHandler.asyAddLKUser(user);
    }
    asyRemoveLKUser(uid){
        return LKUserHandler.asyRemoveLKUser(uid);
    }
    async setUserName(name){
        await Application.getCurrentApp().getLKWSChannel().setUserName(name);
        let user = Application.getCurrentApp().getCurrentUser();
        await LKUserHandler.asySetUserName(name,user.id);
        user.name = name;
      this.fire("nameChanged");
    }
    async setUserPic(pic){
        await Application.getCurrentApp().getLKWSChannel().setUserPic(pic);
        let user = Application.getCurrentApp().getCurrentUser();
        await LKUserHandler.asySetUserPic(pic,user.id);
        user.pic = pic;
      this.fire("picChanged");
    }
    async asyLogin(userId,password,pwdHash){
      return LKLoginHandler.asyLogin(userId,password,pwdHash)
    }
}


module.exports = new UserManager();
