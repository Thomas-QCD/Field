import * as cdk from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";

/** Existing field-dev RDS master secret (JSON key: password). */
const RDS_SECRET_ARN =
  "arn:aws:secretsmanager:us-west-1:730335210534:secret:rds!db-01f1889d-8922-4311-88c5-3c3f4ffb540b-7lxFSw";

const ATTACHMENTS_BUCKET = "field-dev-attachments";
/** field-dev-db-sg in the us-west-1 default VPC. */
const RDS_SECURITY_GROUP_ID = "sg-047c106a0f501684d";

/**
 * Staging stack: one CloudFront URL for SPA (S3) + /api (ALB → Fargate).
 * Reuses field-dev RDS, attachments bucket, and SES. No custom DNS.
 */
export class FieldStagingStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = ec2.Vpc.fromLookup(this, "DefaultVpc", { isDefault: true });

    // --- Static web ---
    const webBucket = new s3.Bucket(this, "WebBucket", {
      bucketName: `field-staging-web-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // --- API networking ---
    const albSg = new ec2.SecurityGroup(this, "AlbSg", {
      vpc,
      description: "Field staging ALB - CloudFront only",
      allowAllOutbound: true,
    });

    const cloudFrontPrefixList = ec2.PrefixList.fromLookup(
      this,
      "CloudFrontOriginFacing",
      { prefixListName: "com.amazonaws.global.cloudfront.origin-facing" },
    );
    albSg.addIngressRule(
      ec2.Peer.prefixList(cloudFrontPrefixList.prefixListId),
      ec2.Port.tcp(80),
      "CloudFront origin-facing prefix list",
    );

    const taskSg = new ec2.SecurityGroup(this, "TaskSg", {
      vpc,
      description: "Field staging ECS tasks",
      allowAllOutbound: true,
    });
    taskSg.addIngressRule(albSg, ec2.Port.tcp(3000), "ALB to API");

    const rdsSg = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      "RdsSg",
      RDS_SECURITY_GROUP_ID,
      { mutable: true },
    );
    rdsSg.addIngressRule(
      taskSg,
      ec2.Port.tcp(5432),
      "Field staging ECS to field-dev RDS",
    );

    const alb = new elbv2.ApplicationLoadBalancer(this, "Alb", {
      vpc,
      internetFacing: true,
      securityGroup: albSg,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    const listener = alb.addListener("Http", {
      port: 80,
      open: false,
      defaultAction: elbv2.ListenerAction.fixedResponse(404, {
        contentType: "text/plain",
        messageBody: "Not Found",
      }),
    });

    // --- ECR + ECS ---
    const repo = new ecr.Repository(this, "ApiRepo", {
      repositoryName: "field-staging-api",
      imageScanOnPush: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: true,
    });

    const cluster = new ecs.Cluster(this, "Cluster", {
      vpc,
      clusterName: "field-staging",
    });

    const taskRole = new iam.Role(this, "TaskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      description: "Field staging API task role",
    });
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
        resources: [`arn:aws:s3:::${ATTACHMENTS_BUCKET}/*`],
      }),
    );
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["s3:ListBucket"],
        resources: [`arn:aws:s3:::${ATTACHMENTS_BUCKET}`],
      }),
    );
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ses:SendEmail", "ses:SendRawEmail"],
        resources: ["*"],
      }),
    );

    const executionRole = new iam.Role(this, "ExecutionRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AmazonECSTaskExecutionRolePolicy",
        ),
      ],
    });
    executionRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["secretsmanager:GetSecretValue"],
        resources: [RDS_SECRET_ARN, `${RDS_SECRET_ARN}-*`],
      }),
    );
    executionRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetParameters", "ssm:GetParameter"],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/field/staging/azure-client-id`,
          `arn:aws:ssm:${this.region}:${this.account}:parameter/field/staging/azure-tenant-id`,
        ],
      }),
    );

    const logGroup = new logs.LogGroup(this, "ApiLogs", {
      logGroupName: "/field/staging/api",
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const taskDef = new ecs.FargateTaskDefinition(this, "TaskDef", {
      memoryLimitMiB: 512,
      cpu: 256,
      taskRole,
      executionRole,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    });

    const container = taskDef.addContainer("api", {
      // Push a real image with `npm run api:staging` before scaling the service to 1.
      image: ecs.ContainerImage.fromEcrRepository(repo, "latest"),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "api",
        logGroup,
      }),
      environment: {
        NODE_ENV: "production",
        API_PORT: "3000",
        AWS_REGION: this.region,
        S3_BUCKET: ATTACHMENTS_BUCKET,
        EMAIL_PROVIDER: "ses",
        EMAIL_FROM: "noreply@qcdlv.net",
        EMAIL_CONFIGURATION_SET: "notify_on_error",
      },
      secrets: {
        // RDS-managed secret JSON key "password" → PGPASSWORD (see server/db.mjs).
        PGPASSWORD: ecs.Secret.fromSecretsManager(
          secretsmanager.Secret.fromSecretCompleteArn(
            this,
            "RdsSecret",
            RDS_SECRET_ARN,
          ),
          "password",
        ),
        // Same app registration as VITE_AZURE_* (baked into the SPA at web:staging build).
        AZURE_CLIENT_ID: ecs.Secret.fromSsmParameter(
          ssm.StringParameter.fromStringParameterName(
            this,
            "AzureClientIdParam",
            "/field/staging/azure-client-id",
          ),
        ),
        AZURE_TENANT_ID: ecs.Secret.fromSsmParameter(
          ssm.StringParameter.fromStringParameterName(
            this,
            "AzureTenantIdParam",
            "/field/staging/azure-tenant-id",
          ),
        ),
      },
      healthCheck: {
        command: [
          "CMD-SHELL",
          "node -e \"fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\"",
        ],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(20),
      },
    });
    container.addPortMappings({ containerPort: 3000, protocol: ecs.Protocol.TCP });

    const service = new ecs.FargateService(this, "Service", {
      cluster,
      serviceName: "field-staging-api",
      taskDefinition: taskDef,
      desiredCount: 1,
      assignPublicIp: true,
      securityGroups: [taskSg],
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      circuitBreaker: { rollback: true },
      minHealthyPercent: 0,
      maxHealthyPercent: 200,
      healthCheckGracePeriod: cdk.Duration.seconds(60),
    });

    const targetGroup = new elbv2.ApplicationTargetGroup(this, "ApiTg", {
      vpc,
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: "/api/health",
        healthyHttpCodes: "200",
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
      deregistrationDelay: cdk.Duration.seconds(30),
    });
    service.attachToApplicationTargetGroup(targetGroup);

    listener.addTargetGroups("ApiForward", {
      priority: 10,
      conditions: [elbv2.ListenerCondition.pathPatterns(["/api", "/api/*"])],
      targetGroups: [targetGroup],
    });

    // --- CloudFront: SPA + /api ---
    const spaRewrite = new cloudfront.Function(this, "SpaRewrite", {
      comment: "Rewrite non-file SPA routes to /index.html; leave /api alone",
      code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri.indexOf('/api') === 0) {
    return request;
  }
  if (uri.indexOf('.') !== -1) {
    return request;
  }
  if (uri !== '/' && !uri.endsWith('/')) {
    request.uri = '/index.html';
  } else if (uri.endsWith('/') && uri !== '/') {
    request.uri = '/index.html';
  }
  return request;
}
`),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });

    const s3Origin = origins.S3BucketOrigin.withOriginAccessControl(webBucket);
    const apiOrigin = new origins.LoadBalancerV2Origin(alb, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
      httpPort: 80,
      readTimeout: cdk.Duration.seconds(60),
      keepaliveTimeout: cdk.Duration.seconds(5),
    });

    const distribution = new cloudfront.Distribution(this, "Distribution", {
      comment: "Field staging (generic *.cloudfront.net URL)",
      defaultRootObject: "index.html",
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      defaultBehavior: {
        origin: s3Origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        compress: true,
        functionAssociations: [
          {
            function: spaRewrite,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
      additionalBehaviors: {
        "/api": {
          origin: apiOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy:
            cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          compress: true,
        },
        "/api/*": {
          origin: apiOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy:
            cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          compress: true,
        },
      },
    });

    const stagingUrl = `https://${distribution.distributionDomainName}`;

    new cdk.CfnOutput(this, "StagingUrl", { value: stagingUrl });
    new cdk.CfnOutput(this, "DistributionId", {
      value: distribution.distributionId,
    });
    new cdk.CfnOutput(this, "WebBucketName", { value: webBucket.bucketName });
    new cdk.CfnOutput(this, "EcrRepositoryUri", { value: repo.repositoryUri });
    new cdk.CfnOutput(this, "ClusterName", { value: cluster.clusterName });
    new cdk.CfnOutput(this, "ServiceName", { value: service.serviceName });
    new cdk.CfnOutput(this, "AlbDnsName", { value: alb.loadBalancerDnsName });

    new ssm.StringParameter(this, "ParamUrl", {
      parameterName: "/field/staging/url",
      stringValue: stagingUrl,
    });
    new ssm.StringParameter(this, "ParamDistId", {
      parameterName: "/field/staging/distribution-id",
      stringValue: distribution.distributionId,
    });
    new ssm.StringParameter(this, "ParamWebBucket", {
      parameterName: "/field/staging/web-bucket",
      stringValue: webBucket.bucketName,
    });
    new ssm.StringParameter(this, "ParamEcrUri", {
      parameterName: "/field/staging/ecr-uri",
      stringValue: repo.repositoryUri,
    });
    new ssm.StringParameter(this, "ParamCluster", {
      parameterName: "/field/staging/cluster-name",
      stringValue: cluster.clusterName,
    });
    new ssm.StringParameter(this, "ParamService", {
      parameterName: "/field/staging/service-name",
      stringValue: service.serviceName,
    });
  }
}
