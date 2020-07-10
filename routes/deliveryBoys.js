import express from "express"
import mongoose from "mongoose"
import jwt from "jsonwebtoken"
import bcrypt from "bcryptjs"
import deliveryBoyJwtTokenValidator from "../middlewares/deliveryBoy-token-validator"
import deliveryBoyValidator from "../middlewares/validators/customer/deliveryBoy-validator"
import _ from "lodash"
import config from "../config"

import deliveryboySchema from "../schema/DeliveryBoy"
import userDeviceLoginSchema from "../schema/UserDeviceLogin"
import orderAssignToDeliverBoySchema from "../schema/OrderAssignToDeliveryBoy"
import userAddressSchema from "../schema/Address"
import orderSchema from "../schema/Order"
import vendorSchema from "../schema/Vendor"
import userSchema from "../schema/User"

const mail = require('../modules/sendEmail')

const OrderAssignToDeliveryBoy = mongoose.model('OrderAssignToDeliveryBoy', orderAssignToDeliverBoySchema)
const User = mongoose.model('User', userSchema)
const UserAddress = mongoose.model('UserAddress', userAddressSchema)

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
        res.send({
            success: false,
            STATUSCODE: 500,
            message: 'Internal DB error',
            response_data: {}
        })
    }
})
//#endregion

//#region oder details
app.get('/orderListings', deliveryBoyJwtTokenValidator.validateToken, async (req, res) => {
    try {
        const data = req.query
        if(data){
            const userData = req.user
            const destLat = req.query.latitude;
            const destLong = req.query.longitude;

            const fetchAssignOrders = await OrderAssignToDeliveryBoy.find({})
            .populate('orderId', {orderTime : 1, orderType : 1, deliveryPreference : 1, price : 1, discount : 1, finalPrice : 1, orderNo : 1, estimatedDeliveryTime : 1, _id : 0})
            .populate('vendorId', {restaurantName : 1, location : 1, managerName : 1, contactPhone : 1, _id : 0})
            .populate('customerId', {phone : 1, firstName : 1, lastName : 1, email : 1, profileImage : 1, _id : 0})
            .populate('deliveryAddressId')

            if(fetchAssignOrders.length > 0){
                let finalOrderList = []

                for(let i = 0; i < fetchAssignOrders.length; i++ ){
                    const vendorDetail = fetchAssignOrders[i].vendorId
                    const sourceLong = vendorDetail.location.coordinates[0];
                    const sourceLat = vendorDetail.location.coordinates[1];

                    const restaurantDistanceFromDeliveryBoy = await getDistanceinMtr(sourceLat, sourceLong, destLat, destLong)

                    const assignResponse = {
                        ...fetchAssignOrders[i].toObject(),
                        restaurantDistanceFromDeliveryBoy
                    }

                    finalOrderList.push(assignResponse)
                }

                res.send({
                    success: true,
                    STATUSCODE: 200,
                    message: `${finalOrderList.length} Order found successfully.`,
                    response_data: finalOrderList
                })

            }else{
                res.send({
                    success: true,
                    STATUSCODE: 200,
                    message: 'No order found.',
                    response_data: []
                })
            }
        }
        
    } catch (error) {
        console.log(error,'error')
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

module.exports = app;