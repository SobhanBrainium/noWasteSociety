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
import orderSchema from "../schema/Order"
import OrderDetailSchema from "../schema/OrderDetail"
import vendorFavouriteSchema from "../schema/VendorFavourite"
import vendorOpenCloseTime from "../schema/VendorOpenCloseTime"
import itemSchema from "../schema/Item"
import categorySchema from "../schema/Category"
import bannerSchema from "../schema/Banner"
import userAddressSchema from "../schema/Address"
import cardSchema from "../schema/Card"
import cartSchema from "../schema/Cart"
import _ from "lodash"

let User = mongoose.model('User', userSchema)
let OTPLog = mongoose.model('OTPLog', otpSchema)
let UserAddress = mongoose.model('UserAddress', userAddressSchema)
let Card = mongoose.model('Card', cardSchema)
let Cart = mongoose.model('Cart', cartSchema)

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

const upload = multer({ storage: storage, limits: {fileSize: 10485760 , fileFilter:restrictImgType} }).single('image');
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

                        const authToken = generateToken(addCustomerWithSocial);

                        const finalResponse = {
                            userDetails: {
                                ...addCustomerWithSocial.toObject(),
                                loginId : loginId
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

                //ADD DATA IN USER LOGIN DEVICE TABLE
                const userDeviceData = {
                    userId: addCustomerWithNormalRegistration._id,
                    userType: 'CUSTOMER',
                    appType: data.appType,
                    pushMode: data.pushMode,
                    deviceToken: data.deviceToken
                }

                const success = await new userDeviceLoginSchema(userDeviceData).save()
                let loginId = success._id;

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
                                    loginId,
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
                    // console.log(response,'response')

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

//#region  Customer add Address
customerAPI.post('/addAddress', jwtTokenValidator.validateToken, customerValidator.addAddress, async (req, res) => {    
    try {
        let data = req.body
        if(data){

            data = {
                ...data,
                userId : req.user._id
            }
            console.log(data,'data')

            if(data.isDefault == 1){
                //#region first find is any address default or not
                const isDefaultAddress = await UserAddress.findOne({userId : req.user._id, isDefault : data.isDefault}).sort({_id : -1})
                if(isDefaultAddress){
                    isDefaultAddress.isDefault = false
                    await isDefaultAddress.save();
                }
                //#region 
            }
            
            const addAddress = await UserAddress.create(data)

            if(addAddress){
                //find all address
                const getAddress = await UserAddress.find({userId : req.user._id}).sort({_id : -1})
                if(getAddress.length >0){
                    res.send({
                        success: true,
                        STATUSCODE: 200,
                        message: 'Address added successfully.',
                        response_data: getAddress
                    })
                }else{
                    res.send({
                        success: true,
                        STATUSCODE: 200,
                        message: 'No address found.',
                        response_data: []
                    })
                }
                
            }else{
                res.send({
                    success: false,
                    STATUSCODE: 400,
                    message: 'Address added failed.',
                    response_data: []
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

//#region Customer Address List
customerAPI.get('/addressList', jwtTokenValidator.validateToken, async (req, res) => {    
    try {
        const userAddressList = await UserAddress.find({userId : req.user._id}).sort({_id : -1})
        if(userAddressList.length > 0){
            res.send({
                success: true,
                STATUSCODE: 200,
                message: 'Address list fetch successfully.',
                response_data: userAddressList
            })
        }
        res.send({
            success: true,
            STATUSCODE: 200,
            message: 'No address found.',
            response_data: []
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

//#region Customer delete Address
customerAPI.post('/deleteCustomerAddress', jwtTokenValidator.validateToken, customerValidator.deleteCustomerAddress, async (req, res) => {    
    try {
        let addressId = req.body.addressId
        const isExist = await UserAddress.findOne({userId : req.user._id , _id : addressId})
        if(isExist){
            const deleteAddress = await UserAddress.deleteOne({userId : req.user._id , _id : addressId})
            if(deleteAddress){
                //find address after delete one
                const getAddress = await UserAddress.find({userId : req.user._id})
                if(getAddress.length > 0){
                    res.send({
                        success: true,
                        STATUSCODE: 200,
                        message: 'Address deleted successfully.',
                        response_data: getAddress
                    })
                }else{
                    res.send({
                        success: true,
                        STATUSCODE: 200,
                        message: 'Address deleted successfully.',
                        response_data: []
                    })
                }
            }else{
                res.send({
                    success: false,
                    STATUSCODE: 400,
                    message: 'Something went wrong.',
                    response_data: []
                })
            }
        }else{
            res.send({
                success: true,
                STATUSCODE: 200,
                message: 'No address found.',
                response_data: []
            })
        }
    } catch (error) {
        throw error
        res.send({
            success: false,
            STATUSCODE: 500,
            message: 'Internal DB error',
            response_data: []
        })
    }
})
//#endregion

//#region  Customer edit Address
customerAPI.post('/editAddress', jwtTokenValidator.validateToken, customerValidator.editAddress, async (req, res) => {    
    try {
        let data = req.body
        if(data){
            //check address is exist or not
            const isExist = await UserAddress.findOne({userId : req.user._id, _id : data.addressId})
            if(isExist){
                const obj = {}

                if(data.addressType) {
                    obj.addressType = data.addressType
                }

                if(data.flatOrHouseOrBuildingOrCompany) {
                    obj.flatOrHouseOrBuildingOrCompany = data.flatOrHouseOrBuildingOrCompany
                }

                if(data.areaOrColonyOrStreetOrSector) {
                    obj.areaOrColonyOrStreetOrSector = data.areaOrColonyOrStreetOrSector
                }

                if(data.pinCode) {
                    obj.pinCode = data.pinCode
                }

                if(data.townOrCity) {
                    obj.townOrCity = data.townOrCity
                }

                if(data.landmark) {
                    obj.landmark = data.landmark
                }

                if(data.isDefault){
                    if(data.isDefault !== isExist.isDefault){
                        //#region first find is any address default or not
                        const isDefaultAddress = await UserAddress.findOne({userId : req.user._id, isDefault : data.isDefault}).sort({_id : -1})
                        if(isDefaultAddress){
                            isDefaultAddress.isDefault = false
                            await isDefaultAddress.save();
                        }
                        //#region 

                        obj.isDefault = data.isDefault
                    }
                }

                //= update address
                const updateAddress = await UserAddress.updateOne({userId : req.user._id, _id : data.addressId},{
                    $set : obj
                })

                if(updateAddress){
                    //find all address
                    const getAddress = await UserAddress.find({userId : req.user._id}).sort({_id : -1})
                    if(getAddress.length >0){
                        res.send({
                            success: true,
                            STATUSCODE: 200,
                            message: 'Address updated successfully.',
                            response_data: getAddress
                        })
                    }else{
                        res.send({
                            success: true,
                            STATUSCODE: 200,
                            message: 'No address found.',
                            response_data: []
                        })
                    }
                    
                }else{
                    res.send({
                        success: false,
                        STATUSCODE: 400,
                        message: 'Address updated failed.',
                        response_data: []
                    })
                }
            }
            res.send({
                success: false,
                STATUSCODE: 400,
                message: 'No address found with this id.',
                response_data: {}
            })
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

//#region restaurant details
customerAPI.post('/restaurantDetail', jwtTokenValidator.validateToken,restaurantValidator.restaurantDetailsValidator, async(req, res) => {
    try {
        const data = req.body
        if (data) {

            const vendorId = data.vendorId;
            const categoryId = data.categoryId;
            const responseDt = {};
            const latt = data.latitude;
            const long = data.longitude;
            const restaurantInformation = data.restaurantInfo;

            if (restaurantInformation == 'YES') {

                vendorSchema.findOne({
                    location: {
                        $near: {
                            $maxDistance: config.restaurantSearchDistance,
                            $geometry: {
                                type: "Point",
                                coordinates: [long, latt]
                            }
                        }
                    },
                    _id: vendorId,
                    isActive: true
                })
                    .populate('vendorOpenCloseTime')
                    .exec(async function (err, results) {
                        if (err) {
                            // console.log(err);
                            res.send({
                                success: false,
                                STATUSCODE: 500,
                                message: 'Internal error',
                                response_data: {}
                            });
                        } else {
                            if (results != null) {
                                var restaurantInfo = {
                                    name: results.restaurantName,
                                    description: results.description,
                                    rating: results.rating,
                                    logo: `${config.serverhost}:${config.port}/img/vendor/${results.logo}`,
                                    banner: `${config.serverhost}:${config.port}/img/vendor/${results.banner}`
                                };

                                //Calculate Distance
                                var sourceLat = results.location.coordinates[1];
                                var sourceLong = results.location.coordinates[0];

                                var destLat = latt;
                                var destLong = long;
                                restaurantInfo.distance = await getDistanceinMtr(sourceLat, sourceLong, destLat, destLong);

                                //Open time
                                var vendorTimeArr = [];
                                var openTimeArr = [];
                                var closeTimeArr = [];
                                if (results.vendorOpenCloseTime.length > 0) {
                                    if (results.vendorOpenCloseTime.length == 7) {
                                        var everydayCheck = 1;
                                    } else {
                                        var everydayCheck = 0;
                                    }


                                    for (let vendorTime of results.vendorOpenCloseTime) {
                                        var vendorTimeObj = {};
                                      //  console.log(vendorTime);
                                        if (everydayCheck == 1) {

                                            openTimeArr.push(vendorTime.openTime);
                                            closeTimeArr.push(vendorTime.closeTime);
                                        }
                                        //OPEN TIME CALCULATION
                                        var openTimeAMPM = '';
                                        var openTimeHours = '';
                                        var openTimeMin = '';
                                        if (vendorTime.openTime < 720) {
                                            var num = vendorTime.openTime;
                                            openTimeAMPM = 'am';
                                        } else {
                                            var num = (vendorTime.openTime - 720);
                                            openTimeAMPM = 'pm';
                                        }

                                        var openHours = (num / 60);
                                        var openrhours = Math.floor(openHours);
                                        var openminutes = (openHours - openrhours) * 60;
                                        var openrminutes = Math.round(openminutes);

                                        openTimeHours = openrhours;
                                        openTimeMin = openrminutes;

                                        //CLOSE TIME CALCULATION
                                        var closeTimeAMPM = '';
                                        var closeTimeHours = '';
                                        var closeTimeMin = '';
                                        if (vendorTime.closeTime < 720) {
                                            var num = vendorTime.closeTime;
                                            closeTimeAMPM = 'am';
                                        } else {
                                            var num = (vendorTime.closeTime - 720);
                                            closeTimeAMPM = 'pm';
                                        }

                                        var closeHours = (num / 60);
                                        var closerhours = Math.floor(closeHours);
                                        var closeminutes = (closeHours - closerhours) * 60;
                                        var closerminutes = Math.round(closeminutes);

                                        closeTimeHours = closerhours;
                                        closeTimeMin = closerminutes;

                                        vendorTimeObj.day = vendorTime.day;
                                        vendorTimeObj.openTime = `${openTimeHours}:${openTimeMin} ${openTimeAMPM}`
                                        vendorTimeObj.closeTime = `${closeTimeHours}:${closeTimeMin} ${closeTimeAMPM}`

                                        vendorTimeArr.push(vendorTimeObj);
                                    }
                                }

                                responseDt.restaurant = restaurantInfo;

                                //Everyday Check
                                if (everydayCheck == 1) {
                                    // console.log(openTimeArr);
                                    // console.log(closeTimeArr);
                                    var uniqueOpen = openTimeArr.filter(onlyUnique);
                                    var uniqueClose = closeTimeArr.filter(onlyUnique);
                                    if ((uniqueOpen.length == 1) && (uniqueClose.length == 1)) {
                                        responseDt.vendorTimeEveryday = 1;
                                        responseDt.vendorTimeEverydayStart = uniqueOpen[0];
                                        responseDt.vendorTimeEverydayClose = uniqueClose[0];
                                    }
                                } else {
                                    responseDt.vendorTimeEveryday = 0;
                                }

                                responseDt.vendorTime = vendorTimeArr;


                                //Get Item Details
                                var restaurantItemDetails = await restaurantCategoryItem(vendorId);

                                if (restaurantItemDetails != 'err') {
                                    responseDt.catitem = restaurantItemDetails;

                                    res.send({
                                        success: true,
                                        STATUSCODE: 200,
                                        message: 'Restaurant details.',
                                        response_data: responseDt
                                    });

                                    //  console.log(responseDt);
                                } else {
                                    res.send({
                                        success: false,
                                        STATUSCODE: 500,
                                        message: 'Internal DB error.',
                                        response_data: {}
                                    });
                                }

                            } else {
                                res.send({
                                    success: false,
                                    STATUSCODE: 400,
                                    message: 'Something went wrong.',
                                    response_data: {}
                                });
                            }
                        }
                        //console.log(results);
                    });

            } else {

                //Get Item Details
                restaurantCategoryItem(vendorId, categoryId)
                    .then(function (restaurantItemDetails) {

                        if (restaurantItemDetails != 'err') {
                            responseDt.catitem = restaurantItemDetails;

                            res.send({
                                success: true,
                                STATUSCODE: 200,
                                message: 'Restaurant details.',
                                response_data: responseDt
                            });

                            //  console.log(responseDt);
                        } else {
                            res.send({
                                success: false,
                                STATUSCODE: 500,
                                message: 'Internal DB error.',
                                response_data: {}
                            });
                        }
                    }).catch(function (err) {
                        console.log(err);
                        res.send({
                            success: false,
                            STATUSCODE: 500,
                            message: 'Internal DB error.',
                            response_data: {}
                        });
                    });
            }


        }
    } catch (error) {
        res.send({
            success: false,
            STATUSCODE: 500,
            message: 'Internal DB error.',
            response_data: {}
        });
    }
})
//#endregion

//#region Add to cart
customerAPI.post('/addToCart', jwtTokenValidator.validateToken, async (req, res) => {
    try {
        const data = req.body
        if(data){
            const itemObj = {}
            //#region required field validation
            if(!data.vendorId){
                return res.json({
                    success: false,
                    STATUSCODE : 422,
                    message : "vendorId is required.",
                    response_data: {}
                })
            }

            if(!data.itemId){
                return res.json({
                    success: false,
                    STATUSCODE : 422,
                    message : "itemId is required",
                    response_data: {}
                })
            }
            itemObj.itemId = data.itemId

            if(!data.itemAmount){
                return res.json({
                    success: false,
                    STATUSCODE : 422,
                    message : "itemAmount is required",
                    response_data: {}
                })
            }
            itemObj.itemAmount = parseFloat(data.itemAmount)

            if(!data.itemQuantity){
                return res.json({
                    success: false,
                    STATUSCODE : 422,
                    message : "itemQuantity is required",
                    response_data: {}
                })
            }else{
                itemObj.itemQuantity = parseInt(data.itemQuantity)
                itemObj.itemTotal = parseFloat(itemObj.itemQuantity * itemObj.itemAmount)
            }
            //#endregion

            //#region check userId is already exist in cart or not. If exist then update item object otherwise insert new item.
            const isUserExist = await Cart.findOne({userId : req.user._id, isCheckout : 1, status : 'Y'})
            if(isUserExist){
                //#region check same restaurant or not. If same then update item object otherwise new item object inserted with new restaurant.
                const previousVendorId = isUserExist.vendorId
                if(previousVendorId == data.vendorId){
                    // update item object
                    isUserExist.item.unshift(itemObj)
                    isUserExist.cartTotal = parseFloat(isUserExist.cartTotal + itemObj.itemTotal)

                    const result = await isUserExist.save()

                    return res.json({
                        success: true,
                        STATUSCODE : 200,
                        message : "Item has been successfully added to cart.",
                        response_data : result
                    })
                }else{
                    return res.json({
                        success: false,
                        STATUSCODE : 422,
                        message : "Multiple restaurant item can not be added in cart. Either you have to purchase it or clear the previous cart. .",
                        response_data : {}
                    })
                }
                //#endregion

            }else{
                //#region  new item add 
                const itemAddedObj = new Cart({
                    userId : req.user._id,
                    vendorId : data.vendorId,
                    item : itemObj,
                    cartTotal : parseFloat(itemObj.itemTotal)
                })
                const result = await itemAddedObj.save()

                return res.json({
                    success: true,
                    STATUSCODE : 200,
                    message : "Item has been successfully added to cart.",
                    response_data : result
                })
                //#endregion
            }
            //#endregion
        }
    } catch (error) {
        res.json({
            success: false,
            STATUSCODE: 500,
            message: 'Internal DB error.',
            response_data: {}
        });
    }
})
//#endregion

//#region remove Previous Whole Cart
customerAPI.post('/removePreviousWholeCart', jwtTokenValidator.validateToken, async (req, res) => {
    try {
        const data = req.body
        if(data){
            if(data.allowMultipleRestaurant === true || data.allowMultipleRestaurant === 'true'){
                //#region delete previous cart
                const isUserExist = await Cart.findOne({userId : req.user._id, isCheckout : 1, status : 'Y'})
                if(isUserExist){
                    const deleteCart = await Cart.deleteOne({userId : req.user._id, isCheckout : 1, status : 'Y'})
                    if(deleteCart){
                        return res.json({
                            success: true,
                            STATUSCODE : 200,
                            message : "Your previous cart is cleared.",
                            response_data: {}
                        })
                    }
                }
                //#endregion

                return res.json({
                    success: true,
                    STATUSCODE : 200,
                    message : "No previous cart found.",
                    response_data: {}
                })
            }

            return res.json({
                success: true,
                STATUSCODE : 200,
                message : "Record not deleted.",
                response_data: {}
            })
        }
    } catch (error) {
        res.json({
            success: false,
            STATUSCODE: 500,
            message: 'Internal DB error.',
            response_data: {}
        });
    }
})
//#endregion

//#region fetch user cart section
customerAPI.get('/fetchCart', jwtTokenValidator.validateToken, async (req, res) => {
    try {
        const fetchCartList = await Cart.findOne({userId : req.user._id, status : 'Y'})
        .populate('vendorId', {_id : 0, restaurantName : 1,  })
        .populate('item.itemId', {_id : 0, menuImage : 1, itemName : 1  })

        if(fetchCartList){
            _.forEach(fetchCartList.item, (itemValue) => {
                itemValue.itemId.menuImage =  `${config.serverhost}:${config.port}/img/item/` + itemValue.itemId.menuImage
            })

            return res.json({
                success: true,
                STATUSCODE : 200,
                message : "Fetch cart item successfully.",
                response_data : fetchCartList
            })
        }
        return res.json({
            success: true,
            STATUSCODE : 200,
            message : "No cart item found.",
            response_data : {}
        })
    } catch (error) {
        res.json({
            success: false,
            STATUSCODE: 500,
            message: 'Internal DB error.',
            response_data: {}
        });
    }
})
//#endregion

//#region update Cart
customerAPI.post('/updateCartItem', jwtTokenValidator.validateToken, customerValidator.updateCartItemValidator, async (req, res) => {
    try {
        const data = req.body
        if(data){
            // find cart detail of logged in user
            const isCartExist = await Cart.findById(data.cartId)
            if(isCartExist){
                // find cart item
                const isCartItemExist = _.filter(isCartExist.item, product => product._id == data.itemId)

                if(isCartItemExist.length > 0){
                    const itemQuantity = data.itemQuantity
                    const previousCartTotal = isCartExist.cartTotal
                    const previousItemTotal = isCartItemExist[0].itemTotal

                    if(itemQuantity > 0){
                        //update item
                        isCartItemExist[0].itemQuantity = parseInt(itemQuantity)
                        isCartItemExist[0].itemTotal = parseFloat( isCartItemExist[0].itemAmount * itemQuantity)

                        //update cart total increase or decrease number of quantity
                        let  cartValueAfterDeductivePreviousItemValue = Number(parseFloat(previousCartTotal) - parseFloat(previousItemTotal))
                        const finalCartValue = Number(parseFloat(cartValueAfterDeductivePreviousItemValue) + isCartItemExist[0].itemTotal)

                        isCartExist.cartTotal = finalCartValue
                        const updatedData = await isCartExist.save()

                        const fetchCartList = await Cart.findOne({userId : req.user._id, _id : data.cartId, status : 'Y'})
                        .populate('vendorId', {_id : 0, restaurantName : 1,  })
                        .populate('item.itemId', {_id : 0, menuImage : 1, itemName : 1  })

                        _.forEach(fetchCartList.item, (itemValue) => {
                            itemValue.itemId.menuImage =  `${config.serverhost}:${config.port}/img/item/` + itemValue.itemId.menuImage
                        })


                        return res.json({
                            success: true,
                            STATUSCODE: 200,
                            message: 'Cart updated successfully.',
                            response_data: fetchCartList
                        })
                    }
                    return res.json({
                        success: true,
                        STATUSCODE: 422,
                        message: 'Product quantity must be greater then 0.',
                        response_data: {}
                    })
                }

                return res.json({
                    success: true,
                    STATUSCODE: 200,
                    message: 'Wrong item selected or product not found.',
                    response_data: {}
                })
            }
            return res.json({
                success: true,
                STATUSCODE: 200,
                message: 'No cart item found.',
                response_data: {}
            })
        }
    } catch (error) {
        res.json({
            success: false,
            STATUSCODE: 500,
            message: 'Internal DB error.',
            response_data: {}
        });
    }
})
//#endregion

//#region product remove from cart
customerAPI.post('/removeCartItem', jwtTokenValidator.validateToken, customerValidator.removeCartItemValidator, async (req, res) => {
    try {
        const data = req.body
        if(data){
            const isExist = await Cart.findOne({_id : data.cartId, userId : req.user._id, isCheckout : 1})
            if(isExist){
                const itemDetail = _.filter(isExist.item, product => product._id == data.itemId)

                // remove item
                const removedData = await Cart.update({_id : data.cartId},{
                    $pull : {
                        item :{
                            _id : itemDetail[0]._id
                        }
                    }
                })

                //update Cart total
                isExist.cartTotal = parseFloat(isExist.cartTotal - itemDetail[0].itemTotal)
                await isExist.save() 

                let updatedCart = await Cart.findOne({userId : req.user._id, _id : data.cartId})
                .populate('vendorId', {_id : 0, restaurantName : 1,  })
                .populate('item.itemId', {_id : 0, menuImage : 1, itemName : 1  })
        
                _.forEach(updatedCart.item, (itemValue) => {
        
                    itemValue.itemId.menuImage =  `${config.serverhost}:${config.port}/img/item/` + itemValue.itemId.menuImage
                })

                // delete full cart object from DB if cart item is running below from one.
                if(updatedCart){
                    if(updatedCart.item.length == 0){
                        const deleteCart = await Cart.deleteOne({_id : data.cartId})
                        if(deleteCart){
                            updatedCart = {}
                        }
                    }

                }

                return res.json({
                    success: true,
                    STATUSCODE : 200,
                    message : "Item has been successfully removed from cart.",
                    response_data: updatedCart
                })
            }

            return res.json({
                success: true,
                STATUSCODE : 200,
                message : "Record not found.",
                response_data: {}
            })
        }
    } catch (error) {
        res.json({
            success: false,
            STATUSCODE: 500,
            message: 'Internal DB error.',
            response_data: {}
        });
    }
})
//#endregion

//#region  Order Submit */
customerAPI.post('/postOrder',jwtTokenValidator.validateToken,restaurantValidator.postOrderValidator, async (req, res) => {
    try {
        const data = req.body
        if (data) {
   
            var vendorId = data.vendorId;
            var items = data.items;
            var latt = data.latitude;
            var long = data.longitude;
            var appType = data.appType;

            var checkJson = false

            if(appType == 'ANDROID') {
                var checkJson = isJson(items);
            } else {
                checkJson = true;
            }
            

            // console.log(checkJson);
            // console.log(appType);
            // console.log(items);

            var checkJson = true;

            if (checkJson == true) {

                //  var itemObj = JSON.parse(items);

                if(appType == 'ANDROID') {
                    var itemObj = JSON.parse(items);
                } else {
                    var itemObj = items;
                }

                
                // console.log(itemObj);
                var errorCheck = 0;
                var orderDetailsItm = [];
                var itemsIdArr = [];
                console.log(itemObj,'itemObj')
                for (let item of itemObj) {
                    console.log("jello")
                    var orderDetailsItmObj = {};
                    if ((item.name == undefined) || (item.name == '') || (item.quantity == undefined) || (item.quantity == '') || (item.price == undefined) || (item.price == '') || (item.itemId == undefined) || (item.itemId == '')) {
                        errorCheck++;
                    } else {
                        //Items Check
                        itemsIdArr.push(item.itemId);

                        orderDetailsItmObj.item = item.name;
                        orderDetailsItmObj.quantity = item.quantity;
                        orderDetailsItmObj.itemPrice = item.price;
                        orderDetailsItmObj.totalPrice = (Number(item.price) * Number(item.quantity));
                        orderDetailsItm.push(orderDetailsItmObj);
                    }
                    // console.log(item.name);
                    // console.log(item.quantity);
                    // console.log(item.price);
                }

                if (errorCheck == 0) {

                    vendorSchema.findOne({
                        _id: vendorId,
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
                        .exec(async function (err, results) {
                            if (err) {
                                res.send({
                                    success: false,
                                    STATUSCODE: 500,
                                    message: 'Internal DB error',
                                    response_data: {}
                                });
                            } else {
                                if (results != null) {

                                    
                                    //console.log(data);
                                    // console.log(itemsIdArr);
                                    var itemsCheck = await itemSchema.find({ _id: { $in: itemsIdArr } })
                                    var waitingTimeAll = 0;

                                    if (itemsCheck.length > 0) {
                                        for (let item of itemsCheck) {
                                            waitingTimeAll += Number(item.waitingTime);
                                        }
                                    }
                                    var orderVendorId = data.vendorId;

                                    var orderNo = generateOrder();

                                    var ordersObj = {
                                        vendorId: data.vendorId,
                                        orderNo: orderNo,
                                        orderTime: new Date(),
                                        estimatedDeliveryTime: waitingTimeAll,

                                        addressId : data.addressId,

                                        customerId: data.customerId,
                                        orderType: data.orderType,
                                        deliveryPreference: data.deliveryPreference,
                                        orderStatus: 'NEW',
                                        price: data.price,
                                        discount: data.discount,
                                        finalPrice: data.finalPrice,
                                        specialInstruction: data.specialInstruction,
                                        promocodeId: data.promocodeId
                                    }

                                    // console.log(ordersObj);



                                    //  console.log(orderDetailsItm);

                                    new orderSchema(ordersObj).save(async function (err, result) {
                                        if (err) {
                                            console.log(err);
                                            res.send({
                                                success: false,
                                                STATUSCODE: 500,
                                                message: 'Internal DB error',
                                                response_data: {}
                                            });
                                        } else {
                                            var orderId = result._id;
                                            var orderDetailsArr = [];
                                            var orderIdsArr = [];
                                            var orderDetailsCount = orderDetailsItm.length;
                                            var c = 0;
                                            for (let orderdetails of orderDetailsItm) {
                                                c++;
                                                var orderEnter = orderdetails;
                                                orderEnter.orderId = orderId;

                                                // console.log(orderEnter);

                                                orderDetailsArr.push(orderEnter);

                                                new OrderDetailSchema(orderEnter).save(async function (err, result) {
                                                    orderIdsArr.push(result._id);



                                                    orderSchema.update({ _id: orderId }, {
                                                        $set: { orderDetails: orderIdsArr }
                                                    }, function (err, res) {
                                                        if (err) {
                                                            console.log(err);
                                                        } else {
                                                            // console.log(res);
                                                        }
                                                    });
                                                })
                                            }
                                            //SEND PUSH MESSAGE
                                            // var pushMessage = 'You have received a new order'
                                            // var receiverId = orderVendorId;
                                            // sendPush(receiverId, pushMessage,orderNo);

                                            //find new order detail
                                            const newOrder = await orderSchema.findById(orderId).populate('addressId')
                                            //end

                                            var respOrder = {};
                                            respOrder.order = newOrder;
                                            respOrder.orderDetails = orderDetailsArr;
                                            res.send({
                                                success: true,
                                                STATUSCODE: 200,
                                                message: 'Order Submited Successfully.',
                                                response_data: respOrder
                                            });

                                        }
                                    });

                                } else {
                                    res.send({
                                        success: false,
                                        STATUSCODE: 500,
                                        message: 'Something went wrong.',
                                        response_data: {}
                                    });
                                }
                            }

                        });



                } else {
                    console.log('Invalid items object format');
                    res.send({
                        success: false,
                        STATUSCODE: 500,
                        message: 'Validation failed.',
                        response_data: {}
                    });
                }

            } else {
                console.log('Invalid items object format');
                res.send({
                    success: false,
                    STATUSCODE: 500,
                    message: 'Validation failed.',
                    response_data: {}
                });
            }
            return;
   
   
        }
    } catch (error) {
        
        res.send({
            success: false,
            STATUSCODE: 500,
            message: 'Internal DB error',
            response_data: {}
        });
    }
})
//#endregion

//#region  Order List */
customerAPI.post('/orderList',jwtTokenValidator.validateToken,restaurantValidator.customerOrderListValidator, async(req, res) => {
    try {
        const data = req.body
        if (data) {
            console.log(data);
            var customerId = data.customerId;
            var orderStatus = data.orderStatus;
            var responseOrder = {};

            var findCond = { customerId: customerId };
            if(orderStatus == 'ONGOING') {
               var orCond = [ {'orderStatus':'NEW'}, {'orderStatus':'ACCEPTED'}, {'orderStatus':'DELAYED'}, {'orderStatus':'DELIVERED'}, {'orderStatus':'MODIFIED'}, {'orderStatus':'READY'}]
            } else {
                var orCond = [ {'orderStatus':'COMPLETED'}, {'orderStatus':'CANCELLED'}]
            }

            orderSchema
                .find(findCond)
                .or(orCond)
                .sort({ orderTime: 'desc' })
                .populate('orderDetails')
                .then(async function (orders) {
                    var allorders = [];
                    if(orders.length > 0) {
                        for(let order of orders) {
                            var orderlst = {};
                            orderlst.orderId = order._id;
                            orderlst.finalPrice = order.finalPrice;
                            orderlst.estimatedDeliveryTime = order.estimatedDeliveryTime;
                            orderlst.orderStatus = order.orderStatus;
                            orderlst.orderTime = order.orderTime;

                            //Vendor Info
                            var vendorInfo = await vendorSchema.findOne({_id: order.vendorId});
                            orderlst.restaurantName = vendorInfo.restaurantName;
                            orderlst.description = vendorInfo.description;
                            orderlst.restaurantImage = `${config.serverhost}:${config.port}/img/vendor/${vendorInfo.logo}`;

                            allorders.push(orderlst);
                        }
                    }
                    responseOrder.orderList = allorders;
                    res.send({
                        success: true,
                        STATUSCODE: 200,
                        message: 'order list.',
                        response_data: responseOrder
                    })
                    
                })
                .catch(function(err) {
                    console.log(err);
                    res.send({
                        success: false,
                        STATUSCODE: 500,
                        message: 'Something went wrong.',
                        response_data: {}
                    })
                })
        }
    } catch (error) {
        res.send({
            success: false,
            STATUSCODE: 500,
            message: 'Internal server error.',
            response_data: {}
        })
    }
})
//#endregion

//#region  Order Details */
customerAPI.post('/orderDetails',jwtTokenValidator.validateToken,restaurantValidator.customerOrderDetailsValidator, async(req, res) => {
    try {
        const data = req.body
        if (data) {
            var orderId = data.orderId;
            var responseOrder = {}; 

            orderSchema
                .findOne({_id: orderId})
                .populate('addressId')
                .populate('orderDetails')
                .then(async function (order) {
                    // console.log(order);

                    var orderResp = {};

                    orderResp.orderNo = order.orderNo;
                    orderResp.orderTime = order.orderTime;
                    orderResp.finalPrice = order.finalPrice;

                    //Vendor Info
                    var vendorInfo = await vendorSchema.findOne({_id: order.vendorId});
                    orderResp.restaurantName = vendorInfo.restaurantName;
                    orderResp.restaurantImage = `${config.serverhost}:${config.port}/img/vendor/${vendorInfo.banner}`;
                    orderResp.address = order.addressId;
                    orderResp.orderDetails = order.orderDetails;


                    res.send({
                        success: true,
                        STATUSCODE: 200,
                        message: 'Order Details.',
                        response_data: orderResp
                    })
                })
                .catch(function(err) {
                    console.log(err);
                    res.send({
                        success: false,
                        STATUSCODE: 500,
                        message: 'Something went wrong.',
                        response_data: {}
                    })
                });
        }
    } catch (error) {
        res.send({
            success: false,
            STATUSCODE: 500,
            message: 'Internal server error.',
            response_data: {}
        })
    }
});
//#endregion

//#region Logout */
customerAPI.post('/logout',jwtTokenValidator.validateToken, customerValidator.logout, async(req, res) => {
    try {
        const data = req.body
        if (data) {
            const loginId = data.loginId;
            const deleteDeviceLogin = await userDeviceLoginSchema.deleteOne({ _id: loginId })
            if(deleteDeviceLogin){
                res.send({
                    success: true,
                    STATUSCODE: 200,
                    message: 'User logged out Successfully',
                    response_data: {}
                })
            }else{
                res.send({
                    success: false,
                    STATUSCODE: 400,
                    message: 'Something went wrong.',
                    response_data: {}
                })
            }
        }
    } catch (error) {
        res.send({
            success: false,
            STATUSCODE: 500,
            message: 'Internal DB error.',
            response_data: {}
        });
    }
})
//#endregion

//#region add card for payment
customerAPI.post('/addPaymentDetails', jwtTokenValidator.validateToken, customerValidator.addPaymentDetails, async (req, res) => {
    try {
        const data = req.body
        if(data){
            const nameOnCard = data.nameOnCard
            const cardNumber = data.cardNumber
            const expiryDate = data.expiryDate
            const zipCode = data.zipCode
            const rememberCard = data.rememberCard

            const isExist = await Card.findOne({cardNumber : cardNumber})
            if(isExist){
                return res.send({
                    success: false,
                    STATUSCODE : 400,
                    message : "Already exist",
                    response_data: {}
                })
            }

            //save card
            const addCard = new Card({
                userId : req.user._id,
                nameOnCard : nameOnCard,
                cardNumber : cardNumber,
                expiryDate : expiryDate,
                zipCode : zipCode
            })
            const addRes = await addCard.save()

            return res.send({
                success: true,
                STATUSCODE: 200,
                message: 'Card added successfully.',
                response_data: addRes
            })
        }
    } catch (error) {
        res.send({
            success: false,
            STATUSCODE: 500,
            message: 'Internal DB error.',
            response_data: {}
        });
    }
})
//#endregion

//#region list of card
customerAPI.get('/cardList', jwtTokenValidator.validateToken, async(req, res) => {
    try {
        const allCardListOfUser = await Card.find({userId : req.user._id,}).sort({_id : -1})
        if(allCardListOfUser.length > 0){
            return res.send({
                success: true,
                STATUSCODE: 200,
                message: 'Card list fetch successfully.',
                response_data: allCardListOfUser
            })
        }else{
            return res.send({
                success: true,
                STATUSCODE: 200,
                message: 'No card found.',
                response_data: []
            })
        }
    } catch (error) {
        res.send({
            success: false,
            STATUSCODE: 500,
            message: 'Internal DB error.',
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

function restaurantCategoryItem(vendorId) {
    return new Promise(function (resolve, reject) {
        var resp = {};

        var itemSerachParam = {
            vendorId: vendorId,
            isActive: true
        }

        // if (categoryId != '') {
        //     itemSerachParam.categoryId = categoryId;
        //     var catId = 1;
        // } else {
        //     var catId = 0;
        // }
        itemSchema.find(itemSerachParam)
            .sort({ createdAt: -1 })
            .exec(async function (err, results) {
                if (err) {
                    console.log(err);
                    return resolve('err');
                } else {
                    if (results.length > 0) {
                        var itemsArr = [];
                        for (let itemsVal of results) {
                            var itemsObj = {};
                            itemsObj.itemId = itemsVal._id
                            itemsObj.itemName = itemsVal.itemName
                            itemsObj.type = itemsVal.type
                            itemsObj.price = itemsVal.price
                            itemsObj.description = itemsVal.description
                            itemsObj.menuImage = `${config.serverhost}:${config.port}/img/item/${itemsVal.menuImage}`;

                            itemsArr.push(itemsObj);
                        }
                    }
                    resp.item = itemsArr;
                    return resolve(resp);
                }
            })
    });
}

function onlyUnique(value, index, self) {
    return self.indexOf(value) === index;
}

function isJson(str) {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

function generateOrder() {

    var orderNo = `NWS${Math.floor((Math.random() * 100000))}`
    return orderNo;
}

module.exports = customerAPI;