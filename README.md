# awscdk-app-mediatailor-prefetch-demo

AWS CDK app for deploying a MediaTailor live channel, creating playback sessions, and creating prefetch schedules

## Install
1. Setup [CDK](https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html) environment (including Node.js)

2. Install this CDK app
```
$ git clone https://github.com/kuu/awscdk-app-mediatailor-prefetch-demo.git
$ cd awscdk-app-mediatailor-prefetch-demo
$ npm i
```

## Deploy
```
$ npx cdk deploy
```
The following resources will be deployed:
* MediaLive channel
* MediaPackage channel and endpoints
* MediaTailor configuration
* S3 bucket (for storing MP4 files)
* CloudFront distribution (for making a private S3 bucket accessible)
* API Gateway REST API and Lambda functions (for serving ADS)
* Lambda functions and StepFunctions state machines (for creating MediaTailor playback sessions, inserting ad markers, and creating prefetch schedules)
* EventBridge rules (to schedule the invokation of the lambda functions)

## Cleanup
```
$ npx cdk destroy
```
