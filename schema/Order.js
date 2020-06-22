var mongoose = require('mongoose');

import userAddressSchema from "../schema/Address"
let UserAddress = mongoose.model('UserAddress', userAddressSchema)

var orderSchema = new mongoose.Schema({
    vendorId: { type: mongoose.Schema.Types.ObjectId, required: true},
    orderNo: {type: String, required: true, unique: true},
    orderTime: {type: Date, required: true, default: new Date()},
    orderDetails: [{ type: mongoose.Schema.Types.ObjectId, ref: 'OrderDetail' }],
    estimatedDeliveryTime: {type: String },
    foodReadyTime: {type: Date},
    actualDeliveryTime: {type: Date},
    
    addressId : {type : mongoose.Schema.Types.ObjectId, required: true, ref : UserAddress},

    customerId: { type: mongoose.Schema.Types.ObjectId, required: true,default: '5e68af6f7a611343eae69b9a' },
    orderType: { type: String, required: true, enum: ['NORMAL','SCHEDULE'],default: 'NORMAL' },
    deliveryPreference : { type: String, required: true, enum: ['DELIVERY','PICKUP'],default: 'DELIVERY' },
    orderStatus: { type: String, required: true, enum: ['NEW','ACCEPTED', 'DELAYED', 'DELIVERED', 'COMPLETED','MODIFIED','CANCELLED','READY'],default: 'NEW'  },
    delayedTime: {type: Number},
    price: {type: Number, required: true,default: 60 },
    discount: {type: Number,default: 15},
    finalPrice: {type: Number, required: true,default: 45},
    specialInstruction: {type: String,default: ''},
    promocodeId: { type: String}
}, {
    timestamps: true
});

module.exports = mongoose.model('Order', orderSchema);