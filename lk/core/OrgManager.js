const Application = require( '../LKApplication')
const EventTarget = require( '../../common/core/EventTarget')
const LKOrgHandler = require( '../logic/handler/LKOrgHandler')
const LKOrgProvider = require( '../logic/provider/LKOrgProvider')
const LKMagicCodeHandler = require( '../logic/handler/LKMagicCodeHandler')
const MagicCodeManager = require( './MagicCodeManager')
const Org = require( '../store/Org')

class OrgManager extends EventTarget{

    //update when diff between c&s checked
    asyResetOrgs(newOrgMCode,orgs,userId){
        return LKOrgHandler.asyResetOrgs(orgs,userId).then( () =>{
            return LKMagicCodeHandler.asyUpdateOrgMagicCode(newOrgMCode,userId);
        }).then( ()=>{
            MagicCodeManager.setOrgMagicCode(newOrgMCode);
            this.fire("orgChanged");
        });
    }
    async removeAll(){
        let userId = Application.getCurrentApp().getCurrentUser().id;
        await Org.removeAll(userId);
    }

  /**
   *
   * @param parentId
   * @param userId
   * @returns {*}
   */
  asyGetChildren (parentId, userId) {
      return LKOrgProvider.asyGetChildren(parentId, userId)
  }
}


module.exports = new OrgManager();
