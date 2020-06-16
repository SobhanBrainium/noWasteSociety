import express from "express"
import mongoose from "mongoose"
import multer from "multer"
import axios from "axios"
import jwt from "jsonwebtoken"
import bcrypt from "bcryptjs"
import customerValidator from "../middlewares/validators/customer/customer-validator"
import restaurantValidator from "../middlewares/validators/customer/restaurant-validator"
import jwtTokenValidator from "../middlewares/jwt-validation-middlewares"
import userSchema from "../schema/User"
import otpSchema from "../schema/OTPLog"
import config from "../config"
import userDeviceLoginSchema from "../schema/UserDeviceLogin"
import vendorSchema from "../schema/Vendor"
import vendorFavouriteSchema from "../schema/VendorFavourite"
import categorySchema from "../schema/Category"
import bannerSchema from "../schema/Banner"
import _ from "lodash"

let User = mongoose.model('User', userSchema)
let OTPLog = mongoose.model('OTPLog', otpSchema)

const mail = require('../modules/sendEmail');

let customerAPI = express.Router()
customerAPI.use(express.json())
customerAPI.use(express.urlencoded({extended: false}))

//#region file upload using multer
let storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, 'public/img/profile-pic');
    },
    filename: function (req, file, cb) {
      let fileExt = file.mimetype.split('/')[1];
      if (fileExt == 'jpeg'){ fileExt = 'jpg';}
      let fileName = req.user.id + '-' + Date.now() + '.' + fileExt;
      cb(null, fileName);
    }
})

let restrictImgType = function(req, file, cb) {
    var allowedTypes = ['image/jpeg','image/gif','image/png', 'image/jpg'];
      if (allowedTypes.indexOf(req.file.mimetype) !== -1){
        // To accept the file pass `true`
        cb(null, true);
      } else {
        // To reject this file pass `false`
        cb(null, false);
       //cb(new Error('File type not allowed'));// How to pass an error?
      }
};

const upload = multer({ storage: storage, limits: {fileSize:5242880 , fileFilter:restrictImgType} }).single('image');
//#endregion

//#region registration
customerAPI.post('/registration', customerValidator.customerRegister, async (req, res) => {
    try {
        let data = req.body
        if(data.socialId != ''){
            //check customer existence
            const isExist = await User.findOne({socialId: data.socialId})
            if(isExist != null){
                res.send({
                    success: false,
                    STATUSCODE: 422,
                    message: 'User already exists for this information.',
                    response_data: {}
                })
            }else{
                //insert customer to DB with social id
                const addCustomerWithSocial = await User.create(data)
                if(addCustomerWithSocial != ''){
                    //ADD DATA IN USER LOGIN DEVICE TABLE
                    const userDeviceData = {
                        userId: addCustomerWithSocial._id,
                        userType: 'CUSTOMER',
                        appType: data.appType,
                        pushMode: data.pushMode,
                        deviceToken: data.deviceToken
                    }

                    const success = await new userDeviceLoginSchema(userDeviceData).save()
                    
                    if(success != ''){
                        let loginId = success._id;
                        let loginType = data.loginType;

                        const authToken = generateToken(success);

                        const finalResponse = {
                            userDetails: {
                                ...addCustomerWithSocial.toObject()
                            },
                            authToken: authToken
                        }

                        res.send({
                            success: true,
                            STATUSCODE: 200,
                            message: 'Registration Successfull',
                            response_data: finalResponse
                        })
                    }
                }
            }
        }else{
            //check customer existence with email or phone
            const isCustomerExistWithNormal = await User.findOne({loginType: 'EMAIL', $or : [
                {email : data.email}, {phone: data.phone}
            ]})

            if(isCustomerExistWithNormal != null){
                res.send({
                    success: false,
                    STATUSCODE: 422,
                    message: 'User already exists for this phone no or email.',
                    response_data: {}
                })
            }else{
                const addCustomerWithNormalRegistration = await new User(data).save()

                if(addCustomerWithNormalRegistration != ''){
                    //sent otp for complete registration process
                    let generateRegisterOTP = generateOTP()

                    if(generateRegisterOTP != ''){
                        //#region save OTP to DB
                        const addedOTPToTable = new OTPLog({
                            userId : addCustomerWithNormalRegistration._id,
                            phone : addCustomerWithNormalRegistration.phone,
                            otp : generateRegisterOTP,
                            usedFor : "Registration",
                            status : 1
                        })
                        const savetoDB = await addedOTPToTable.save()
                        //#endregion

                        if(savetoDB != ''){
                            const authToken = generateToken(addCustomerWithNormalRegistration);

                            let finalResponse =  {
                                userDetails : {
                                    ...addCustomerWithNormalRegistration.toObject(),
                                    otp : generateRegisterOTP
                                },
                                authToken : authToken
                            }

                            /** Send Registration Email */
                            mail('sendOTPdMail')(finalResponse.userDetails.email, finalResponse.userDetails).send();
    
                            res.send({
                                success: true,
                                STATUSCODE: 200,
                                message: 'We have successfully sent OTP to your email. Please verify it.',
                                response_data: finalResponse
                            })
                        }

                    }
                }
            }
        }
    } catch (error) {
        return{
            success: false,
            STATUSCODE: 500,
            message: 'Internal DB error',
            response_data: {}
        }
    }
})
//#endregion

