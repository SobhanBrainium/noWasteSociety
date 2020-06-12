import jwt from "jsonwebtoken"
import config from "../config"
import mongoose from "mongoose"
import userSchema from "../schema/User"

let User = mongoose.model('User', userSchema)
/**
 * @developer : Sobhan Das
 * @date : 27th May 2020
 * @description : Middleware function for validating request data and JWT token.
 */
exports.validateToken = async (req, res, next) => {
    //console.log(req.body);
    var token = req.headers['authorization'];
    if (token) {
        if (token.startsWith('Bearer ') || token.startsWith('bearer ')) {
            // Remove Bearer from string
            token = token.slice(7, token.length);
        }
        // decode token
        if (token) {
            jwt
                .verify(token, config.secretKey, async function (err, decoded) {
                    if (err) {
                        res.status(401).send({
                            success: false,
                            STATUSCODE: 401,
                            message: 'Token not valid',
                            response_data: {}
                        });
                    }
                    else {
                        //  //VALID USER CHECK
                        //  if (req.body.customerId != decoded.subject) {
                        //     res.status(401).send({
                        //         success: false,
                        //         STATUSCODE: 401,
                        //         message: 'Request info not valid',
                        //         response_data: {}
                        //     });
                        // } else {
                            const userDetail = await User.findById(decoded.subject)
                            if(userDetail != null){
                                req.user = userDetail
                                next();
                            }else{
                                res.status(401).send({
                                    success: false,
                                    STATUSCODE: 401,
                                    message: 'User not found.',
                                    response_data: {}
                                });
                            }
                        // }
                    }
                });

        } else {
            res.status(401).send({
                success: false,
                STATUSCODE: 401,
                message: 'Token format not valid',
                response_data: {}
            });

        }
    } else {
        res.status(401).send({
            success: false,
            STATUSCODE: 401,
            message: 'Token format not valid',
            response_data: {}
        });

    }

}