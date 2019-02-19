var express = require('express');
var router = express.Router();
var fs = require('fs');

require('node-import');
module.exports = imports("../sdk/queueit-knownuserv3-sdk.js");

function configureKnownUserHashing() {
  var utils = QueueIT.KnownUserV3.SDK.Utils;
  utils.generateSHA256Hash = function (secretKey, stringToHash) {
    const crypto = require('crypto');
    const hash = crypto.createHmac('sha256', secretKey)
      .update(stringToHash)
      .digest('hex');
    return hash;
  };
}

function initializeExpressHttpContextProvider(req, res) {
  return {
      getHttpRequest: function () {
          var httpRequest = {
              getUserAgent: function () {
                  return this.getHeader("user-agent");
              },
              getHeader: function (headerName) {
                  var headerValue = req.header(headerName);

                  if (!headerValue)
                      return "";

                  return headerValue;
              },
              getAbsoluteUri: function () {
                  return req.protocol + '://' + req.get('host') + req.originalUrl;
              },
              getUserHostAddress: function () {
                  return req.ip;
              },
              getCookieValue: function (cookieKey) {
                  // This requires 'cookie-parser' node module (installed/used from app.js)
                  return req.cookies[cookieKey];
              }
          };
          return httpRequest;
      },
      getHttpResponse: function () {
          var httpResponse = {
              setCookie: function (cookieName, cookieValue, domain, expiration) {
                  if (domain === "")
                      domain = null;

                  // expiration is in secs, but Date needs it in milisecs
                  var expirationDate = new Date(expiration * 1000);

                  // This requires 'cookie-parser' node module (installed/used from app.js)
                  res.cookie(
                      cookieName,
                      cookieValue,
                      {
                          expires: expirationDate,
                          path: "/",
                          domain: domain,
                          secure: false,
                          httpOnly: false
                      });
              }
          };
          return httpResponse;
      }
  };
}

configureKnownUserHashing();

/* GET home page. */
router.get('/', function (req, res, next) {
  try {
    var integrationsConfigString = fs.readFileSync('../integrationconfiguration.json', 'utf8');

    var customerId = ""; // Your Queue-it customer ID
    var secretKey = ""; // Your 72 char secret key as specified in Go Queue-it self-service platform

    var httpContextProvider = initializeExpressHttpContextProvider(req, res);

    var knownUser = QueueIT.KnownUserV3.SDK.KnownUser;
    var queueitToken = req.query[knownUser.QueueITTokenKey];
    var requestUrl = httpContextProvider.getHttpRequest().getAbsoluteUri();
    var requestUrlWithoutToken = requestUrl.replace(new RegExp("([\?&])(" + knownUser.QueueITTokenKey + "=[^&]*)", 'i'), "");
    // The requestUrlWithoutToken is used to match Triggers and as the Target url (where to return the users to).
    // It is therefor important that this is exactly the url of the users browsers. So, if your webserver is
    // behind e.g. a load balancer that modifies the host name or port, reformat requestUrlWithoutToken before proceeding.

    var validationResult = knownUser.validateRequestByIntegrationConfig(
      requestUrlWithoutToken, queueitToken, integrationsConfigString,
      customerId, secretKey, httpContextProvider);
	  
    if (validationResult.doRedirect()) {
      // Adding no cache headers to prevent browsers to cache requests
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': 'Fri, 01 Jan 1990 00:00:00 GMT'
      });

      // Send the user to the queue - either because hash was missing or because is was invalid
      res.redirect(validationResult.redirectUrl);      
    }
    else {      
	  // Request can continue - we remove queueittoken form querystring parameter to avoid sharing of user specific token
      if (requestUrl !== requestUrlWithoutToken && validationResult.actionType) {
        res.redirect(requestUrlWithoutToken);
      }
      else {
        // Render page
        res.render('index', {
          node_version: process.version,
          express_version: require('express/package').version
        });
      }
    }
  }
  catch (e) {
    // There was an error validationg the request
    // Use your own logging framework to log the Exception
    // This was a configuration exception, so we let the user continue
    console.log("ERROR:" + e);
  }
});

module.exports = router;