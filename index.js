/******************************************************
 * PLEASE DO NOT EDIT THIS FILE
 * the verification process may break
 * ***************************************************/


'use strict';

var fs = require('fs');
var path = require('path');

var log = require('./wrappers');
var globals = require('./globals');

var http = require('http');
var https = require('https');
var selfCaller = function(path, req, res, cb, url) {
  var url = req.get('host').split(':');
  var port = url[1];
  url = url[0];
  var prot = req.protocol === 'https' ? https : http;
  var opts = {
    hostname : url,
    method : 'GET',
    path : path,
    port : port || 80
  };
  var rq = prot.request(opts, function(r){
    r.on('data', (d) => {cb(d.toString(), req, res, r.headers)});
    r.on('error', () => {res.status(500).type('txt').send('SERVER ERROR')});
    r.resume();
  });
  rq.end();
};

var enableCORS = function(req, res, next) {
  if (!process.env.DISABLE_XORIGIN) {
    var allowedOrigins = ['https://narrow-plane.gomix.me', 'https://www.freecodecamp.com'];
    var origin = req.headers.origin;
    if(!process.env.XORIG_RESTRICT || allowedOrigins.indexOf(origin) > -1) {
       res.set({
        'Access-Control-Allow-Origin': origin,
        "Access-Control-Allow-Headers" : "Origin, X-Requested-With, Content-Type, Accept"
       });
    }
  }
  next();
};

function setupBackgroundApp(app, myApp, dirname) {
  app.use(enableCORS);
  app.get('/_api/hello-console', function(req, res) {
    res.json({passed: globals.userPassedConsoleChallenge});
  });

  app.get('/_api/json', function(req, res) {
    var msgStyle = process.env.MESSAGE_STYLE;
    process.env.MESSAGE_STYLE = undefined;
    selfCaller('/json', req, res, function(lowerCase, req, res) {
      process.env.MESSAGE_STYLE = msgStyle;
      try {
        lowerCase = JSON.parse(lowerCase);
      } catch(e) {
        console.log(e);
        process.env.MESSAGE_STYLE = msgStyle;
        next(e);
      }
      res.json(lowerCase);
    });
  });

  app.get('/_api/use-env-vars', function(req, res, next) {
    fs.readFile(path.join(dirname, '.env'), function(err, data) {
      if (err) { return next(err) }
      var foundVar = !!data.toString().match(/MESSAGE_STYLE=uppercase/);
      if (!foundVar) return res.json({passed: false});
      var envvar = process.env.MESSAGE_STYLE;
      process.env.MESSAGE_STYLE = undefined;
      selfCaller('/json', req, res, function(lowerCase, req, res) {
        debugger
        try {
          lowerCase = JSON.parse(lowerCase).message;
        } catch(e) {
          console.log(e);
          next(e);
        }
        process.env.MESSAGE_STYLE = 'uppercase';
        selfCaller('/json', req, res, function(upperCase, req, res) {
          try {
            upperCase = JSON.parse(upperCase).message;
          } catch(e) {
            console.log(e);
            next(e);
          }
          process.env.MESSAGE_STYLE = envvar;
          if(lowerCase === 'Hello json' && upperCase === 'HELLO JSON'){
            res.json({ passed: true });
          } else {
            res.json({ passed: false });
          }
        });
      })
    });
  });

  var simpleLogCB = function (data, req, res) {
    res.json({passed : globals.userPassedLoggerChallenge });
  };
  app.get('/_api/root-middleware-logger', function(req, res){
    globals.userPassedLoggerChallenge = false;
    selfCaller('/json', req, res, simpleLogCB);
  });

  var routeTimeCB = function (data, req, res) {
    var timeObj;
    try {
      timeObj = JSON.parse(data);
    } catch (e) {
      return res.json({ time: 0 });
    }
    timeObj.stackLength = globals.nowRouteStackLength;
    res.json(timeObj);
  };
  app.get('/_api/chain-middleware-time', function(req, res) {
    selfCaller('/now', req, res, routeTimeCB);
  });

  app.get('/_api/add-body-parser', function(req, res) {
    res.json({mountedAt: globals.bodyParserMountPosition});
  });


  app.get('/_api/files/*?', function(req, res, next) {
    // exclude .env
    if(req.params[0] === '.env') {
      return next({status: 401, message: 'ACCESS DENIED'})
    }
    fs.readFile(path.join(dirname, req.params[0]), function(err, data) {
      if (err) { return next(err) }
      res.type('txt').send(data.toString());
    });
  });

  // (almost) safely mount the practicing app
  try {

    //myApp.use(enableCORS);
    app.use('/', myApp);
    var layers = myApp._router.stack.map(l => l.name)

    // check if body-parser is mounted
    var BPmountPos = layers.indexOf('urlencodedParser');
    globals.bodyParserMountPosition = BPmountPos > -1 ? BPmountPos - 1 : 0;

     // check if cookie-parser is mounted
    var CPmountPos = layers.indexOf('cookieParser');
    globals.cookieParserMountPosition = CPmountPos > -1 ? CPmountPos - 1 : 0;

    // check if /now route has a middleware before the handler
    var nowRoute = myApp._router.stack.filter(l => {
      if(l.route) {
        return l.route.path === '/now'
      }
      return false;
    })
    if(nowRoute.length > 0) {
      nowRoute = nowRoute[0];
      globals.nowRouteStackLength = nowRoute.route.stack.length;
    }

  } catch (e) {
    console.log(e);
  }

  // Error Handling
  app.use(function(err, req, res, next) {
    if(err) {
      return res.status(err.status || 500)
        .type('txt')
        .send(err.message || 'SERVER ERROR');
    }
  })

  // Not Found Handling
  app.use(function(req, res, next) {
    res.status(404).type('txt').send('Not Found');
  })
  return app;
}

exports.setupBackgroundApp = setupBackgroundApp;
exports.globals = globals;
exports.log = log;