//#region Login
customerAPI.post('/login', customerValidator.customerLogin, async (req, res) => {
    try {
        let data = req.body
        if(data){
            let loginUser = '';
            let loginCond;

            if (data.loginType != 'EMAIL') {
                loginUser = 'SOCIAL';
                loginCond = { socialId: data.user };
            } else {
                if (/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(data.user)) {
                    loginCond = { email: data.user, loginType: 'EMAIL', isActive : true };
                    loginUser = 'EMAIL';
                } else {
                    loginCond = { phone: data.user, loginType: 'EMAIL', isActive : true };
                    loginUser = 'PHONE';
                }
            }

            const isCustomerExist = await User.findOne(loginCond)

            if(isCustomerExist != null){
                if (data.userType == 'admin') {
                    var userType = 'ADMIN'
                    data.appType = 'BROWSER';
                    data.pushMode = 'P';
                    data.deviceToken = '';
                } else {
                    var userType = 'CUSTOMER'
                }

                //ADD DATA IN USER LOGIN DEVICE TABLE
                const userDeviceData = {
                    userId: isCustomerExist._id,
                    userType: userType,
                    appType: data.appType,
                    pushMode: data.pushMode,
                    deviceToken: data.deviceToken
                }

                const addDeviceLogin = await new userDeviceLoginSchema(userDeviceData).save()

                const loginId = addDeviceLogin._id;
                if (loginUser == 'SOCIAL') { //IF SOCIAL LOGIN THEN NO NEED TO CHECK THE PASSWORD 
                    const authToken = generateToken(isCustomerExist);
                    let response = {
                        userDetails: {
                            firstName: isCustomerExist.firstName,
                            lastName: isCustomerExist.lastName,
                            email: isCustomerExist.email,
                            phone: isCustomerExist.phone,
                            socialId: isCustomerExist.socialId,
                            id: isCustomerExist._id,
                            loginId: loginId,
                            profileImage: `${config.serverhost}:${config.port}/img/profile-pic/` + isCustomerExist.profileImage,
                            userType: data.userType,
                            loginType: data.loginType
                        },
                        authToken: authToken
                    }
                    console.log(response,'response')

                    res.send({
                        success: true,
                        STATUSCODE: 200,
                        message: 'Login Successful',
                        response_data: response
                    })
                }else{//NORMAL LOGIN
                    if ((data.password == '') || (data.password == undefined)) {
                        res.send({
                            success: false,
                            STATUSCODE: 422,
                            message: 'Password is required',
                            response_data: {}
                        });
                    } else {
                        const comparePass = bcrypt.compareSync(data.password, isCustomerExist.password);
                        if (comparePass == true) {
                            const authToken = generateToken(isCustomerExist);
                            let response = {
                                userDetails: {
                                    firstName: isCustomerExist.firstName,
                                    lastName: isCustomerExist.lastName,
                                    email: isCustomerExist.email,
                                    phone: isCustomerExist.phone.toString(),
                                    socialId: isCustomerExist.socialId,
                                    id: isCustomerExist._id,
                                    loginId: loginId,
                                    profileImage: `${config.serverhost}:${config.port}/img/profile-pic/` + isCustomerExist.profileImage,
                                    userType: data.userType,
                                    loginType: data.loginType
                                },
                                authToken: authToken
                            }

                            res.send({
                                success: true,
                                STATUSCODE: 200,
                                message: 'Login Successfull',
                                response_data: response
                            })

                        } else {
                            res.send({
                                success: false,
                                STATUSCODE: 422,
                                message: 'Invalid email or password',
                                response_data: {}
                            });
                        }
                    }
                }
            }else{
                res.send({
                    success: true,
                    STATUSCODE: 201,
                    message: 'No user found. New User.',
                    response_data: {}
                })
            }
        }
    } catch (error) {
        throw error
        res.send({
            success: false,
            STATUSCODE: 500,
            message: 'Internal DB error',
            response_data: {}
        })
    }
})
//#endregion

