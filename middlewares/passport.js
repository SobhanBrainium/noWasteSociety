import mongoose from "mongoose"
import adminSchema from "../schema/Admin"
import bcrypt from "bcryptjs"
import LocalStrategy from "passport-local"

let Admin = mongoose.model('Admin', adminSchema)

module.exports = passport => {

    passport.serializeUser((user, done) => {
        done(null, user._id);
    });

    passport.deserializeUser((id, done) => {
        Admin.findById(id)
            .then(user => {
                return done(null, user);
            });
    });

    passport.use('local-login',
        new LocalStrategy({
            usernameField: 'email',
            passwordField: 'password',
            passReqToCallback: true
        }, (req, email, password, done) => {
            var isValidPassword = function (userpass, password) {
                return bcrypt.compareSync(password, userpass);
            }

            Admin.findOne({ email, userType : req.body.userType})
                .then(user => {
                    if(!user) {
                        return done(null, false, req.flash('loginMessage', 'Wrong Username or password'));
                    }
                    if (!isValidPassword(user.password, password)) {
                        return done(null, false, req.flash('loginMessage', 'Wrong Username or password'));
    
                    }
                    return done(null, user);
                })
                .catch(err => {
                    return done(null, false, req.flash('loginMessage', 'Something wrong.Please try again.'));
                });
        })
    );
};