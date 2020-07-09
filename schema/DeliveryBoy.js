var mongoose = require('mongoose');
var bcrypt = require('bcryptjs');

var deliveryboySchema = new mongoose.Schema({
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, unique: true },
    phone: { type: Number, unique: true  },
    password: { type: String, required: true },
    location: { type: String, default: '' },
    profileImage: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    appType: { type: String, enum: ['IOS', 'ANDROID', 'BROWSER']},
    deviceToken: { type: String, default: '' },
    loginType: { type: String, enum: ['EMAIL', 'FACEBOOK', 'GOOGLE']},
    numberPlate: { type: String, default: '',required: true, unique: true },
    driverLicense: { type: String, default: '',required: true, unique: true },
    vehicle: { type: String, default: '',required: true },
}, {
    timestamps: true
});

deliveryboySchema.pre('save', function(next) {
    let customer = this;
    if (!customer.isModified('password')) {
        return next();
    }

    bcrypt.hash(customer.password, 8, function(err, hash) {
        if (err) {
            return next(err);
        } else {
            if (customer.password !== '') {
                customer.password = hash
            }
            next();
        }
    })
});

module.exports = mongoose.model('DeliveryBoy', deliveryboySchema);