//#region View Profile
customerAPI.get('/viewProfile',jwtTokenValidator.validateToken, async(req, res) => {
    try {
        let response = {
            firstName: req.user.firstName,
            lastName: req.user.lastName,
            email: req.user.email,
            phone: req.user.phone
        }

        if (req.user.profileImage != '') {
            response.profileImage = `${config.serverhost}:${config.port}/img/profile-pic/` + req.user.profileImage
        } else {
            response.profileImage = ''
        }

        res.send({
            success: true,
            STATUSCODE: 200,
            message: 'User profile fetched successfully',
            response_data: response
        })
        
    } catch (error) {
        res.send({
            success: false,
            STATUSCODE: 500,
            message: 'Internal DB error',
            response_data: {}
        })
    }
})
//#endregion

//#region Edit Profile */
customerAPI.post('/editProfile',jwtTokenValidator.validateToken, customerValidator.editProfile, async(req, res) => {
    try {
        const userId = req.user._id

        const userDetail =  await User.findById(userId)
        
        if(req.body.firstName != ''){
            userDetail.firstName = req.body.firstName
        }

        if(req.body.lastName != ''){
            userDetail.lastName = req.body.lastName
        }

        // if(req.body.email != ''){
        //     userDetail.email = req.body.email
        // }

        // if(req.body.phone != ''){
        //     userDetail.phone = req.body.phone
        // }

        if(req.body.gender != ''){
            userDetail.gender = req.body.gender
        }

        const updateUserDetail = await userDetail.save()

        res.send({
            success: true,
            STATUSCODE: 200,
            message: 'Profile updated successfully.',
            response_data: updateUserDetail
        })

    } catch (error) {
        res.send({
            success: false,
            STATUSCODE: 500,
            message: 'Internal DB error',
            response_data: {}
        })
    }
})
//#endregion

//#region  Change password */
customerAPI.post('/changePassword',jwtTokenValidator.validateToken, customerValidator.changePassword, async (req, res) => {
    try {
        const data = req.body
        if(req.user._id == data.customerId){
            const comparePass = bcrypt.compareSync(data.oldPassword, req.user.password);
            if(comparePass == true){
            let userDetail = await User.findById(req.user._id)
            userDetail.password = data.newPassword

            const updateData = await userDetail.save()
            res.send({
                success: true,
                STATUSCODE: 200,
                message: 'Password updated successfully',
                response_data: {}
            })
            }else{
                res.send({
                    success: false,
                    STATUSCODE: 422,
                    message: 'Invalid old password',
                    response_data: {}
                });
            }
        }else{
            res.send({
                success: false,
                STATUSCODE: 422,
                message: 'User not found',
                response_data: {}
            });
        }
    } catch (error) {
        throw error
        res.send({
            success: false,
            STATUSCODE: 500,
            message: 'Internal DB error',
            response_data: {}
        });
    }
})
//#endregion

//#region  Profile image upload */
customerAPI.post('/profileImageUpload',jwtTokenValidator.validateToken, async(req, res) => {
    try {
        if(req.file != ''){
            upload(req, res, async function (err) {
                if (err) {
                    // A Multer error occurred when uploading.
                    res.send({
                        success: false,
                        STATUSCODE: 500,
                        message: 'File size too large. Upload size maximum 5MB',
                        response_data: {}
                    })
                }

                const userDetail = req.user
                const profilePicName = req.file.filename

                const updateProfilePic = await User.updateOne({_id : userDetail._id},{
                    $set : {
                        profileImage : profilePicName
                    }
                })

                if(updateProfilePic){
                    const getCurrentUser = await User.findById(req.user._id)
                    let profileImage;
                    if(getCurrentUser != ''){
                        if (getCurrentUser.profileImage != '') {
                            profileImage = `${config.serverhost}:${config.port}/img/profile-pic/` + getCurrentUser.profileImage
                        } else {
                            profileImage = ''
                        }
                    }
                    res.send({
                        success: true,
                        STATUSCODE: 200,
                        message: 'Profile pic uploaded successfully.',
                        response_data: {
                            profileImage : profileImage
                        }
                    })
                }else{
                    res.send({
                        success: false,
                        STATUSCODE: 500,
                        message: 'Something went wrong.',
                        response_data: {}
                    })
                }

            })
        }
    } catch (error) {
        res.send({
            success: false,
            STATUSCODE: 500,
            message: 'Internal DB error',
            response_data: {}
        })
    }
})
//#endregion

