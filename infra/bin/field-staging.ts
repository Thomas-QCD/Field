#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { FieldStagingStack } from "../lib/field-staging-stack";

const app = new cdk.App();

new FieldStagingStack(app, "FieldStaging", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT ?? "730335210534",
    // field-dev RDS/S3/SES live in us-west-1 — do not follow a mismatched default region.
    region: "us-west-1",
  },
  description:
    "Field staging: CloudFront (generic URL) + S3 web + ECS Fargate API (reuses field-dev RDS/S3/SES)",
});
