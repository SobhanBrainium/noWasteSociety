import mongoose from "mongoose"
import bcrypt from "bcryptjs"

const Schema = mongoose.Schema

const userSchema = new Schema({
    firstName : { type : String, required : true},
    lastName : { type : String, required : true},
    gender : { type : String, default : ''},
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
});

userSchema.pre('save', function(next) {
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

export default userSchema