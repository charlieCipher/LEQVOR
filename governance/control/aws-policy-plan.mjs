import {checkpointBucket} from './s3-checkpoints.mjs';
// Generates public proposals only. No IAM API calls, no wildcard trust subject,
// no retention duration choice, no Compliance policy, no secret generation.
export function prepareCheckpointPermissions({workspaceId,environmentId,serviceId,maxRetentionDays}){
 if(!/^tea-[a-z0-9]+$/.test(workspaceId)||!/^srv-[a-z0-9]+$/.test(serviceId)||!(/^(evm-[a-z0-9]+|default)$/.test(environmentId))||!Number.isInteger(maxRetentionDays)||maxRetentionDays<1||maxRetentionDays>365)throw new Error('Exact reviewed workload identifiers and approved retention bound required.');
 const provider=`oidc.render.com/${workspaceId}`,resource=`arn:aws:s3:::${checkpointBucket}/governance/archives/*`;
 return {
  trust:{Version:'2012-10-17',Statement:[{Effect:'Allow',Principal:{Federated:`arn:aws:iam::533047842985:oidc-provider/${provider}`},Action:'sts:AssumeRoleWithWebIdentity',Condition:{StringEquals:{[`${provider}:aud`]:'sts.amazonaws.com',[`${provider}:sub`]:`workspace:${workspaceId}:environment:${environmentId}:service:${serviceId}`}}}]},
  writer:{Version:'2012-10-17',Statement:[{Effect:'Allow',Action:['s3:PutObject','s3:PutObjectRetention'],Resource:resource,Condition:{StringEquals:{'s3:x-amz-server-side-encryption':'AES256','s3:object-lock-mode':'GOVERNANCE','s3:if-none-match':'*'},NumericLessThanEquals:{'s3:object-lock-remaining-retention-days':maxRetentionDays}}}]},
  verifier:{Version:'2012-10-17',Statement:[{Effect:'Allow',Action:['s3:GetObject','s3:GetObjectVersion','s3:GetObjectRetention'],Resource:resource}]},
  prohibited:['s3:DeleteObject','s3:DeleteObjectVersion','s3:BypassGovernanceRetention','s3:PutBucketPolicy','s3:PutBucketObjectLockConfiguration','iam:*','kms:ScheduleKeyDeletion'],
 };
}
