import * as cdk from 'aws-cdk-lib'
import * as sqs from 'aws-cdk-lib/aws-sqs'
import { Construct } from 'constructs'

export class TicketQueueStack extends cdk.Stack {
  constructor(scope: Construct, id: string, env: string, props?: cdk.StackProps) {
    super(scope, id, props)

    const dlq = new sqs.Queue(this, 'TicketDLQ', {
      queueName: `${env}-tickets-dlq`,
      retentionPeriod: cdk.Duration.days(14),
    })

    new sqs.Queue(this, 'TicketQueue', {
      queueName: `${env}-tickets-queue`,
      deadLetterQueue: {
        queue: dlq,
        maxReceiveCount: 4,
      },
      visibilityTimeout: cdk.Duration.seconds(30),
    })

    new cdk.CfnOutput(this, 'QueueUrl', {
      value: `https://sqs.${this.region}.amazonaws.com/${this.account}/${env}-tickets-queue`,
      description: 'SQS_QUEUE_URL — add to .env',
    })

    new cdk.CfnOutput(this, 'DLQUrl', {
      value: `https://sqs.${this.region}.amazonaws.com/${this.account}/${env}-tickets-dlq`,
      description: 'SQS_DLQ_URL — add to .env (optional)',
    })
  }
}
