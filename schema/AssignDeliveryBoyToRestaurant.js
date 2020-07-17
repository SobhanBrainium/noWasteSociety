import mongoose from "mongoose"

const Schema = mongoose.Schema

const assignDeliveryBoySchema = new Schema({
    restaurantId : {type : Schema.Types.ObjectId, required : true, ref : 'Vendor'},
    deliveryBoyId : { type : Schema.Types.ObjectId, required : true, ref : 'DeliveryBoy'},
}, {
    timestamps: true
})

export default assignDeliveryBoySchema