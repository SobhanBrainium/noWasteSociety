var mongoose = require('mongoose');

var vendorSchema = new mongoose.Schema({
    restaurantName: { type: String, required: true },
    description: { type: String},
    managerName: { type: mongoose.Schema.Types.ObjectId, required: true, ref : 'Admin' },
    restaurantType: { type: String, enum: ['VEG', 'NON VEG', 'BOTH'] },
    contactEmail: { type: String, email: true, unique: true },
    countryCode: { type: String, default : '' },
    contactPhone: { type: Number, unique: true },
    logo: { type: String, default : '' },
    banner: { type: String, default : '' },
    rating: { type: Number, default: 0 },
    licenceImage: { type: String, default: ''},
    address: { type: String, default: ''},
    location: {
        type: {
            type: String,
            enum: ['Point']
        },
        coordinates: {
            type: [Number]
        }
    },
    isActive: { type: Boolean, default: true },
    vendorOpenCloseTime: [{ type: mongoose.Schema.Types.ObjectId, ref: 'vendorOpenCloseTime' }]
}, {
    timestamps: true
});

vendorSchema.index({ location: "2dsphere" });

module.exports = mongoose.model('Vendor', vendorSchema);