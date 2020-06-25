import mongoose from "mongoose"

const Schema = mongoose.Schema

const cardSchema = new Schema({
    userId : { type : Schema.Types.ObjectId, required : true, ref : 'User'},
    nameOnCard : {type : String, required : true},
    cardNumber : {type : Number, required : true, unique : true},
    expiryDate : {type : String, required : true},
    zipCode : {type : String, required : true},
},{
    timestamps: true
})

export default cardSchema