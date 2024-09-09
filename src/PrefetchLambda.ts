import * as fs from 'fs';
import * as path from 'path';
import { Duration, aws_logs as logs } from 'aws-cdk-lib';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';

export interface PrefetchLambdaProps {
  readonly playbackConfigurationName: string; // Playback Configuration Name
  readonly sessionInitializationUrl: string; // Sessuib Initialization URL
  readonly hostName: string; // Host name of the MediaTailor endpoint
  readonly indexOfRenditions: number; // N-th rendition to fetch
  readonly retrievalWindowLengthInSeconds: number; // Length of the retrieval window in seconds
  readonly eventEndTime: Date; // Start time of the event
}

export class PrefetchLambda extends Construct {
  public readonly func: NodejsFunction;

  constructor(scope: Construct, id: string, {
    playbackConfigurationName,
    sessionInitializationUrl,
    hostName,
    indexOfRenditions,
    retrievalWindowLengthInSeconds,
    eventEndTime,
  }: PrefetchLambdaProps) {
    super(scope, id);

    const TS_ENTRY = path.resolve(__dirname, 'prefetch', 'index.ts');
    const JS_ENTRY = path.resolve(__dirname, 'prefetch', 'index.js');

    this.func = new NodejsFunction(scope, `NodejsFunction${id}`, {
      runtime: Runtime.NODEJS_18_X,
      entry: fs.existsSync(TS_ENTRY) ? TS_ENTRY : JS_ENTRY,
      handler: 'handler',
      timeout: Duration.seconds(30),
      environment: {
        NODE_ENV: process.env.NODE_ENV as string,
        REGION: process.env.CDK_DEFAULT_REGION as string,
        PLAYBACK_CONFIGURATION_NAME: playbackConfigurationName,
        SESSION_INITIALIZATION_URL: sessionInitializationUrl,
        HOST_NAME: hostName,
        INDEX_OF_RENDITIONS: indexOfRenditions.toString(10),
        RETRIEVAL_WINDOW_LENGTH_IN_SECONDS: retrievalWindowLengthInSeconds.toString(10),
        EVENT_END_TIME: eventEndTime.toISOString(),
      },
      logRetention: logs.RetentionDays.TWO_WEEKS,
    });
    this.func.addToRolePolicy(
      PolicyStatement.fromJson({
        Effect: 'Allow',
        Action: 'mediatailor:*',
        Resource: '*',
      }),
    );
  }
}