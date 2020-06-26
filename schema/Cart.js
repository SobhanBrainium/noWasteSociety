import mongoose from "mongoose"
import { number } from "@hapi/joi"
const Float = require('mongoose-float').loadType(mongoose, 2)

const Schema = mongoose.Schema

const cartSchema = new Schema({
    userId : { type : Schema.Types.ObjectId, required : true, ref : 'User'},
    vendorId : {type : Schema.Types.ObjectId, required : true, ref : 'Vendor'},
    item : [{
        itemId : {type : Schema.Types.ObjectId, required : true, ref : 'Item'},
        itemAddedDate : {type : Date, default : Date.now()},
        itemAmount : {type : Float, required : true},
        itemQuantity : {type : Number, required : true},
        itemTotal : { type : Float, required : true},
    }],
    cartTotal : {type : Float , required : true, default : 0},
    isCheckout : {type : Number, required : true, default : 1}, // 1 = new item add, 2 = payment done.
    status : {type : String, default : "Y"}
},{
    timestamps: true
})

export default cartSchema