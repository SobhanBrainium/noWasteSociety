module.exports = (req, res, next) => {
    if(req.isAuthenticated()) {
        const ulrArr = req.originalUrl.split("/");
        // console.log(ulrArr,'ulrArr')
        delete req.user.password;
        res.locals.user = req.user;
        res.locals.client_url = ulrArr[2];
        return next();
    }
    res.redirect('/');
};