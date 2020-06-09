import express from "express"
import mongoose from "mongoose"
import jwt from "jsonwebtoken"
import bcrypt from "bcryptjs"
import customerValidator from "../middlewares/validators/customer/customer-validator"
import userSchema from "../schema/User"
import otpSchema from "../schema/OTPLog"
import config from "../config"
import userDeviceLoginSchema from "../schema/UserDeviceLogin"

let User = mongoose.model('User', userSchema)
let OTPLog = mongoose.model('OTPLog', otpSchema)

const mail = require('../modules/sendEmail');

let customerAPI = express.Router()
customerAPI.use(express.json())
customerAPI.use(express.urlencoded({extended: false}))

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
                console.log(addCustomerWithSocial,'addCustomerWithSocial')
                if(addCustomerWithSocial){

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

module.exports = customerAPI;