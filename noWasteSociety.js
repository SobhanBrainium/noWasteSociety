import express from "express"
import os from "os"
import fs from "fs"
import http from "http"
import https from "https"
import customerRoutes from "./routes/customers"
import mongoose from "mongoose"
import path from "path"
import bodyParser from "body-parser"
import cookieParser from "cookie-parser"
import config from "./config"
import exphbs from "express-handlebars"


const app = express();

var hostName = os.hostname();

let server;

//#region create server for localhost and production
if(hostName == 'nodeserver.brainiuminfotech.com'){
  let credentials = {
      key: fs.readFileSync('/etc/letsencrypt/live/nodeserver.brainiuminfotech.com/privkey.pem', 'utf8'),
      cert: fs.readFileSync('/etc/letsencrypt/live/nodeserver.brainiuminfotech.com/fullchain.pem', 'utf8')
  };

  server = https.createServer(credentials, app);
}else{
  server = http.createServer(app);
}
//#endregion

//#region mongoose connection
const productionDBString = `mongodb://${config.productionDB.username}:${config.productionDB.password}@${config.productionDB.host}:${config.productionDB.port}/${config.productionDB.dbName}?authSource=${config.productionDB.authDb}`

console.log(productionDBString,'productionDBString')

mongoose.Promise = global.Promise;
mongoose
  .connect(productionDBString, { useNewUrlParser: true })
  .then(() => console.log("Database connected successfully"))
  .catch(err => console.log(err));

//mongoose debugging
mongoose.set('debug', true);
//#endregion

//#region set crosse origin
const allowCrossDomain = function (req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // intercept OPTIONS method
  if ('OPTIONS' == req.method) {
    res.send(200);
  }
  else {
    next();
  }
};
app.use(allowCrossDomain);
//end
//#endregion

app.use(cookieParser());

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(express.static(path.join(__dirname, "public")));
// view engine setup
app.set('views', path.join(__dirname, 'views'));

//#region  hbs setup
var hbs = exphbs.create({
  extname: '.hbs', //we will be creating this layout shortly
  helpers: {
      if_eq: function (a, b, opts) {
        if (a == b) // Or === depending on your needs
          return opts.fn(this);
        else
          return opts.inverse(this);
      },
      if_neq: function (a, b, opts) {
        if (a != b) // Or === depending on your needs
          return opts.fn(this);
        else
          return opts.inverse(this);
      },
      inArray: function(array, value, block) {
        if (array.indexOf(value) !== -1) {
          return block.fn(this);
        }
        else {
          return block.inverse(this);
        }
      },
  
      for: function(from, to, incr, block) {
        var accum = 0;
        for(var i = from; i < to; i += incr)
            accum += block.fn(i);
        return accum;
      },
      ternary: (exp, ...a) => {
        return eval(exp);
      },
      eq: function (v1, v2) {
          return v1 == v2;
      },
      ne: function (v1, v2) {
          return v1 !== v2;
      },
      lt: function (v1, v2) {
          return v1 < v2;
      },
      gt: function (v1, v2) {
          return v1 > v2;
      },
      lte: function (v1, v2) {
          return v1 <= v2;
      },
      gte: function (v1, v2) {
          return v1 >= v2;
      },
      and: function (v1, v2) {
          return v1 && v2;
      },
      or: function (v1, v2) {
          return v1 || v2;
      },
      profile_src: function(value, options) {
        if (fs.existsSync("public/profile/"+value) && value != "") {
          return "/profile/"+value;
        }
        else {
          return "/admin/assets/img/pattern-cover.png";
        }
      },
      toLowerCase: function(value){
        return value.toLowerCase();
      },
      toUpperCase: function(value){
        return value.toUpperCase();
      },
    }
});  
//#endregion

//#region Load router
//==== Load Router =====//
app.use('/api/customer',customerRoutes);
//#endregion

//====Port open to run application
server.listen(config.port, (err) => {
  if (err) {
      throw err;
  } else {
      console.log(`No waste society server is running and listening to http://localhost:${config.port} `);
  }
});
