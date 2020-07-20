import os from "os"
var hostName = os.hostname();

module.exports = {
    "port": 2100,
    serverhost: hostName == 'nodeserver.brainiuminfotech.com' ? 'https://nodeserver.brainiuminfotech.com' : 'http://localhost',
    "secretKey": "hyrgqwjdfbw4534efqrwer2q38945765",
    productionDB: {
        username: 'brain1uMMong0User',
        password: 'PL5qnU9nuvX0pBa',
        host: '68.183.173.21',
        port: '27017',
        dbName: 'noWasteSociety',
        authDb: 'admin'
    },

    emailConfig: {
        MAIL_USERNAME: "sobhan.brainium@gmail.com",
        MAIL_PASS: "c29iaGFuQDEyMw=="
    },
    
    local: {
        database: "mongodb://localhost:27017/trolly",
        MAIL_USERNAME: "ipsita.brainium@gmail.com",
        MAIL_PASS: "gjhubtlvqzvnvidr"
    },
    twilio: {
        ACCOUNT_SID: '', //test acc
        AUTH_TOKEN: '',
        FROM_NO: ''
    },
    siteConfig: {
        LOGO: '#',
        SITECOLOR: '#0095B0',
        SITENAME: 'No Waste Society'
    },
    uploadContentPath: "public/uploads/content/",
    contentPath: "uploads/content/",
    uploadCsvPath: "public/uploads/csv/",
    csvPath: "uploads/csv/",
    rootPath : "/var/www/html/api-service/",
    liveUrl: "http://3.132.72.42/:1930/",
    adminUrl: "http://3.132.72.42/admin/",
    logPath: "/ServiceLogs/admin.debug.log",
    deeplink: "tipi://",
    dev_mode: true,
    __root_dir: __dirname,
    __site_url: '',
    limit: 10,
    adminEmailAddress:'ipsita12.amstech@gmail.com',
    beaconTimeDiff: '600000',
    restaurantSearchDistance: 5000,
}