//#region  Forgot Password */
customerAPI.post('/forgotPassword', customerValidator.forgotPasswordEmail, async(req, res) => {
    try {
        const data = req.body
        if (data) {
            const checkCustomerIsExist = await User.findOne({email: data.email, loginType: 'EMAIL'})
            if(checkCustomerIsExist != null){
                let forgotPasswordOtp = generateOTP();
                let customer = checkCustomerIsExist.toObject();
                customer.forgotPasswordOtp = forgotPasswordOtp;

                //#region save OTP to DB
                const addedOTPToTable = new OTPLog({
                    userId : checkCustomerIsExist._id,
                    phone : checkCustomerIsExist.phone,
                    otp : forgotPasswordOtp,
                    usedFor : "ForgotPassword",
                    status : 1
                })
                const savetoDB = await addedOTPToTable.save()
                //#endregion

                try {
                    mail('forgotPasswordMail')(customer.email, customer).send();
                    res.send({
                        success: true,
                        STATUSCODE: 200,
                        message: 'Please check your email. We have sent a code to be used to reset password.',
                        response_data: {
                            id : customer._id,
                            email: customer.email,
                            phone : customer.phone,
                            forgotPassOtp: forgotPasswordOtp
                        }
                    });
                } catch (Error) {
                    res.send('Something went wrong while sending email');
                }
            }else{
                res.send({
                    success: false,
                    STATUSCODE: 422,
                    message: 'User not found',
                    response_data: {}
                });
            }
        }
    } catch (error) {
        res.send({
            success: false,
            STATUSCODE: 500,
            message: 'Internal DB error',
            response_data: {}
        });
    }
});
//#endregion

//#region  Reset Password */
customerAPI.post('/resetPassword', customerValidator.resetPassword, async(req, res) => {
    try {
        const data = req.body
        if (data) {
            const customerIsExist = await User.findOne({ email: data.email, loginType: 'EMAIL' })
            if(customerIsExist != null){
                //#region verifyOTP
                const [isSuccess] = await Promise.all([
                    axios({
                        method : "POST",
                        url : config.serverhost + ':' + config.port + '/api/customer/otpVerification',
                        data : {
                            otp : data.otp,
                            cid : customerIsExist._id,
                            phone : customerIsExist.phone
                        }
                    })
                ])
                //#endregion

                if(isSuccess.data.success == true){
                    customerIsExist.password = data.password
                    await customerIsExist.save()
    
                    res.send({
                        success: true,
                        STATUSCODE: 200,
                        message: 'Password updated successfully',
                        response_data: {}
                    });
                }else{
                    res.send({
                        success: false,
                        STATUSCODE: 500,
                        message: 'OTP does not match.',
                        response_data: {}
                    });
                }
            }else{
                res.send({
                    success: false,
                    STATUSCODE: 422,
                    message: 'User not found',
                    response_data: {}
                });
            }
        }
    } catch (error) {
        throw error
        res.send({
            success: false,
            STATUSCODE: 500,
            message: 'Internal DB error',
            response_data: {}
        });
    }
});
//#endregion

//#region  Change Email */
customerAPI.post('/changeEmail', customerValidator.forgotPasswordEmail, async(req, res) => {
    try {
        const data = req.body
        if (data) {
            const checkCustomerIsExist = await User.findOne({email: data.email, loginType: 'EMAIL'})
            if(checkCustomerIsExist != null){
                let forgotPasswordOtp = generateOTP();
                let customer = checkCustomerIsExist.toObject();
                customer.forgotPasswordOtp = forgotPasswordOtp;

                //#region save OTP to DB
                const addedOTPToTable = new OTPLog({
                    userId : checkCustomerIsExist._id,
                    phone : checkCustomerIsExist.phone,
                    otp : forgotPasswordOtp,
                    usedFor : "ChangeEmail",
                    status : 1
                })
                const savetoDB = await addedOTPToTable.save()
                //#endregion

                try {
                    mail('forgotPasswordMail')(customer.email, customer).send();
                    res.send({
                        success: true,
                        STATUSCODE: 200,
                        message: 'Please check your email. We have sent a code to be used to reset email.',
                        response_data: {
                            id : customer._id,
                            email: customer.email,
                            phone : customer.phone,
                            otp: forgotPasswordOtp
                        }
                    });
                } catch (Error) {
                    res.send('Something went wrong while sending email');
                }
            }else{
                res.send({
                    success: false,
                    STATUSCODE: 422,
                    message: 'User not found',
                    response_data: {}
                });
            }
        }
    } catch (error) {
        res.send({
            success: false,
            STATUSCODE: 500,
            message: 'Internal DB error',
            response_data: {}
        });
    }
});
//#endregion

