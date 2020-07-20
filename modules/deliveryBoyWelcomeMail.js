import config from "../config"

const siteLogoURI = `${config.serverhost}:${config.port}/img/siteLogo.png`

export default function deliveryBoyAdmin(data, option) {
    return '<div>\
    <table width="100%" bgcolor="#fff" cellpadding="0" cellspacing="0" border="0">\
        <tbody>\
            <tr>\
                <td width="100%">\
                    <table style="max-width:580px;width:100%;" cellpadding="0" cellspacing="0" border="0" align="center">\
                        <tbody>\
                            <tr>\
                                <td width="100%" height="5"></td>\
                            </tr>\
                            <tr>\
                                <td align="right" valign="middle" style="font-family: Helvetica, arial, sans-serif; font-size: 10px;color: #999999">\
                                </td>\
                            </tr>\
                            <tr>\
                                <td width="100%" height="5"></td>\
                            </tr>\
                        </tbody>\
                    </table>\
                </td>\
            </tr>\
        </tbody>\
    </table>\
    </div>\
    <div>\
    <table width="100%" bgcolor="#fff" cellpadding="0" cellspacing="0" border="0">\
        <tbody>\
            <tr>\
                <td>\
                    <table style="max-width:580px;width:100%;" bgcolor="#f6f4f5" cellpadding="0" cellspacing="0" border="0" align="center">\
                        <tbody>\
                            <tr>\
                                <td>\
                                    <table width="100%" cellpadding="0" cellspacing="0" border="0" align="left">\
                                        <tbody>\
                                            <tr>\
                                                <td valign="middle" align="center" style="padding:20px 0;">\
                                                    <div><img src="'+ siteLogoURI +'" alt="logo" border="0" style="display:block; border:none; outline:none; text-decoration:none; "></div>\
                                                </td>\
                                            </tr>\
                                        </tbody>\
                                    </table>\
                                </td>\
                            </tr>\
                        </tbody>\
                    </table>\
                </td>\
            </tr>\
        </tbody>\
    </table>\
    </div>\
    <div>\
    <table width="100%" bgcolor="#fff" cellpadding="0" cellspacing="0" border="0">\
        <tbody>\
            <tr>\
                <td>\
                    <table bgcolor="#ffffff" style="width:580px;" align="center" cellspacing="0" cellpadding="0" border="0">\
                        <tbody>\
                            <tr>\
                                <td>\
                                    <table style="padding:0 15px;width:580px;"  cellspacing="0" cellpadding="0" border="0">\
                                        <tbody>\
                                            <tr>\
                                                <td style="font-family: Helvetica, arial, sans-serif; font-size: 13px; color: #666666; text-align:left;line-height: 24px;">\
                                                    <p>Hello ' + data.firstName + ',</p>\
                                                    <p>Welcome to No Waste Society. Your login credential is email ' + data.email + ' and password '+ option +'.</p>\
                                                </td>\
                                            </tr>\
                                            <tr>\
                                                <td width="100%" height="5"></td>\
                                            </tr>\
                                            <tr>\
                                                <td style="font-family: Helvetica, arial, sans-serif; font-size: 13px; color: #666666; text-align:left;line-height: 24px;">\
                                                    <p>Best regards,</p>\
                                                    <p>Team ' + config.siteConfig.SITENAME + '</p>\
                                                </td>\
                                            </tr>\
                                            <tr>\
                                                <td width="100%" height="5"></td>\
                                            </tr>\
                                        </tbody>\
                                    </table>\
                                </td>\
                            </tr>\
                        </tbody>\
                    </table>\
                </td>\
            </tr>\
        </tbody>\
    </table>\
    </div>\
    <div>\
    <table width="100%" cellpadding="0" cellspacing="0" border="0">\
        <tbody>\
            <tr>\
                <td width="100%">\
                    <table style="max-width:580px;width:100%;background: '+ config.siteConfig.SITECOLOR +';width:100%;" cellpadding="0" cellspacing="0" border="0" align="center" class="devicewidth">\
                        <tbody>\
                            <tr>\
                                <td width="100%" height="5"></td>\
                            </tr>\
                            <tr>\
                                <td align="center" valign="middle" style="padding:10px 0;font-family: Helvetica, arial, sans-serif; font-size: 10px;color: #fff">\
                                Copyright © 2019 Corporate '+ config.siteConfig.SITENAME +'. All rights reserved.\
                                </td>\
                            </tr>\
                            <tr>\
                                <td width="100%" height="5"></td>\
                            </tr>\
                        </tbody>\
                    </table>\
                </td>\
            </tr>\
        </tbody>\
    </table>\
    </div>';
}