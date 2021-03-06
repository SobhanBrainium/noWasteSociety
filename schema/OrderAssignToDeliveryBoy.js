import mongoose from "mongoose"

import userAddressSchema from "../schema/Address"

const Schema = mongoose.Schema

const UserAddress = mongoose.model('UserAddress', userAddressSchema)

const orderAssignToDeliverBoySchema = new Schema({
    orderId : {type : Schema.Types.ObjectId, required : true, ref : 'Order'},
    vendorId : {type : Schema.Types.ObjectId, required : true, ref : 'Vendor'},
    deliveryBoyId : {type : Schema.Types.ObjectId, required : true, ref : 'DeliveryBoy'},
    customerId : {type : Schema.Types.ObjectId, required : true, ref : 'User'},
    deliveryAddressId : {type : Schema.Types.ObjectId, required : true, ref : UserAddress},
    deliveryStatus : {type : Number, default : 1} // 1 = On the way or pending, 2 = pick up fro restaurant, 3 = delivered to customer
}, {
    timestamps: true
})

export default orderAssignToDeliverBoySchema