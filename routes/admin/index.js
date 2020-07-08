import express from "express"
import mongoose from "mongoose"
import csrf from "csurf"
import passport from "passport"

import userSchema from "../../schema/User"
import orderSchema from "../../schema/Order"
import adminSchema from "../../schema/Admin"

require('../../middlewares/passport')(passport)

let adminAPI = express.Router()
adminAPI.use(express.json())
adminAPI.use(express.urlencoded({extended: false}))

const csrfProtection = csrf({ cookie: true })

const User = mongoose.model('User', userSchema)
const Admin = mongoose.model('Admin', adminSchema)

adminAPI.get('/', csrfProtection ,(req, res) => {
    const msg = req.flash('loginMessage')[0];
    res.render('adminLoginBody',{layout: 'adminLoginView', csrfToken: req.csrfToken(), message: msg});
}).post('/', csrfProtection, passport.authenticate('local-login', {
    successRedirect : '/dashboard',
    failureRedirect: '/',
    failureFlash: true
}), (req, res) => {
    
})

adminAPI.get("/dashboard", csrfProtection, async (req, res) => {
    //#region get number of registered user
    const getNumberOfUser = await User.countDocuments({isActive : true})
    //#endregion

    //#region get number of user ordered
    const getNumberOfOrder = await orderSchema.countDocuments()
    //#endregion

    res.render('dashboard', {
        layout:"adminDashboardView", 
        title:"Dashboard", 
        totalUser : getNumberOfUser, 
        totalOrder : getNumberOfOrder,
        csrfToken: req.csrfToken()
    });
})

adminAPI.get('/restaurant', csrfProtection, async (req, res) => {
    // fetch restaurant admin details
    const restaurantAdminDetail = await Admin.find({isActive : true, userType : 'restaurant'},{
        _id : 1,
        firstName : 1,
        lastName : 1,
        email : 1,
        phone : 1
    })
    .sort({_id : -1})
    // end

    res.render('restaurant/list', {
        layout : "adminDashboardView",
        title : "Restaurant Admin List",
        csrfToken: req.csrfToken(),
        list : restaurantAdminDetail
    })
})

adminAPI.post('/restaurant/addAdmin', csrfProtection,  async (req, res) => {
    try {
        // add user to db and sent admin credential using email
        const generateRandomPassword = Math.random().toString().replace('0.', '').substr(0, 8)

        const adminObj = new Admin({
            firstName : req.body.firstName,
            lastName : req.body.lastName,
            email : req.body.email,
            phone : req.body.mobileNumber,
            password : generateRandomPassword,
            isActive : true,
            userType : 'restaurant'
        })

        await adminObj.save()

        const msg = req.flash('restaurantAdmin', 'Admin has been added successfully.')

        res.render('addRestaurantAdmin', {
            layout : "adminDashboardView",
            title : "Restaurant Admin",
            message: msg[0]
        })
    } catch (error) {
        const msg = req.flash('restaurantAdmin', 'Something went wrong.')
        res.render('addRestaurantAdmin', {
            layout : "adminDashboardView",
            title : "Restaurant Admin",
            message: msg[0]
        })
    }
})

adminAPI.get("/logout", async(req, res) => {
    req.logout();
    res.redirect('/');
})

module.exports = adminAPI;