//#region Reset new email 
customerAPI.post('/resetEmail', jwtTokenValidator.validateToken, customerValidator.changeEmail ,async (req, res) => {
    try {
        const data = req.body
        if(data){
            const userDetail = req.user

            //#region validate OTP
            const [isSuccess] = await Promise.all([
                axios({
                    method : "POST",
                    url : config.serverhost + ':' + config.port + '/api/customer/otpVerification',
                    data : {
                        otp : data.otp,
                        cid : userDetail._id,
                        phone : userDetail.phone
                    }
                })
            ])
            //#endregion
            if(isSuccess.data.success == true){
                const newUpdatedEmail = data.email
                //update user email
                const updateData = await User.updateOne({_id : userDetail._id},{
                    $set : {
                        email : newUpdatedEmail
                    }
                })
                
                if(updateData){
                    res.send({
                        success: true,
                        STATUSCODE: 200,
                        message: 'Email updated successfully.',
                        response_data: {}
                    });
                }
            }else{
                res.send({
                    success: false,
                    STATUSCODE: 500,
                    message: 'OTP does not match.',
                    response_data: {}
                });
            }
        }
    } catch (error) {
        res.send({
            success: false,
            STATUSCODE: 500,
            message: 'Internal DB error',
            response_data: {}
        })
    }
})
//#endregion

//#region  Home/Dashboard */
customerAPI.post('/dashboard',jwtTokenValidator.validateToken,restaurantValidator.customerHomeValidator, async(req, res) => {
    try {
        const data = req.body
        if (data) {
            var latt = data.latitude;
            var long = data.longitude;
            var userType = data.userType;
            var responseDt = [];
            var response_data = {};

            // console.log(data);

            const isVendorExist = await vendorSchema.find({
                location: {
                    $near: {
                        $maxDistance: config.restaurantSearchDistance,
                        $geometry: {
                            type: "Point",
                            coordinates: [long, latt]
                        }
                    }
                },
                isActive: true
            })

            if(isVendorExist.length > 0){
                var vendorIds = [];
                for (let restaurant of isVendorExist) {
                    var responseObj = {};
                    responseObj = {
                        id: restaurant._id,
                        name: restaurant.restaurantName,
                        description: restaurant.description,
                        logo: `${config.serverhost}:${config.port}/img/vendor/${restaurant.logo}`,
                        rating: restaurant.rating
                    };
                    // console.log(restaurant.location.coordinates);

                    //Calculate Distance
                    var sourceLat = restaurant.location.coordinates[1];
                    var sourceLong = restaurant.location.coordinates[0];

                    var destLat = latt;
                    var destLong = long;
                    responseObj.distance = await getDistanceinMtr(sourceLat, sourceLong, destLat, destLong);
                    // console.log(responseObj);

                    var customerId = data.customerId;
                    var vendorId = restaurant._id;
                    responseObj.favorite = await vendorFavouriteSchema.countDocuments({ vendorId: vendorId, customerId: customerId });

                    responseDt.push(responseObj);
                    vendorIds.push(restaurant._id);
                }

                //Restaurant
                response_data.vendor = responseDt;
                //Category Data
                response_data.category_data = await categorySchema.find({}, { "categoryName": 1, "image": 1 })
                response_data.category_imageUrl = `${config.serverhost}:${config.port}/img/category/`;

                //Banner Data
                // console.log(vendorIds);
                response_data.banner_data = await bannerSchema.find({
                    vendorId: { $in: vendorIds }
                }, { "bannerType": 1, "image": 1 })
                response_data.banner_imageUrl = `${config.serverhost}:${config.port}/img/vendor/`;

                res.send({
                    success: true,
                    STATUSCODE: 200,
                    message: `${isVendorExist.length} nearby restaurants found.`,
                    response_data: response_data
                })
            }else{
                res.send({
                    success: true,
                    STATUSCODE: 200,
                    message: 'No nearby restaurants found.',
                    response_data: {}
                })
            }
        } 
    } catch (error) {
        throw error
        res.send({
            success: false,
            STATUSCODE: 500,
            message: 'Internal DB error',
            response_data: {}
        });
    }
})
//#endregion

