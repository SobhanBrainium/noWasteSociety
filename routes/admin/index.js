import express from "express"
import mongoose from "mongoose"
import csrf from "csurf"
import passport from "passport"
import multer from "multer"

import userSchema from "../../schema/User"
import orderSchema from "../../schema/Order"
import adminSchema from "../../schema/Admin"
import vendorSchema from "../../schema/Vendor"

//#region middleware
import auth from "../../middlewares/auth"
//#endregion

require('../../middlewares/passport')(passport)

let adminAPI = express.Router()
adminAPI.use(express.json())
adminAPI.use(express.urlencoded({extended: false}))

const csrfProtection = csrf({ cookie: true })

const User = mongoose.model('User', userSchema)
const Admin = mongoose.model('Admin', adminSchema)

const mail = require('../../modules/sendEmail');

//#region image upload with multer
const restaurantAdd_storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, 'public/img/vendor');
    },
    filename: function (req, file, cb) {
      const fileExt = file.mimetype.split('/')[1];
      
      const fileName = req.user._id + '-' + Date.now() + '.' + fileExt;
      cb(null, fileName);
    }
});
const restrictImgType = function(req, file, cb) {
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

const addRestaurant = multer({ storage: restaurantAdd_storage, limits: {fileSize:3000000, fileFilter:restrictImgType} });
//#endregion

adminAPI.get('/', csrfProtection ,(req, res) => {
    const msg = req.flash('loginMessage')[0];
    res.render('adminLoginBody',{layout: 'adminLoginView', csrfToken: req.csrfToken(), message: msg});
})

adminAPI.post('/login', csrfProtection, passport.authenticate('local-login', {
    // successRedirect : '/admin/dashboard',
    failureRedirect: '/',
    failureFlash: true
}), (req, res) => {
    if(req.user != undefined && req.user.userType === 'restaurant'){
        res.redirect('/vendor/dashboard');
    }

    else if(req.user != undefined && req.user.userType === 'admin'){
        res.redirect('/admin/dashboard');
    }
})

//#region Admin route
adminAPI.get("/admin/dashboard", auth, csrfProtection, async (req, res) => {
    //#region get number of registered user
    const getNumberOfUser = await User.countDocuments({isActive : true})
    //#endregion

    //#region get number of user ordered
    const getNumberOfOrder = await orderSchema.countDocuments()
    //#endregion

    //#region get number of restaurant admin
    const getNumberOfRestaurantAdmin = await Admin.countDocuments({userType : 'restaurant'})
    //#endregion

    res.render('dashboard', {
        layout:"adminDashboardView", 
        title:"Admin Dashboard", 
        totalUser : getNumberOfUser, 
        totalOrder : getNumberOfOrder,
        totalRestaurantAdmin : getNumberOfRestaurantAdmin,
        csrfToken: req.csrfToken()
    });
})

adminAPI.get('/admin/restaurant', auth, csrfProtection, async (req, res) => {
    // fetch restaurant admin details
    const restaurantAdminDetail = await vendorSchema.find({isActive : true})
    .populate('managerName')
    .sort({_id : -1})
    // end

    res.render('restaurant/list', {
        layout : "adminDashboardView",
        title : "Restaurant Admin List",
        csrfToken: req.csrfToken(),
        list : restaurantAdminDetail
    })
})

adminAPI.get('/admin/restaurant/addAdmin', auth, csrfProtection,  async (req, res) => {
    const success_message = req.flash('addRestaurantAdminMessage')[0];
    const errorMessage = req.flash('Error')[0]
    res.render('restaurant/add', {
        layout : "adminDashboardView",
        title : "Restaurant Admin Add",
        csrfToken: req.csrfToken(),
        message : success_message,
        errorMessage : errorMessage
    })
}).post('/admin/restaurant/addAdmin', auth,  csrfProtection, async(req, res) => {
    try {
        const isExist = await Admin.findOne({
            $or : [{email : req.body.email}, {phone : req.body.mobileNumber}]
        })
        
        if(isExist){
            req.flash('addRestaurantAdminMessage', 'Restaurant admin already exist with this email or phone,');
            res.redirect('/admin/restaurant/addAdmin');
        }else{
            // add user to db and sent admin credential using email
            const generateRandomPassword = Math.random().toString().replace('0.', '').substr(0, 8)
            //#region add restaurant admin detail
            const adminObj = new Admin({
                firstName : req.body.managerFirstName,
                lastName : req.body.managerLastName,
                email : req.body.email,
                phone : req.body.mobileNumber,
                password : generateRandomPassword,
                isActive : true,
                userType : 'restaurant'
            })
        
            const addedAdmin = await adminObj.save()
            //#region 

            //#region add restaurant detail
            const addVendorObj = new vendorSchema({
                restaurantName : req.body.restaurantName,
                managerName : addedAdmin._id
            })

            const addVendor = await addVendorObj.save()
            //#endregion

            // sent email with password
            mail('restaurantAdminWelcomeMail')(addedAdmin.email, addedAdmin, generateRandomPassword).send();
        
            req.flash('addRestaurantAdminMessage', 'Restaurant admin has been added successfully.');
            res.redirect('/admin/restaurant/addAdmin');
        }

    } catch (error) {
        req.flash('Error', 'Something went wrong.');
        res.redirect('/admin/restaurant/addAdmin');
    }
})
//#endregion

//#region vendor route
adminAPI.get('/vendor/dashboard', auth, csrfProtection, async (req, res) => {
    res.render('dashboard', {
        layout:"adminDashboardView", 
        title:"Vendor Dashboard",
        csrfToken: req.csrfToken()
    });
})

adminAPI.get('/vendor/restaurant', auth, csrfProtection, async (req, res) => {
    const errorMessage = req.flash('Error')[0]
    const successMessage = req.flash('Success')[0]

    // fetch restaurant admin details
    const restaurantAdminDetail = await vendorSchema.find({isActive : true, managerName : req.user._id})
    .sort({_id : -1})
    // end

    res.render('vendor/restaurant/list', {
        layout : "adminDashboardView",
        title : "Restaurant List",
        csrfToken: req.csrfToken(),
        list : restaurantAdminDetail,
        errorMessage : errorMessage,
        message : successMessage
    })
})

adminAPI.get('/vendor/restaurant/edit/:id', auth, csrfProtection, async (req, res) => {
    const restaurantId = req.params.id
    const restaurantAdminDetail = req.user

    const fetchRestaurantDetail = await vendorSchema.findOne({_id : restaurantId, managerName : restaurantAdminDetail._id})

    if(fetchRestaurantDetail){
        res.render('vendor/restaurant/edit',{
            layout : "adminDashboardView",
            title : "Restaurant Edit",
            csrfToken: req.csrfToken(),
            restaurant : fetchRestaurantDetail,
        })
    }else{
        req.flash('vendorEditError', 'No restaurant found.');
        res.redirect('/vendor/restaurant')
    }
})

adminAPI.post('/vendor/restaurant/edit/submit', auth, addRestaurant.fields([{name: 'licenceImage', maxCount: 1},{name: 'banner', maxCount: 1},{name: 'logo', maxCount: 1 }]), async (req, res) => {
    const restaurantAdminDetail = req.user

    const getRestaurantData = await vendorSchema.findOne({_id : req.body.restaurantId, managerName : restaurantAdminDetail._id})

    let licenceImage, banner, logo

    if (req.files.licenceImage && req.files.licenceImage.length > 0){
        licenceImage = req.files.licenceImage[0].filename;
    }else{
        licenceImage = getRestaurantData.licenceImage
    }

    if (req.files.banner && req.files.banner.length > 0){
        banner = req.files.banner[0].filename;
    }else{
        banner = getRestaurantData.banner
    }

    if (req.files.logo && req.files.logo.length > 0){
        logo = req.files.logo[0].filename;
    }else{
        logo = getRestaurantData.logo
    }


    if(getRestaurantData){
        getRestaurantData.restaurantName = req.body.restaurantName
        getRestaurantData.description = req.body.restaurantDescription
        getRestaurantData.contactEmail = req.body.contactEmail
        getRestaurantData.contactPhone = req.body.contactPhone
        getRestaurantData.address = req.body.restaurantAddress
        getRestaurantData.logo = logo
        getRestaurantData.banner = banner
        getRestaurantData.licenceImage = licenceImage

        const updatedData = await getRestaurantData.save()
        if(updatedData){
            return res.json({
                status : 200,
                message : "Restaurant has successfully updated."
            })
        }
    }else{
        return res.json({
            status : 400,
            message : "Updated failed."
        })
    }
})

adminAPI.get('/vendor/restaurant/delete/:restaurantId', auth, async (req, res) => {
    const restaurantId = req.params.restaurantId

    const isExist = await vendorSchema.findById(restaurantId)

    if(isExist){
        isExist.isActive = false
        const deletedRestaurant = await isExist.save()

        req.flash('Success', 'Restaurant deleted successfully.')
        res.redirect('/vendor/restaurant')
    }else{
        req.flash('Error', 'Restaurant deleted failed.')
        res.redirect('/vendor/restaurant')
    }
})
//#endregion

adminAPI.get("/logout", async(req, res) => {
    req.logout();
    res.redirect('/');
})

module.exports = adminAPI; 