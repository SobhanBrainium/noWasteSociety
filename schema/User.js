import mongoose from "mongoose"

const Schema = mongoose.Schema

const userSchema = new Schema({
    firstName : { type : String, required : true},
    lastName : { type : String, required : true},
    email : {type : String, required : true},
    phone : { type : Number, default : null},
    password : {type : String, default : null},
    location: { type: String, default: '' },
    profileImage: { type: String, default: '' },
    isActive: { type: Boolean, default: false },
    appType: { type: String, enum: ['IOS', 'ANDROID', 'BROWSER']},
    deviceToken: { type: String, default: '' },
    loginType: { type: String, default: 'EMAIL'},
    socialId : {type: String, default: ''},
    pushMode : {type: String, default: ''},
},{
    timestamps: true
})

export default userSchema