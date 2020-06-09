import express from "express"
import mongoose from "mongoose"
import jwt from "jsonwebtoken"
import bcrypt from "bcryptjs"
import customerValidator from "../middlewares/validators/customer/customer-validator"
import userSchema from "../schema/User"
import otpSchema from "../schema/OTPLog"
import config from "../config"

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
                const addCustomerWithNormalRegistration = await User.create(data)
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

//for generate OTP
function generateOTP(){
    const OTP = Math.random().toString().replace('0.', '').substr(0, 4);
    return OTP
}

//for generate auth token
function generateToken(userData) {
    console.log(userData,'userData')
    let payload = { subject: userData._id, user: 'CUSTOMER' };
    console.log(payload,'payload')
    return jwt.sign(payload, config.secretKey, { expiresIn: '24h' })
}

module.exports = customerAPI;