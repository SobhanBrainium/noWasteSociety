import express from "express"
import mongoose from "mongoose"
import jwt from "jsonwebtoken"
import bcrypt from "bcryptjs"
import deliveryBoyJwtTokenValidator from "../middlewares/deliveryBoy-token-validator"
import deliveryBoyValidator from "../middlewares/validators/customer/deliveryBoy-validator"
import _ from "lodash"
import config from "../config"
import multer from "multer"

import deliveryboySchema from "../schema/DeliveryBoy"
import userDeviceLoginSchema from "../schema/UserDeviceLogin"
import orderAssignToDeliverBoySchema from "../schema/OrderAssignToDeliveryBoy"
import userAddressSchema from "../schema/Address"
import orderSchema from "../schema/Order"
import vendorSchema from "../schema/Vendor"
import userSchema from "../schema/User"
import cartSchema from "../schema/Cart"
import itemSchema from "../schema/Item"

const mail = require('../modules/sendEmail')

const OrderAssignToDeliveryBoy = mongoose.model('OrderAssignToDeliveryBoy', orderAssignToDeliverBoySchema)
const User = mongoose.model('User', userSchema)
const UserAddress = mongoose.model('UserAddress', userAddressSchema)
let Cart = mongoose.model('Cart', cartSchema)

let app = express.Router()
app.use(express.json())
app.use(express.urlencoded({extended: false}))

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
            console.log(isCustomerExist,'isCustomerExist')

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
        console.log(error,'err')
        res.send({
            success: false,
            STATUSCODE: 500,
            message: 'Internal DB error',
            response_data: {}
        })
    }
})
//#endregion

