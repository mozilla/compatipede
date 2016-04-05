"""
This will process a plain text or JSON-formatted list of URLs
and submit them to Compatipede's CouchDB
"""

import argparse
import couchdb
import json
import os
import re
import requests
import tldextract

from datetime import datetime

class UniqueListAction(argparse.Action):
    # We want arguments that take a list of unique values, i.e. platform=['webkit', 'gecko']
    # Without this class, the arguments parser would sometimes append existing values to the list
    def __call__(self, parser, namespace, values, option_string=None):
        current =  getattr(namespace, self.dest)
        if not current:
            current = []
        if values not in current:
            current.append(values)
            setattr(namespace, self.dest, current)

parser = argparse.ArgumentParser(description=("Go through a list of URLs from a file, add them to Compatipede's database"))

parser.add_argument("--couchdbUser", dest='dbuser', type=str, help="User name for CouchDB", required=True)
parser.add_argument("--couchdbPassword", dest='dbpass', type=str, help="CouchDB password", required=True)
parser.add_argument("--couchdbHost", dest='dbhost', type=str, help="CouchDB server name", default="localhost")
parser.add_argument("--couchdbPort", dest='dbport', type=int, help="CouchDB port", default=5984)
parser.add_argument("--couchdbDB", dest='database', type=str, help="CouchDB database for campaign", default='compatipede-extra-campaigns')
parser.add_argument("--couchdbJobsDB", dest='jobsdatabase', type=str, help="CouchDB database for generated jobs", default='compatipede-extra-jobs')
parser.add_argument("--engine", dest="engines", type=str, action=UniqueListAction, help="Which rendering engine(s) to test", choices=["gecko", "webkit"], default=["gecko"])
parser.add_argument("--platform", dest="platforms", type=str, action=UniqueListAction, help="Which type of platform the issue is tested on", choices=["mobile", "desktop", "tablet"], default=["mobile"])
parser.add_argument("--tag", dest="tags", type=str, action="append", help="""One or more tags classifying site according to locale and popularity. 
  The name of the imported file will be added as a tag automatically""")
parser.add_argument("--ua", dest="uas", type=str, action=UniqueListAction, help="Which User-Agent string(s) to send", default=["Mozilla/5.0 (Android 5.0; Mobile; rv:40.0) Gecko/40.0 Firefox/40.0"])
parser.add_argument("file", type=str, help="A file or URL containing a plain text or JSON list of URLs to process")

args = vars(parser.parse_args())

print(args)

# Using this Rx for splitting lines should normalize
# and remove Windows and *nix line endings
newlinerx = re.compile('\r?\n')

server = couchdb.client.Server(url='http://%s:%s@%s:%i' % (args['dbuser'], args['dbpass'], args['dbhost'], args['dbport']))

if os.path.isfile(args['file']):
    # get data from file
    with open(args['file'], 'r') as f:
        if 'json' in args['file']:
            urllist = json.load(f)
            if 'data' in urllist: # AWCY JSON files have {data:[ ... ], cctTLD: ""}
                urllist = urllist['data']
        else:
            urllist = newlinerx.split(f.read())
else: # Perhaps this is a URL?
    if args['file'].startswith('http://') or args['file'].startswith('https://'):
        req = requests.get(args['file'])
        if args['file'].endswith('.json'):
            urllist = json.loads(req.text)
            if 'data' in urllist: # AWCY JSON files have {data:[ ... ], cctTLD: ""}
                urllist = urllist['data']
        else:
            urllist = newlinerx.split(req.text)
    else:
        raise ValueError('Check the file/url argument, no such data source found')

# Add file name (no extension) to tags
filename = os.path.splitext(os.path.basename(args['file']))[0]
tags = getattr(args, 'tags', [])
if filename not in tags:
    tags.append(filename)

# We've got the data. Time to go through the list..
urlcount = 0;
jobcount = 0;

if args['database'] not in server:
    server.create(args['database'])
    server[args['database']]['_design/campaigns'] = { 
        "views": {
            "byStatus" : {
                "map" : "function(doc) {\n    if(doc.status) {\n        emit(doc.status, doc);\n    }\n}"
            },
            "openCampaignsByLastRun" : {
                "map" : "function(doc) {\n    if(doc.status === 'open' && doc.runStatus !== 'running') {\n        emit(doc.lastRun || 0, doc);\n    }\n}"
            },
            "byDomain": {
              "map" : "function(doc) {\n              emit(doc.details.domain, doc);\n            }\n          }"
            },
           "listDomains": {
               "map": "function (doc) {\n            emit(doc.details.domain, null);\n          }",
               "reduce": "function (key, values) {\n            return null;\n          }"
           }
        }
    }

db = server[args['database']]

if args['jobsdatabase'] not in server:
    jdb = server.create(args['jobsdatabase'])

    jdb['_design/jannahJobs'] = {
      "views": {
        "newJobs": {  # for fetching jobs with status new
          "map" : "function(doc) {\n            if(doc.status === 'new') {\n              emit(doc.status, doc);\n            }\n          }"
        },
        "completedJobs" : {
          "map" : "function(doc) {\n            if(doc.status === 'completed') {\n              emit(doc.status, doc);\n            }\n          }"
        },
        "failedJobs" : {
          "map" : "function(doc) {\n            if(doc.status === 'failed') {\n              emit(doc.status, doc);\n            }\n          }"
        },
        "byCampaign" : {
          "map" : "function(doc) {\n            if(doc.jobId) {\n              emit([doc.jobId, doc.runNumber], doc);\n            }\n          }"
        },
        "byCampaignDocId" : {
          "map" : "function(doc) {\n            if(doc.jobId) {\n              emit([doc.jobId, doc.runNumber], doc._id);\n            }\n          }"
        },
        "byDomain": {
          "map" : "function(doc) {\n              emit(doc.jobDetails.domain, doc);\n            }\n          }"
        },
        "listDomains": {
           "map": "function (doc) {\n            emit(doc.details.domain, null);\n          }",
           "reduce": "function (key, values) {\n            return null;\n          }"
        }
      },
      "filters" : {
        "newJobs" : "function(doc) { //for _change listener\n          return doc.status === 'new';\n        }"
      }
    }



for url in urllist:
    urlcount += 1
    if '://' not in url:
        url = 'http://%s' % url
    # How do we know if there is already an entry for this URL?
    # We'll push to the temporary ad-hoc jobs database, so we don't care much
    # Maybe later we need to actually implement a check
    # Big question: how do we generate the ID? Domain?
    # 
    parts = tldextract.extract(url)
    if parts.domain == '' or parts.domain == 'www':
        domain = parts.suffix
    else:
        domain = '.'.join(parts[1:3])

    # So, we're ready to gather up the data to post it to the db:
    for platform in args['platforms']:
        couchdoc = {
           "_id": ("%s-%s-%s-%i" % (domain, filename, platform, urlcount)).lower(),
           "autoTestable": True,
           "autoTests": [],
           "status": "open",
           "created": datetime.isoformat(datetime.now()),
           "details": {
               "targetURI": url,
               "type": platform,
               "domain": domain,
               "tags": tags,
               "userAgents": args['uas'],
               "engines": args['engines'],
           },
           "from": args['file'],
           "runCount": 0,
           "processId": 5001,
           "lastRun": 0,
           "runStatus": ""
        }
        # print(couchdoc)
        print(domain);
        db[couchdoc['_id']] = couchdoc;
        jobcount += 1

                
print('Done. Created %i Compatipede campaigns from %i URLs' % (jobcount, urlcount))
