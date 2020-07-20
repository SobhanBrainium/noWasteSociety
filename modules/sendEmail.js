import nodeMailer from "nodemailer"
import nodeMailerSmtpTransport from "nodemailer-smtp-transport"
import config from "../config"
import welcome from "./welcomeMail"
import forgotPassword from "./forgotPasswordMail"
import changeEmail from "./changeEmailMail"
import OTP from "./OTPmail"
import resent from "./resentOTPMail"
import restaurantAdmin from "./restaurantAdminWelcomeMail"
import deliveryBoyAdmin from "./deliveryBoyWelcomeMail"

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
        },
        "testingMail" : {
            subject : "Test email",
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
                        mailOption.html = welcome(data)
                        break;
                    case 'forgotPasswordMail': 
                        mailOption.html = forgotPassword(data)
                        break;
                    case 'changeEmailMail' :
                        mailOption.html = changeEmail(data)
                        break;
                    case 'sendOTPdMail' : 
                        mailOption.html = OTP(data)
                        break;
                    case 'resendOtpMail':
                        mailOption.html = resent(data)
                        break;
                    case 'restaurantAdminWelcomeMail' :
                        mailOption.html = restaurantAdmin(data, option)
                        break;
                    case 'deliveryBoyWelcomeMail' :
                        mailOption.html = deliveryBoyAdmin(data, option)
                    case 'testingMail' : 
                        mailOption.html = welcome(data)
                        break;
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

