import express from "express"
import mongoose from "mongoose"
import jwt from "jsonwebtoken"
import bcrypt from "bcryptjs"
import jwtTokenValidator from "../middlewares/jwt-validation-middlewares"
import deliveryBoyValidator from "../middlewares/validators/customer/deliveryBoy-validator"
import _ from "lodash"
import config from "../config"

import deliveryboySchema from "../schema/DeliveryBoy"
import userDeviceLoginSchema from "../schema/UserDeviceLogin"

const mail = require('../modules/sendEmail');

let app = express.Router()
app.use(express.json())
app.use(express.urlencoded({extended: false}))

//#region Login
app.post('/login', deliveryBoyValidator.deliveryBoyLogin, async (req, res) => {
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

            const isCustomerExist = await deliveryboySchema.findOne(loginCond)
            // console.log(isCustomerExist,'isCustomerExist')

            if(isCustomerExist != null){
                if (data.userType == 'admin') {
                    var userType = 'ADMIN'
                    data.appType = 'BROWSER';
                    data.pushMode = 'P';
                    data.deviceToken = '';
                } else {
                    var userType = 'DELIVERY BOY'
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
                                message: 'Login Successful.',
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

//for generate auth token
function generateToken(userData) {
    let payload = { subject: userData._id, user: 'CUSTOMER' };
    return jwt.sign(payload, config.secretKey, { expiresIn: '24h' })
}

module.exports = app;