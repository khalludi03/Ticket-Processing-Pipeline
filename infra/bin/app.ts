import * as cdk from 'aws-cdk-lib'
import { TicketQueueStack } from '../lib/ticket-queue-stack'

const app = new cdk.App()
const env = app.node.tryGetContext('env') ?? 'dev'

new TicketQueueStack(app, `TicketQueueStack-${env}`, env)
