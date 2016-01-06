# compatipede

To run conductor which will send jobs to jannah execut ```bin/conductor```

There is no frontend to add new jobs, they can be added only manually

```bash
$ curl -H 'Content-Type: application/json' \
    -X POST http://127.0.0.1:5984/compatipede-adhoc-runs \
    -d '{
      "status": "new",
      "jobDetails" : {
        "engine" : "webkit",
        "targetURI" : "https://google.com",
        "screenSize" : {
          "width" : 1024,
          "height" : 1024
        },
        "userAgent" : "test user agent"
      }
    }'
```
