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

  campaignModel.once('ready', issueFetchAndAdd.bind(null, 1, callback));
};

function issueFetchAndAdd(page, callback) {
  page = page || 1;

  github.issues.repoIssues({
    user : 'webcompat',
    repo : 'web-bugs',
    state : 'open',
    per_page : 1,
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
        callback();
        // issueFetchAndAdd(page + 1, callback);
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

  let githubIssue = {
      id        : issue.id,
      number    : issue.number,
      issueUrl  : issue.html_url,
      url       : pageUrl,
      userAgent : agentString,
      forMobile : issue.labels.some((label) => {
        return label.name === 'browser-firefox-mobile';
      }),
      engine : engine
    };

  campaignModel.addFromGithub(githubIssue, callback);
}

//for cradle, otherwise process will exit
setInterval(()=>{}, 1000000);
