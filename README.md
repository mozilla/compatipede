# Compatipede

To run conductor which will send jobs to jannah execute ```bin/conductor```
To run serial conductor that will fetch github issues and also create jobs run ```bin\compatipede```

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
