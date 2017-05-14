var request = require('request');
var cheerio = require('cheerio');
var URL = require('url-parse');

var fs = require('fs');
var readline = require('readline');
var google = require('googleapis');
var googleAuth = require('google-auth-library');

// If modifying these scopes, delete your previously saved credentials
// at ~/.credentials/calendar-nodejs-quickstart.json
var SCOPES = ['https://www.googleapis.com/auth/calendar'];
var TOKEN_DIR = (process.env.HOME || process.env.HOMEPATH ||
    process.env.USERPROFILE) + '/.credentials/';
var TOKEN_PATH = TOKEN_DIR + 'biu-crawler.json';

// Load client secrets from a local file.
fs.readFile('client_secret.json', function processClientSecrets(err, content) {
  if (err) {
    console.log('Error loading client secret file: ' + err);
    return;
  }
  // Authorize a client with the loaded credentials, then call the
  // Google Calendar API.
  authorize(JSON.parse(content), addEvent);
});

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 *
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
  var clientSecret = credentials.installed.client_secret;
  var clientId = credentials.installed.client_id;
  var redirectUrl = credentials.installed.redirect_uris[0];
  var auth = new googleAuth();
  var oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, function(err, token) {
    if (err) {
      getNewToken(oauth2Client, callback);
    } else {
      oauth2Client.credentials = JSON.parse(token);
      callback(oauth2Client);
    }
  });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 *
 * @param {google.auth.OAuth2} oauth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback to call with the authorized
 *     client.
 */
function getNewToken(oauth2Client, callback) {
  var authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES
  });
  console.log('Authorize this app by visiting this url: ', authUrl);
  var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  rl.question('Enter the code from that page here: ', function(code) {
    rl.close();
    oauth2Client.getToken(code, function(err, token) {
      if (err) {
        console.log('Error while trying to retrieve access token', err);
        return;
      }
      oauth2Client.credentials = token;
      storeToken(token);
      callback(oauth2Client);
    });
  });
}

/**
 * Store token to disk be used in later program executions.
 *
 * @param {Object} token The token to store to disk.
 */
function storeToken(token) {
  try {
    fs.mkdirSync(TOKEN_DIR);
  } catch (err) {
    if (err.code != 'EEXIST') {
      throw err;
    }
  }
  fs.writeFile(TOKEN_PATH, JSON.stringify(token));
  console.log('Token stored to ' + TOKEN_PATH);
}


function parseRelativePath(root, relativePath) {
  return `${root}${relativePath.slice(2)}`
}

function formatTime(time) {
  var re = /(\d+)年(\d+)月(?:(\d+)日|)/g;
  return time.match(re).map(t => t.replace(re, (match, p1, p2, p3) => (
    p3 ? [p1, p2, p3].join('-') : [p1, p2].join('-')
  )))
}

class Exhibit {
  constructor(summary, time, location, desciption) {
    this.summary = summary;
    this.start = {
      dateTime: (new Date(Date.parse(time[0]))).toJSON(),
      timeZone: 'Asia/Shanghai'
    };
    this.end = {
      dateTime: (new Date(Date.parse(time[1]))).toJSON(),
      timeZone: 'Asia/Shanghai'
    };
    this.location = location;
    this.desciption = desciption;
  }
}

var pageToVisit = "http://www.artmuseum.tsinghua.edu.cn/cpsj/zlxx/zzzl/lszl/";
var exhibitLinks = [];
var exhibits = [];



// var event = {
//   'summary': 'Google I/O 2015',
//   'location': '800 Howard St., San Francisco, CA 94103',
//   'description': 'A chance to hear more about Google\'s developer products.',
//   'start': {
//     'dateTime': '2015-05-28T09:00:00-07:00',
//     'timeZone': 'America/Los_Angeles',
//   },
//   'end': {
//     'dateTime': '2015-05-28T17:00:00-07:00',
//     'timeZone': 'America/Los_Angeles',
//   },
//   'recurrence': [
//     'RRULE:FREQ=DAILY;COUNT=2'
//   ],
//   'attendees': [
//     {'email': 'lpage@example.com'},
//     {'email': 'sbrin@example.com'},
//   ],
//   'reminders': {
//     'useDefault': false,
//     'overrides': [
//       {'method': 'email', 'minutes': 24 * 60},
//       {'method': 'popup', 'minutes': 10},
//     ],
//   },
// };

function addEvent(auth) {

  console.log("Visiting page " + pageToVisit);
  request(pageToVisit, function(error, response, body) {
    if(error) { console.log("Error: " + error) }
    // console.log("Status code: " + response.statusCode);
    if(response.statusCode === 200) {
       var $ = cheerio.load(body);
       var tempLinks = $('.dhy_cg_zl > h4 > a');
       tempLinks.each(function(i, el) {
         exhibitLinks.push(parseRelativePath(pageToVisit, $(this).attr('href')));
       })
       for (var i = 0; i < exhibitLinks.length; i++) {
         console.log("Visiting page " + exhibitLinks[i]);
         request(exhibitLinks[i], function(error, response, body) {
           if(error) { console.log("Error: " + error) }
          //  console.log("Status code: " + response.statusCode);
           if(response.statusCode === 200) {
              var $ = cheerio.load(body);
              var summary, time, location, desciption;
              summary = $('.dhy_cz_one.dhy_dfq > h3').text();
              var timeAndLocationEls = $('.dhy_zlx.dhy_zlx_two > dd');
              timeAndLocationEls.each(function(i) {
                if (i === 0) time = formatTime($(this).text());
                if (i === 1) location = $(this).text().slice(4);
              })
              var desciption = $('.dhy_ysj_jj > dd').text();
              var exhibit = new Exhibit(summary, time, location, desciption);
              exhibits.push(exhibit);

              var calendar = google.calendar('v3');

              calendar.events.insert({
                auth: auth,
                calendarId: '8nu9f3gj4j8lfqc5qb5g91289o@group.calendar.google.com',
                resource: exhibit,
              }, function(err, event) {
                if (err) {
                  console.log('There was an error contacting the Calendar service: ' + err);
                  return;
                }
                console.log('Event created: %s', event.htmlLink);
              });
            }
         });
       }
     }
  });


}
