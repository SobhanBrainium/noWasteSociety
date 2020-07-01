import express from "express"
import csrf from "csurf"
import passport from "passport"

require('../../middlewares/passport')(passport)

let adminAPI = express.Router()
adminAPI.use(express.json())
adminAPI.use(express.urlencoded({extended: false}))

const csrfProtection = csrf({ cookie: true })

adminAPI.get('/', csrfProtection ,(req, res) => {
    const msg = req.flash('loginMessage')[0];
    res.render('adminLoginBody',{layout: 'adminLoginView', csrfToken: req.csrfToken(), message: msg});
}).post('/', csrfProtection, passport.authenticate('local-login', {
    successRedirect : '/admin/dashboard',
    failureRedirect: '/',
    failureFlash: true
}), (req, res) => {
    
})

module.exports = adminAPI;