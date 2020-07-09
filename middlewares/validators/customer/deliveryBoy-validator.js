var joi = require('@hapi/joi');

module.exports = {
    deliveryBoyLogin: async (req, res, next) => {
        const userTypeVal = ["customer", "deliveryBoy", "vendorowner", "admin", "vendoradmin"];
        const loginTypeVal = ["FACEBOOK", "GOOGLE", "EMAIL"];
        const appTypeVal = ["ANDROID", "IOS", "BROWSER"];
        const pushType = ["P", "S"];
        const rules = joi.object({
            user: joi.string().required().error(new Error('Email/phone is required')),
            password: joi.string().allow('').optional(),
            userType: joi.string().required().valid(...userTypeVal).error(new Error('Please send valid userType')),
            loginType : joi.string().required().error(new Error('Please send valid loginType')),
            deviceToken: joi.string().error(new Error('Device token required')),
            appType: joi.string().valid(...appTypeVal).error(new Error('App type required')),
            pushMode: joi.string().valid(...pushType).error(new Error('Push mode required'))
        });

        const value = await rules.validate(req.body);
        if (value.error) {
            console.log(value.error);
            res.status(422).json({
                success: false,
                STATUSCODE: 422,
                message: value.error.message
            })
        } else if ((req.body.userType != 'admin') && (req.body.userType != 'vendoradmin')) {
            if ((req.body.deviceToken == '') || (req.body.deviceToken == undefined) || (req.body.appType == '') || (req.body.appType == undefined) || (req.body.pushMode == '') || (req.body.pushMode == undefined)) {
                if ((req.body.deviceToken == '') || (req.body.deviceToken == undefined)) {
                    res.status(422).json({
                        success: false,
                        STATUSCODE: 422,
                        message: 'Device token required'
                    })
                } else if ((req.body.appType == '') || (req.body.appType == undefined)) {
                    res.status(422).json({
                        success: false,
                        STATUSCODE: 422,
                        message: 'App type required'
                    })
                } else if ((req.body.pushMode == '') || (req.body.pushMode == undefined)) {
                    res.status(422).json({
                        success: false,
                        STATUSCODE: 422,
                        message: 'Push mode required'
                    })
                }
            } else {
                next();
            }
        } else {
            next();
        }
    },
}