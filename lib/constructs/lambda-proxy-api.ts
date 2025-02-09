/*
Proxy API construct that sets up
the required access for the API and lambda handler as well
as implementation of CORS override so that a lambda error is
gracefully handled by the proxy API
*/

import {
  AccessLogFormat,
  AuthorizationType,
  LambdaIntegration,
  LambdaRestApi,
  LogGroupLogDestination,
} from "aws-cdk-lib/aws-apigateway";
import { Effect, IRole, PolicyStatement, Role } from "aws-cdk-lib/aws-iam";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import { BuildConfig } from "../build/buildConfig";

function name(buildConfig: BuildConfig, resourcename: string): string {
  return buildConfig.Environment + "-" + resourcename;
}

export interface LambdaProxyAPIProps {
  apiNameKey: string;
  apiResourceName: string;
  proxyfunction: NodejsFunction;
  apiCallerRoleArn: string;
  methodtype: string;
  apiEndPointReaderAccountID: string;
}

export class LambdaProxyAPI extends Construct {
  public readonly lambdaProxyAPILogGroup: LogGroup;
  public readonly lambdaProxyAPI: LambdaRestApi;
  public readonly lambdaProxyAPIRole: IRole;

  constructor(
    scope: Construct,
    id: string,
    buildConfig: BuildConfig,
    lambdaProxyAPIProps: LambdaProxyAPIProps
  ) {
    super(scope, id);

    this.lambdaProxyAPILogGroup = new LogGroup(
      this,
      name(buildConfig, `${lambdaProxyAPIProps.apiNameKey}-logGroup`),
      {
        retention: RetentionDays.ONE_MONTH,
      }
    );

    this.lambdaProxyAPI = new LambdaRestApi(
      this,
      name(buildConfig, lambdaProxyAPIProps.apiNameKey),
      {
        handler: lambdaProxyAPIProps.proxyfunction,
        restApiName: name(buildConfig, lambdaProxyAPIProps.apiNameKey),
        proxy: false,
        deployOptions: {
          accessLogDestination: new LogGroupLogDestination(
            this.lambdaProxyAPILogGroup
          ),
          accessLogFormat: AccessLogFormat.jsonWithStandardFields(),
        },
      }
    );

    new CfnOutput(
      this,
      name(buildConfig, `${lambdaProxyAPIProps.apiNameKey}-endpointURL`),
      {
        exportName: name(
          buildConfig,
          `${lambdaProxyAPIProps.apiNameKey}-endpointURL`
        ),
        value: this.lambdaProxyAPI.url,
      }
    );

    const lambdaproxyAPIResource = this.lambdaProxyAPI.root.addResource(
      lambdaProxyAPIProps.apiResourceName
    );

    this.lambdaProxyAPIRole = Role.fromRoleArn(
      this,
      name(buildConfig, "importedPermissionSetRole"),
      lambdaProxyAPIProps.apiCallerRoleArn
    );

    const lambdaProxyAPIIntegration = new LambdaIntegration(
      lambdaProxyAPIProps.proxyfunction
    );

    const lambdaProxyAPIMethod = lambdaproxyAPIResource.addMethod(
      lambdaProxyAPIProps.methodtype,
      lambdaProxyAPIIntegration,
      {
        authorizationType: AuthorizationType.IAM,
      }
    );

    this.lambdaProxyAPIRole.addToPrincipalPolicy(
      new PolicyStatement({
        actions: ["execute-api:Invoke"],
        effect: Effect.ALLOW,
        resources: [lambdaProxyAPIMethod.methodArn],
      })
    );
  }
}
