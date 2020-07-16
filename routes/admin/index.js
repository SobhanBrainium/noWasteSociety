import express from "express"
import mongoose from "mongoose"
import csrf from "csurf"
import passport from "passport"
import multer from "multer"
import _ from "lodash"

import userSchema from "../../schema/User"
import orderSchema from "../../schema/Order"
import adminSchema from "../../schema/Admin"
import vendorSchema from "../../schema/Vendor"
import itemSchema from "../../schema/Item"

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
//#region restaurant image upload
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
//#region item image upload
const restaurantItemAdd_storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, 'public/img/item');
    },
    filename: function (req, file, cb) {
      const fileExt = file.mimetype.split('/')[1];
      
      const fileName = req.user._id + '-' + Date.now() + '.' + fileExt;
      cb(null, fileName);
    }
});
const addItemImage = multer({ storage: restaurantItemAdd_storage, limits: {fileSize:3000000, fileFilter:restrictImgType} });
//#endregion
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
            // const addVendorObj = new vendorSchema({
            //     restaurantName : req.body.restaurantName,
            //     managerName : addedAdmin._id
            // })

            // const addVendor = await addVendorObj.save()
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

adminAPI.get('/vendor/restaurant/add', auth, csrfProtection, async (req, res) => {
    const errorMessage = req.flash('Error')[0]
    const successMessage = req.flash('Success')[0]

    res.render('vendor/restaurant/add', {
        layout : "adminDashboardView",
        title : "Restaurant Add",
        csrfToken: req.csrfToken(),
        errorMessage : errorMessage,
        message : successMessage
    })
})