//#region  Resend OTP */
customerAPI.post('/resendOtp', customerValidator.resendForgotPassOtp, async (req, res) => {
    try {
        const data = req.body
        if (data) {
            const isValid = await User.findOne({phone : data.phone})
            if(isValid != null){
                //deactivate old or unused OTP
                const checkOldAndUnUsedOTP = await OTPLog.find({phone : data.phone, status : 1})
                if(checkOldAndUnUsedOTP.length >0){
                    //make status = 2 for expired, deactivate or used
                    _.forEach(checkOldAndUnUsedOTP, async (value, key) => {
                        value.status = 2;
                        await value.save()
                    })
                }
                //end
    
                //generate new OTP
                const newOTP = generateOTP()
                const addOTPToDb = new OTPLog({
                    userId : isValid._id,
                    phone : isValid.phone,
                    otp : newOTP,
                    usedFor : data.usedFor,
                    status : 1
                })
    
                await addOTPToDb.save()
    
                //sent mail with new OTP
                mail('resendOtpMail')(isValid.email, isValid).send();
    
                res.send({
                    success: false,
                    STATUSCODE: 200,
                    message: 'Please check your email. We have sent a code.',
                    response_data: {
                        phone: isValid.phone,
                        otp: newOTP
                    }
                })
            }else{
                res.send({
                    success: false,
                    STATUSCODE: 500,
                    message: 'Phone number is not registered with us.',
                    response_data: {}
                })
            }
        }
    } catch (error) {
        throw error
        res.send({
            success: false,
            STATUSCODE: 500,
            message: 'Internal server error.',
            response_data: {}
        })
    }
})
//#endregion

//#region OTP verification
customerAPI.post('/otpVerification', customerValidator.OTPVerification, async (req,res) => {
    try {
        let data = req.body
        if(data != null){
            const isChecked = await OTPLog.findOne({userId : data.cid, otp : data.otp, phone : data.phone, status : 1})
            if(isChecked != null){
                //deactivate the OTP with status  2
                isChecked.status = 2;
                await isChecked.save();

                if(isChecked.usedFor == 'Registration'){
                    const userDetail = await User.findOne({_id : isChecked.userId})
                    //activate the user
                    userDetail.isActive = true
                    const activateData = await userDetail.save()
                    //end

                    mail('userRegistrationMail')(activateData.email, activateData).send();
                }
                res.send({
                    success: true,
                    STATUSCODE: 200,
                    message: 'OTP verification successfully.',
                    response_data: {}
                })
            }else{
                res.send({
                    success: false,
                    STATUSCODE: 300,
                    message: 'OTP does not matched.',
                    response_data: {}
                })
            }
        }
        
    } catch (error) {
        res.send({
            success: false,
            STATUSCODE: 500,
            message: 'Internal DB error',
            response_data: {}
        })
    }
})
//#endregion

//for generate OTP
function generateOTP(){
    const OTP = Math.random().toString().replace('0.', '').substr(0, 4);
    return OTP
}

//for generate auth token
function generateToken(userData) {
    let payload = { subject: userData._id, user: 'CUSTOMER' };
    return jwt.sign(payload, config.secretKey, { expiresIn: '24h' })
}

//getDistance(start, end, accuracy = 1)
function getDistanceinMtr(sourceLat, sourceLong, destinationLat, destinationLong) {
    return new Promise(function (resolve, reject) {
        const geolib = require('geolib');

        var distanceCal = geolib.getDistance(
            { latitude: sourceLat, longitude: sourceLong },
            { latitude: destinationLat, longitude: destinationLong },
            1
        );

        //  console.log(distanceCal);
        var distanceStr = '';
        if (Number(distanceCal) > 1000) {
            distanceStr += Math.round((Number(distanceCal) / 1000));
            distanceStr += ' km away'
        } else {
            distanceStr = distanceCal
            distanceStr += ' mtr away'
        }


        return resolve(distanceStr);

    });
}

module.exports = customerAPI;