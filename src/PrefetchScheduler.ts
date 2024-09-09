import { Duration } from 'aws-cdk-lib';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { Pass, StateMachine, Wait, WaitTime, Chain, Choice, Condition, Succeed, DefinitionBody } from 'aws-cdk-lib/aws-stepfunctions';
import { LambdaInvoke } from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';
import { EventBridgeSchedule } from './EventBridgeSchedule';
import { PrefetchLambda } from './PrefetchLambda';

const SHIFT_IN_SECONDS = 1;

export interface PrefetchSchedulerProps {
  readonly playbackConfigurationName: string; // Playback Configuration Name
  readonly eventStartTime: Date;
  readonly eventEndTime: Date;
  readonly intervalInSeconds: number;
  readonly retrievalWindowLengthInSeconds: number;
  readonly sessionInitializationUrl: string;
  readonly hostName?: string;
  readonly indexOfRenditions?: number;
}

export class PrefetchScheduler extends Construct {
  public rule: Rule;

  constructor(scope: Construct, id: string, {
    playbackConfigurationName,
    eventStartTime,
    eventEndTime,
    intervalInSeconds,
    retrievalWindowLengthInSeconds,
    sessionInitializationUrl,
    hostName = '',
    indexOfRenditions = 0,
  }: PrefetchSchedulerProps) {
    super(scope, id);

    // Create Lambda function to call MediaTailor prefetch API
    const prefetchLambda = new PrefetchLambda(this, 'PrefetchLambdaFunction', {
      playbackConfigurationName,
      sessionInitializationUrl,
      hostName,
      indexOfRenditions,
      retrievalWindowLengthInSeconds,
      eventEndTime,
    });
    const invoke = new LambdaInvoke(this, 'Invoke MediaTailor prefetch API', {
      lambdaFunction: prefetchLambda.func,
      inputPath: '$.Payload',
    });

    const prepare = new Wait(this, 'Prepare', {
      time: WaitTime.duration(Duration.seconds(SHIFT_IN_SECONDS)),
    });

    const wait = new Wait(this, 'Wait', {
      time: WaitTime.duration(Duration.seconds(intervalInSeconds)),
    });

    // Create a StateMachine that calls MediaTailor prefetch API
    const stateMachine = new StateMachine(this, 'StateMachine', {
      definitionBody: DefinitionBody.fromChainable(Chain.start(
        new Pass(this, 'Start', { parameters: { Payload: { prefetchList: [] } } }),
      )
        .next(prepare)
        .next(wait)
        .next(invoke)
        .next(
          new Choice(this, 'Choice')
            .when(
              Condition.timestampLessThan('$.Payload.timestamp', eventEndTime.toISOString()),
              wait,
            )
            .otherwise(new Succeed(this, 'Done')),
        )),
    });
      // Create an EventBridge rule to invoke the lambda function
    const fetchSchedule = new EventBridgeSchedule(this, 'EventBridgeSchedule', {
      target: stateMachine,
      schedule: Schedule.cron({
        year: `${eventStartTime.getUTCFullYear()}`,
        month: `${eventStartTime.getUTCMonth() + 1}`,
        day: `${eventStartTime.getUTCDate()}`,
        hour: `${eventStartTime.getUTCHours()}`,
        minute: `${eventStartTime.getUTCMinutes()}`,
      }),
    });
    this.rule = fetchSchedule.rule;
  }
}