adminAPI.post('/vendor/restaurant/add/submit/', auth, addRestaurant.fields([{name: 'licenceImage', maxCount: 1},{name: 'banner', maxCount: 1},{name: 'logo', maxCount: 1 }]), async (req, res) => {
    const restaurantAdmin = req.user._id

    let licenceImage, banner, logo

    if (req.files.licenceImage && req.files.licenceImage.length > 0){
        licenceImage = req.files.licenceImage[0].filename;
    }else{
        licenceImage = ''
    }

    if (req.files.banner && req.files.banner.length > 0){
        banner = req.files.banner[0].filename;
    }else{
        banner = ''
    }

    if (req.files.logo && req.files.logo.length > 0){
        logo = req.files.logo[0].filename;
    }else{
        logo = ''
    }

    const addRestaurant = new vendorSchema({
        restaurantName : req.body.restaurantName,
        managerName : restaurantAdmin,
        description : req.body.restaurantDescription,
        contactEmail : req.body.contactEmail,
        contactPhone : req.body.contactPhone,
        address : req.body.restaurantAddress,
        logo : logo,
        banner : banner,
        licenceImage : licenceImage,
        location: {
            type: 'Point',
            coordinates: [88.444899,22.599331]
        },
    })
    const addedData = await addRestaurant.save()
    if(addedData){
        return res.json({
            status : 200,
            message : "Restaurant has been successfully added."
        })
    }else{
        return res.json({
            status : 400,
            message : "added failed."
        })
    }

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

adminAPI.get('/vendor/restaurant/item/list', auth, csrfProtection, async (req, res) => {
    const errorMessage = req.flash('Error')[0]
    const successMessage = req.flash('Success')[0]

    const restaurantAdminDetail = req.user

    const getRestaurantListOfLoggedInAdmin = await vendorSchema.find({isActive : true, managerName : restaurantAdminDetail._id},{_id : 1}).sort({_id : -1})

    if(getRestaurantListOfLoggedInAdmin.length > 0){
        let finalItemArray = []

        for(let i = 0; i < getRestaurantListOfLoggedInAdmin.length; i++){
            const restaurantId = getRestaurantListOfLoggedInAdmin[i]._id

            const getItemList = await itemSchema.find({vendorId : restaurantId, isActive : true}).sort({_id : -1}).populate('vendorId')

            if(getItemList.length > 0){
                for(let j = 0; j < getItemList.length; j++){

                    finalItemArray.push(getItemList[j])
                }
            }
        }

        res.render('vendor/item/list',{
            layout : "adminDashboardView",
            title : "Item List",
            csrfToken: req.csrfToken(),
            list : finalItemArray,
            errorMessage : errorMessage,
            message : successMessage
        })
    }else{
        req.flash('Error', 'No restaurant found.')
        res.render('vendor/item/list',{
            layout : "adminDashboardView",
            title : "Item List",
            csrfToken: req.csrfToken(),
            list : '',
            errorMessage : errorMessage,
            message : successMessage
        })
    }
})

adminAPI.get('/vendor/restaurant/item/add', auth, csrfProtection, async (req, res) => {
    const errorMessage = req.flash('Error')[0]
    const successMessage = req.flash('Success')[0]

    const getAllRestaurantName = await vendorSchema.find({isActive : true, managerName : req.user._id}, {_id : 1, restaurantName : 1})
    .sort({_id : -1})

    res.render('vendor/item/add',{
        layout : "adminDashboardView",
        title : "Item Add",
        csrfToken: req.csrfToken(),
        restaurant : getAllRestaurantName,
        errorMessage : errorMessage,
        message : successMessage
    })
})

adminAPI.post('/vendor/restaurant/item/add/submit', auth, addItemImage.single('itemImage'), async (req, res) => {
    const restaurantAdminDetail = req.user
    const data = req.body
    if(data){
        const itemImage = req.file.filename

        const addItemObj = new itemSchema({
            itemName : data.itemName,
            vendorId : data.restaurantOption,
            description : data.itemDescription,
            price : data.itemPrice,
            waitingTime : data.itemWaitingTime,
            menuImage : itemImage
        })

        const addedResponse = await addItemObj.save()

        if(addedResponse){
            return res.json({
                status : 200,
                message : "Restaurant item has successfully added."
            })
        }else{
            return res.json({
                status : 400,
                message : "Added failed."
            })
        }
    }
})

adminAPI.get('/vendor/restaurant/item/delete/:itemId', auth, csrfProtection, async (req, res) => {
    const itemId = req.params.itemId

    const isExist = await itemSchema.findById(itemId)

    if(isExist){
        const deletedRestaurant = await itemSchema.remove({_id : isExist._id})
        if(deletedRestaurant){
            req.flash('Success', 'Restaurant item deleted successfully.')
            res.redirect('/vendor/restaurant/item/list')
        }
    }else{
        req.flash('Error', 'Restaurant item deleted failed.')
        res.redirect('/vendor/restaurant/item/list')
    }
})

adminAPI.get('/vendor/restaurant/item/edit/:itemId', auth, csrfProtection, async (req, res) => {
    const errorMessage = req.flash('Error')[0]
    const successMessage = req.flash('Success')[0]

    const getItemDetail = await itemSchema.findById(req.params.itemId)

    res.render('vendor/item/edit', {
        layout : "adminDashboardView",
        title : "Item Edit",
        csrfToken: req.csrfToken(),
        item : getItemDetail,
        errorMessage : errorMessage,
        message : successMessage
    })
})

adminAPI.post('/vendor/restaurant/item/edit/submit', auth, addItemImage.single('itemImage'), async(req, res) => {
    const data = req.body
    if(data){

        const isExist = await itemSchema.findById(data.itemId)
    
        if(isExist){
    
            let itemImageName = ''
            if(req.file){
                itemImageName = req.file.filename
            }else{
                itemImageName = isExist.menuImage
            }

            // update data
            isExist.itemName = data.itemName,
            isExist.description = data.itemDescription,
            isExist.price = data.itemPrice,
            isExist.waitingTime = data.itemWaitingTime,
            isExist.menuImage = itemImageName

            const updatedResult = await isExist.save()

            if(updatedResult){
                return res.json({
                    status : 200,
                    message : "Restaurant item has been updated successfully."
                })
            }else{
                return res.json({
                    status : 400,
                    message : "Updated failed."
                })
            }
        }else{
            return res.json({
                status : 400,
                message : "No item found."
            })
        }
    }else{
        return res.json({
            status : 400,
            message : "No data selected."
        })
    }
})

//#endregion

adminAPI.get("/logout", async(req, res) => {
    req.logout();
    res.redirect('/');
})

module.exports = adminAPI; 