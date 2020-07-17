import nodeMailer from "nodemailer"
import nodeMailerSmtpTransport from "nodemailer-smtp-transport"
import config from "../config"

module.exports = function(emailType) {
    const emailFrom = config.emailConfig.MAIL_USERNAME;
    const emailPass = config.emailConfig.MAIL_PASS;

    // define mail types
    var mailDict = {
        "userRegistrationMail" :{
            subject : "Welcome to No Waste Society",
            //html    : require('./welcomeUser'),
        },
        "forgotPasswordMail" :{
            subject : "Forgot Password",
            //html    : require('./forgotPasswordMail'),
        },
        "sendOTPdMail" :{
            subject : "OTP verification email",
            //html    : require('./otpVerificationMail'),
        },
        "resendOtpMail": {
            subject : "Resend OTP",
        },
        "restaurantAdminWelcomeMail" : {
            subject : "Welcome to No waste society"
        },
        "deliveryBoyWelcomeMail" : {
            subject : "Welcome to No waste society"
        }
    };

    let transporter = nodeMailer.createTransport(nodeMailerSmtpTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        requireTLS: true,
        auth: {
            user: emailFrom,
            pass: new Buffer(emailPass,'base64').toString('ascii')
        }
    }));


    return function(to, data, option = '') {
        var self = {
            send: () => {
                var mailOption = {
                    from: `'"No Waste Society" <${emailFrom}>'`,
                    to: to,
                    subject: mailDict[emailType].subject,
                    // text: `Hello ${data.name}, please verify your studiolive account. Your verification code is ${data.otp}`
                };

                /** Temporary Email text */
                switch(emailType) {
                    case 'userRegistrationMail': 
                        mailOption.text = `Hello ${data.firstName}, welcome to No Waste Society.`
                        break;
                    case 'forgotPasswordMail': 
                        mailOption.text = `Hello ${data.firstName}, use ${data.forgotPasswordOtp} code to reset your password.`
                        break;
                    case 'sendOTPdMail' : 
                        mailOption.text = `Hello ${data.firstName}, your OTP is ${data.otp}. Please verify it.`
                        break;
                    case 'resendOtpMail':
                        mailOption.text = `Hello ${data.firstName}, use ${data.otp} code to verify your account.`
                        break;
                    case 'restaurantAdminWelcomeMail' :
                        mailOption.text = `Hello ${data.firstName}. welcome to No Waste Society. Your login credential is email ${data.email} and password ${option}. Login URL ${config.serverhost}:${config.port}`
                        break;

                    case 'deliveryBoyWelcomeMail' :
                        mailOption.text = `Hello ${data.firstName}. welcome to No Waste Society. Your login credential is email ${data.email} and password ${option}.`
                }
 

                transporter.sendMail(mailOption, function(error, info) {
                    if (error) {
                        console.log(error);
                    } else {
                        console.log('Email Sent', info.response);
                        return info.response
                    }
                });
            }
        }
        return self;
    }
}

