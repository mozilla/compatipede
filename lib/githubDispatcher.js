"use strict";

let campaignModel,
  url = require('url'),
  net = require('net'),
  async = require('async'),
  logger = require('deelogger')('GithubDispatcher'),
  validUrl = require('valid-url'),
  github = new (require('github'))({
    version  : '3.0.0',
    protocol : 'https'
  }),
  useragent = require('useragent');

module.exports = function(argv, callback) {
  campaignModel = new (require('./models/campaign'))({
      host : argv.couchdbHost,
      port : argv.couchdbPort,
      auth : {
        username : argv.couchdbUser,
        password : argv.couchdbPassword
      }
    }, argv.campaignDb);
  if(argv.syncFromGithub === 'yes'){
    campaignModel.once('ready', issueFetchAndAdd.bind(null, 1, callback));
  }else{
    callback();
  }
};

function issueFetchAndAdd(page, callback) {
  page = page || 1;

  github.issues.repoIssues({
    user : 'webcompat',
    repo : 'web-bugs',
    state : 'open',
    per_page : 100,
    creator : 'webcompat-bot',
    page : page
  }, (error, results) => {
    if(error) {
      logger.error('Failed to fetch page with issues', error);
      return callback(error);
    }

    if(results.length === 0) {
      logger.info('Nothing more to fetch', {
        page : page
      });

      return callback();
    }

    async.map(results, addIssue, (error) => {
      if(error) {
        logger.error('Failed to add job from issue', {
          error : error.message,
          stack : error.stack
        });
      } else {
        logger.debug('Will fetch next page with issues from github', {
          page : page + 1
        });

        issueFetchAndAdd(page + 1, callback);
      }
    });
  });
}

function addIssue(issue, callback) {
  let userAgent = issue.body.match(/.*\@ua_header:(.+)\-\-\>/),
    pageUrl = issue.body.match(/\*\*URL\*\*:(.+)/);

  if(!userAgent) {
    logger.warn('Failed to extract user agent string from issue body', {
      body : issue.body
    });

    return callback();
  }

  if(!pageUrl) {
    logger.warn('Failed to extract url string from issue body', {
      body : issue.body
    });

    return callback();
  }

  pageUrl = pageUrl[1].trim();

  let parsedUrl = url.parse(pageUrl);

  if(!parsedUrl.protocol) {
    pageUrl = 'http://' + pageUrl;
  }

  if(!validUrl.isWebUri(pageUrl)) {
    logger.warn('Extracted url isnt valid', {
      url : pageUrl,
      body : issue.body
    });

    return callback();
  }

  parsedUrl = url.parse(pageUrl);

  //for now ip addresses are ignored as otherwise there needs to be a
  //check to see if ip address is public
  if(net.isIP(parsedUrl.host)) {
    logger.warn('Extracted url is an ip address', {
      url : pageUrl,
      body: issue.body
    });

    return callback();
  }

  let agentString = userAgent[1].trim(),
    engine = (useragent.lookup(agentString).family || '')
      .toLowerCase() === 'firefox' || 'firefox mobile' ? 'gecko' : 'webkit';
  // We want to know if the viewport should be mobile-size or desktop-size
  // Issues that are labelled as reported for a mobile browser or have a UA
  // string containing "Mobile" will be classified as mobile.
  // Note: code makes an implicit assumption that nobody reports a Desktop
  // issue *from* a mobile phone. Reports from a desktop UA are sometimes
  // about mobile issues, while the opposite rarely happens.
  let mobileLabels = ["browser-android", "browser-blackberry", "browser-chrome-mobile",
      "browser-firefox-for-android", "browser-firefox-ios", "browser-firefox-mobile",
      "browser-mobile-safari", "ios", "mobile", "os-android"];
  let mobileIssue = issue.labels.some((label) => {
	return mobileLabels.indexOf(label.name) > -1;
      }) || agentString.indexOf('Mobile') > -1;
  let githubIssue = {
      id        : issue.id,
      number    : issue.number,
      issueUrl  : issue.html_url,
      url       : pageUrl,
      userAgent : agentString,
      forMobile : mobileIssue,
      engine : engine
    };

  campaignModel.addFromGithub(githubIssue, callback);
}

//for cradle, otherwise process will exit
setInterval(()=>{}, 1000000);
