// import * as crypto from 'crypto';
import { App, Aws, Stack, StackProps, CfnOutput, Fn } from 'aws-cdk-lib';
// import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from 'aws-cdk-lib/custom-resources';
import { AdDecisionServer } from 'awscdk-construct-ad-decision-server';
import { FilePublisher } from 'awscdk-construct-file-publisher';
import { LiveChannelFromMp4 } from 'awscdk-construct-live-channel-from-mp4-file';
import { ScteScheduler } from 'awscdk-construct-scte-scheduler';
import { MediaTailorWithCloudFront } from 'awscdk-mediatailor-cloudfront-construct';
import { Construct } from 'constructs';
import { PrefetchScheduler } from './PrefetchScheduler';
import { SessionRunner } from './SessionRunner';

const baseTime = new Date();
const EVENT_START_DELAY_IN_MINUTES = 15;
const EVENT_DURATION = 20;
const eventStartTime = new Date(baseTime.getTime() + EVENT_START_DELAY_IN_MINUTES * 60 * 1000);
const eventEndTime = new Date(baseTime.getTime() + (EVENT_START_DELAY_IN_MINUTES + EVENT_DURATION) * 60 * 1000);
const audienceGraph = [
  { pointInSeconds: 0 * 60, sessionVolume: 10 },
  { pointInSeconds: 3 * 60, sessionVolume: 25 },
  { pointInSeconds: 6 * 60, sessionVolume: 40 },
  { pointInSeconds: 9 * 60, sessionVolume: 50 },
  { pointInSeconds: 12 * 60, sessionVolume: 50 },
  { pointInSeconds: 15 * 60, sessionVolume: 40 },
  { pointInSeconds: 18 * 60, sessionVolume: 20 },
  { pointInSeconds: 20 * 60, sessionVolume: 10 },
];

const AVAIL_DURATION = 60;

export class MyStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    // Upload all the files in the local folder (./upload) to S3
    const publicFolder = new FilePublisher(this, 'FilePublisher', {
      path: './upload',
    });

    // Deploy a MediaLive channel and a MediaPackage channel/endpoints
    const { eml, empv1: emp } = new LiveChannelFromMp4(this, 'LiveChannelFromMp4', {
      source: `${publicFolder.url}/dog.mp4`,
      encoderSpec: {
        timecodeBurninPrefix: 'Ch1',
      },
      mediaPackageVersionSpec: 'V1_ONLY',
      packagerSpec: {
        startoverWindowSeconds: 300,
      },
    });

    if (!emp?.endpoints.hls) {
      return;
    }

    // Schedule a 60-sec ad break every 2 minutes
    new ScteScheduler(this, 'ScteScheduler1', {
      channelId: eml.channel.ref,
      scteDurationInSeconds: AVAIL_DURATION,
      intervalInMinutes: 6,
      repeatCount: 3,
      cronOptions: {
        year: `${eventStartTime.getUTCFullYear()}`,
        month: `${eventStartTime.getUTCMonth() + 1}`,
        day: `${eventStartTime.getUTCDate()}`,
        hour: `${eventStartTime.getUTCHours()}`,
        minute: `${eventStartTime.getUTCMinutes()}`,
      },
    });

    // Deploy an Ad Decision Server (ADS) that returns a 60-sec creative
    const ads = new AdDecisionServer(this, 'AdDecisionServer', {
      creatives: [
        {
          duration: 60,
          url: `${publicFolder.url}/60sec.mp4`,
          delivery: 'progressive',
          mimeType: 'video/mp4',
          width: 1280,
          height: 720,
        },
      ],
      clearanceRule: 'SEQUENCIAL', // Specify how ADS clear inventory: LONGEST_FIRST (defalut) or SEQUENCIAL
    });

    const adDecisionServerUrl = `${ads.url}?duration=[session.avail_duration_secs]&session=[session.uuid]`;

    // Deploy a MediaTailor config
    const { emt /*cf*/ } = new MediaTailorWithCloudFront(this, 'MediaTailorWithCloudFront', {
      videoContentSourceUrl: emp.endpoints.hls.attrUrl,
      adDecisionServerUrl,
      slateAdUrl: `${publicFolder.url}/slate-1sec.mp4`,
      skipCloudFront: true,
    });

    if (!emt /*|| !cf*/) {
      return;
    }

    const arr = Fn.split('/', emp.endpoints.hls.attrUrl);
    const sessionInitializationUrl = `${emt.config.attrSessionInitializationEndpointPrefix}${Fn.select(5, arr)}/${Fn.select(6, arr)}`;

    // Create a session runner
    new SessionRunner(this, 'SessionRunner', {
      eventStartTime,
      eventEndTime,
      intervalInSeconds: 2,
      sessionRequirements: {
        growthPattern: 'LINEAR',
        graph: audienceGraph,
      },
      sessionInitializationUrl,
      hostName: '', // cf.distribution.distributionDomainName,
      concurrency: 10,
    });

    // Create a prefetch scheduler
    new PrefetchScheduler(this, 'PrefetchScheduler', {
      playbackConfigurationName: emt.config.name,
      eventStartTime,
      eventEndTime,
      intervalInSeconds: 2,
      retrievalWindowLengthInSeconds: 120,
      sessionInitializationUrl,
      hostName: '', // cf.distribution.distributionDomainName,
    });

    // Print event start time
    new CfnOutput(this, 'EventStartTime', {
      value: eventStartTime.toISOString(),
      exportName: Aws.STACK_NAME + 'EventStartTime',
      description: 'Event start time',
    });

    // Print event end time
    new CfnOutput(this, 'EventEndTime', {
      value: eventEndTime.toISOString(),
      exportName: Aws.STACK_NAME + 'EventEndTime',
      description: 'Event end time',
    });

    // Print MediaTailor playback config name
    new CfnOutput(this, 'MediaTailorConfigName', {
      value: emt.config.name,
      exportName: Aws.STACK_NAME + 'MediaTailorConfigName',
      description: 'MediaTailor playback config name',
    });

    // Print CloudFront distribution's domain name
    /*
    new CfnOutput(this, 'CloudFrontDomainName', {
      value: `https://${cf.distribution.distributionDomainName}`,
      exportName: Aws.STACK_NAME + 'CloudFrontDomainName',
      description: 'CloudFront domain name',
    });
    */
  }
}

// for development, use account/region from cdk cli
const devEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const app = new App();

new MyStack(app, 'awscdk-app-mediatailor-prefetch-demo-dev', { env: devEnv });
// new MyStack(app, 'awscdk-app-mediatailor-prefetch-demo-prod', { env: prodEnv });

app.synth();
