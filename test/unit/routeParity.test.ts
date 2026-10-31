import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { openapiRouteAuth, openapiRoutes, templateRouteAuth, templateRoutes } from '../../scripts/routes.js';

const read = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

describe('route parity (design D7)', () => {
  it('deploys exactly the METHOD path pairs that openapi.yaml describes', () => {
    expect(templateRoutes(read('template.yaml'))).toEqual(openapiRoutes(read('openapi.yaml')));
  });

  it('puts the authorizer that openapi.yaml documents on each route', () => {
    expect(templateRouteAuth(read('template.yaml'))).toEqual(openapiRouteAuth(read('openapi.yaml')));
  });

  it('uses the API default authorizer for an event without Auth', () => {
    const template = `Resources:
  Api:
    Type: AWS::Serverless::HttpApi
    Properties: { Auth: { DefaultAuthorizer: ConsumerAuth } }
  Fn:
    Type: AWS::Serverless::Function
    Properties:
      Events:
        A: { Type: HttpApi, Properties: { Method: get, Path: /x } }
        B: { Type: HttpApi, Properties: { Method: get, Path: /y, Auth: { Authorizer: NONE } } }
`;
    expect(templateRouteAuth(template)).toEqual(['GET /x ConsumerAuth', 'GET /y NONE']);
  });

  it('finds all 17 routes', () => {
    expect(openapiRoutes(read('openapi.yaml'))).toHaveLength(17);
  });

  it('reads CloudFormation short-form tags without failing', () => {
    const template = `Resources:
  Fn:
    Type: AWS::Serverless::Function
    Properties:
      Events:
        A:
          Type: HttpApi
          Properties: { ApiId: !Ref Api, Method: get, Path: /x }
        B:
          Type: Schedule
          Properties: { Schedule: rate(1 day) }
`;
    expect(templateRoutes(template)).toEqual(['GET /x']);
  });
});
