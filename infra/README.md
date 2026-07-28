# Field infra (CDK)

Staging stack for a generic CloudFront URL. See [`docs/staging.md`](../docs/staging.md).

```bash
npm install
npx cdk synth    # template only; lookups need AWS creds in us-west-1
npx cdk deploy   # creates AWS resources — only when explicitly approved
```

Region is fixed to **us-west-1** (matches field-dev).
