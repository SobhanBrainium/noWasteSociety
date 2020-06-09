import mongoose from 'mongoose'

const Schema = mongoose.Schema;

/**
 * @constant
 * @description Entity name : otp, Constant otp schema definition 
 */
const otpSchema = new Schema({
    userId : { type : Schema.Types.ObjectId, required : false},
    phone : {type : Number, required : true},
    otp : { type : Number, required : true, unique : true},
    usedFor : { type : String, required : true},
    status : { type : Number},
},{
    timestamps: true
})

export default otpSchema