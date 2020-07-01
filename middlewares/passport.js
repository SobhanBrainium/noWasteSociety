import mongoose from "mongoose"
import userSchema from "../schema/User"
import bCrypt from "bcryptjs"
import LocalStrategy from "passport-local"

let User = mongoose.model('User', userSchema)

module.exports = passport => {

    passport.serializeUser((user, done) => {
        done(null, user._id);
    });

    passport.deserializeUser((id, done) => {
        User.findById(id)
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
                return bCrypt.compareSync(password, userpass);
            }

            User.findOne({ email })
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
                    console.log(err);
                    return done(null, false, req.flash('loginMessage', 'Something wrong.Please try again.'));
                });
        })
    );
};