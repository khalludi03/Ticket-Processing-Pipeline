#!/bin/bash
awslocal sqs create-queue --queue-name dev-tickets-queue
awslocal sqs create-queue --queue-name dev-tickets-dlq
