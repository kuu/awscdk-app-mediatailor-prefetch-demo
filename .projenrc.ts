import { awscdk } from 'projen';
const project = new awscdk.AwsCdkTypeScriptApp({
  cdkVersion: '2.154.1',
  defaultReleaseBranch: 'main',
  name: 'awscdk-app-mediatailor-prefetch-demo',
  projenrcTs: true,
  keywords: [
    'cdk',
    'cdk-app',
    'MediaTailor',
  ],
  license: 'MIT',
  licensed: true,
  copyrightOwner: 'Kuu Miyazaki',
  deps: [
    '@aws-sdk/client-mediatailor',
    'aws-cdk-lib',
    'constructs',
    'awscdk-construct-file-publisher',
    'awscdk-construct-live-channel-from-mp4-file',
    'awscdk-construct-scte-scheduler',
    'awscdk-construct-ad-decision-server',
    'awscdk-mediatailor-cloudfront-construct',
    'hls-parser',
    'node-fetch',
  ],
  description: 'AWC CDK app for MediaTailor prefetch demo',
  // devDeps: [],             /* Build dependencies for this module. */
  // packageName: undefined,  /* The "name" in package.json. */
});
project.synth();