//#region order list
app.get('/orderListings', deliveryBoyJwtTokenValidator.validateToken, async (req, res) => {
    try {
        const data = req.query
        if(data){
            const userData = req.user
            const destLat = req.query.latitude;
            const destLong = req.query.longitude;

            const fetchAssignOrders = await OrderAssignToDeliveryBoy.find({deliveryBoyId : req.user._id})
            .populate('vendorId', {restaurantName : 1, location : 1, managerName : 1, contactPhone : 1, _id : 0})
            .populate('customerId', {phone : 1, firstName : 1, lastName : 1, email : 1, profileImage : 1, _id : 0})
            .populate({
                path : "orderId",
                select : {
                    cartDetail : 1, orderTime : 1, orderType : 1, deliveryPreference : 1, price : 1, discount : 1, finalPrice : 1, orderNo : 1, estimatedDeliveryTime : 1, _id : 0
                },
                populate : {
                    path : "cartDetail",
                    select : {
                        _id : 0, item : 1
                    },
                    populate : {
                        path : "item.itemId",
                        select : {
                            itemName : 1, menuImage : 1, _id : 0
                        }
                    }
                }
            })
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
        res.send({
            success: false,
            STATUSCODE: 500,
            message: 'Internal DB error',
            response_data: {}
        })
    }
})
//#endregion

//#region order details
app.get('/orderDetail', deliveryBoyJwtTokenValidator.validateToken, async (req, res) => {
    try {
        if(!req.query.orderListId){
            res.status(422).json({
                success: false,
                STATUSCODE: 422,
                message: 'orderListId is required'
            })
        }else{

            const orderListId = req.query.orderListId
            const getDetail = await OrderAssignToDeliveryBoy.findById(orderListId)
            .populate('vendorId', {restaurantName : 1, location : 1, managerName : 1, contactPhone : 1, _id : 0})
            .populate('customerId', {phone : 1, firstName : 1, lastName : 1, email : 1, profileImage : 1, _id : 0})
            .populate({
                path : "orderId",
                select : {
                    cartDetail : 1, orderTime : 1, orderType : 1, deliveryPreference : 1, price : 1, discount : 1, finalPrice : 1, orderNo : 1, estimatedDeliveryTime : 1, _id : 0
                },
                populate : {
                    path : "cartDetail",
                    select : {
                        _id : 0, item : 1
                    },
                    populate : {
                        path : "item.itemId",
                        select : {
                            itemName : 1, menuImage : 1, _id : 0
                        }
                    }
                }
            })
            .populate('deliveryAddressId')
    
            if(getDetail){
                for(let i = 0; i < getDetail.orderId.cartDetail.item.length; i++){
                    getDetail.orderId.cartDetail.item[i].itemId.menuImage = `${config.serverhost}:${config.port}/img/profile-pic/` + getDetail.orderId.cartDetail.item[i].itemId.menuImage
                }
    
                res.send({
                    success: true,
                    STATUSCODE: 200,
                    message: 'Detail fetch successfully.',
                    response_data: getDetail
                })
            }else{
                res.send({
                    success: false,
                    STATUSCODE: 200,
                    message: 'No order assign to you.',
                    response_data: {}
                })
            }
        }
        
    } catch (error) {
        console.log(error,'err')
        res.send({
            success: false,
            STATUSCODE: 500,
            message: 'Internal DB error',
            response_data: {}
        })
    }
})
//#endregion

//#region completed order list
app.get('/completedOrderList', deliveryBoyJwtTokenValidator.validateToken, async (req, res) => {
    try {
        const data = req.query
        if(data){
            const userData = req.user
            const destLat = req.query.latitude;
            const destLong = req.query.longitude;

            const fetchAssignOrders = await OrderAssignToDeliveryBoy.find({deliveryStatus : 3, deliveryBoyId : req.user._id})
            .populate('vendorId', {restaurantName : 1, location : 1, managerName : 1, contactPhone : 1, _id : 0})
            .populate('customerId', {phone : 1, firstName : 1, lastName : 1, email : 1, profileImage : 1, _id : 0})
            .populate({
                path : "orderId",
                select : {
                    cartDetail : 1, orderTime : 1, orderType : 1, deliveryPreference : 1, price : 1, discount : 1, finalPrice : 1, orderNo : 1, estimatedDeliveryTime : 1, _id : 0
                },
                populate : {
                    path : "cartDetail",
                    select : {
                        _id : 0, item : 1
                    },
                    populate : {
                        path : "item.itemId",
                        select : {
                            itemName : 1, menuImage : 1, _id : 0
                        }
                    }
                }
            })
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
                    message: `You have successfully delivered ${finalOrderList.length} orders to customer. `,
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
        res.send({
            success: false,
            STATUSCODE: 500,
            message: 'Internal DB error',
            response_data: {}
        })
    }  
})
//#endregion

//#region pending order list
app.get('/pendingOrderList', deliveryBoyJwtTokenValidator.validateToken, async (req, res) => {
    try {
        const data = req.query
        if(data){
            const userData = req.user
            const destLat = req.query.latitude;
            const destLong = req.query.longitude;

            const fetchAssignOrders = await OrderAssignToDeliveryBoy.find({deliveryStatus : 1, deliveryBoyId : req.user._id})
            .populate('vendorId', {restaurantName : 1, location : 1, managerName : 1, contactPhone : 1, _id : 0, logo : 1, banner : 1})
            .populate('customerId', {phone : 1, firstName : 1, lastName : 1, email : 1, profileImage : 1, _id : 0})
            .populate({
                path : "orderId",
                select : {
                    cartDetail : 1, orderTime : 1, orderType : 1, deliveryPreference : 1, price : 1, discount : 1, finalPrice : 1, orderNo : 1, estimatedDeliveryTime : 1, _id : 0
                },
                populate : {
                    path : "cartDetail",
                    select : {
                        _id : 0, item : 1
                    },
                    populate : {
                        path : "item.itemId",
                        select : {
                            itemName : 1, menuImage : 1, _id : 0
                        }
                    }
                }
            })
            .populate('deliveryAddressId')

            if(fetchAssignOrders.length > 0){
                let finalOrderList = []

                for(let i = 0; i < fetchAssignOrders.length; i++ ){
                    // vendor image
                    fetchAssignOrders[i].vendorId.logo = `${config.serverhost}:${config.port}/img/vendor/` + fetchAssignOrders[i].vendorId.logo
                    fetchAssignOrders[i].vendorId.banner = `${config.serverhost}:${config.port}/img/vendor/` + fetchAssignOrders[i].vendorId.banner
                    // end
                    
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
                    message: `${finalOrderList.length} orders are pending for delivered. `,
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
app.get('/viewProfile', deliveryBoyJwtTokenValidator.validateToken, async(req, res) => {
    try {
        let response = {
            firstName: req.user.firstName,
            lastName: req.user.lastName,
            email: req.user.email,
            phone: req.user.phone,
            vehicle: req.user.vehicle,
            numberPlate: req.user.numberPlate,
            driverLicense: req.user.driverLicense
        }

        if (req.user.profileImage != '') {
            response.profileImage = `${config.serverhost}:${config.port}/img/profile-pic/` + req.user.profileImage
        } else {
            response.profileImage = ''
        }

        res.send({
            success: true,
            STATUSCODE: 200,
            message: 'Vendor profile fetched successfully',
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
app.post('/editProfile', deliveryBoyJwtTokenValidator.validateToken, deliveryBoyValidator.editProfile, async(req, res) => {
    try {
        const userId = req.user._id

        const deliveryBoyDetail =  await deliveryboySchema.findById(userId)
        
        if(req.body.firstName != ''){
            deliveryBoyDetail.firstName = req.body.firstName
        }

        if(req.body.lastName != ''){
            deliveryBoyDetail.lastName = req.body.lastName
        }

        // if(req.body.email != ''){
        //     deliveryBoyDetail.email = req.body.email
        // }

        // if(req.body.phone != ''){
        //     deliveryBoyDetail.phone = req.body.phone
        // }

        if(req.body.vehicle != ''){
            deliveryBoyDetail.vehicle = req.body.vehicle
        }

        if(req.body.numberPlate != ''){
            deliveryBoyDetail.numberPlate = req.body.numberPlate
        }

        if(req.body.driverLicense != ''){
            deliveryBoyDetail.driverLicense = req.body.driverLicense
        }

        const updateUserDetail = await deliveryBoyDetail.save()

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

//#region  Profile image upload */
app.post('/profileImageUpload',deliveryBoyJwtTokenValidator.validateToken, async(req, res) => {
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

                const updateProfilePic = await deliveryboySchema.updateOne({_id : userDetail._id},{
                    $set : {
                        profileImage : profilePicName
                    }
                })

                if(updateProfilePic){
                    const getCurrentUser = await deliveryboySchema.findById(req.user._id)
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
        console.log(error,'object')
        res.send({
            success: false,
            STATUSCODE: 500,
            message: 'Internal DB error',
            response_data: {}
        })
    }
})
//#endregion


//#region Logout */
app.post('/logout', deliveryBoyJwtTokenValidator.validateToken, deliveryBoyValidator.logout, async(req, res) => {
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