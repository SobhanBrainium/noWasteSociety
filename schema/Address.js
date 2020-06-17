import mongoose from "mongoose"
import { schema } from "./UserDeviceLogin"

const Schema = mongoose.Schema

const userAddressSchema = new Schema({
    userId : {type : Schema.Types.ObjectId, required : true},
    isDefault : { type : Boolean},
    addressType : {type : String, required : true},
    flatOrHouseOrBuildingOrCompany : {type : String, required : true},
    areaOrColonyOrStreetOrSector : { type : String, required : true},
    landmark : {type : String, default : ''},
    pinCode : { type : String, required : true},
    townOrCity : { type : String, required : true}
},{
    timestamps: true
})

export default userAddressSchema