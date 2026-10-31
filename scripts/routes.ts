// Route sets for the parity test (design D7): template.yaml declares routes as HttpApi events, openapi.yaml as paths.
import { parse } from 'yaml';

const METHODS = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options'];

// openapi.yaml security scheme name -> SAM HttpApi authorizer name. `security: []` means no authorizer.
const AUTHORIZER_FOR_SCHEME: Record<string, string> = {
  ConsumerAuth: 'ConsumerAuth',
  MerchantAuth: 'MerchantAuth',
  AdminSigV4: 'AWS_IAM',
};

interface HttpApiEvent {
  Type?: string;
  Properties?: { Method?: string; Path?: string; Auth?: { Authorizer?: string } };
}
interface Resource {
  Type?: string;
  Properties?: { Events?: Record<string, HttpApiEvent>; Auth?: { DefaultAuthorizer?: string } };
}
interface OpenApi {
  security?: Record<string, unknown>[];
  paths?: Record<string, Record<string, { security?: Record<string, unknown>[] }>>;
}

// CloudFormation short-form tags (!Ref, !Sub, ...) are not YAML core types. Route keys never use them, so they parse as plain values.
const parseCfn = (source: string): unknown => parse(source, { logLevel: 'error' });

function templateEvents(source: string): { route: string; authorizer: string }[] {
  const resources = Object.values((parseCfn(source) as { Resources?: Record<string, Resource> }).Resources ?? {});
  const defaultAuthorizer =
    resources.find((r) => r.Type === 'AWS::Serverless::HttpApi')?.Properties?.Auth?.DefaultAuthorizer ?? 'NONE';
  return resources
    .filter((resource) => resource.Type === 'AWS::Serverless::Function')
    .flatMap((fn) => Object.values(fn.Properties?.Events ?? {}))
    .filter((event) => event.Type === 'HttpApi')
    .map((event) => ({
      route: `${event.Properties?.Method?.toUpperCase()} ${event.Properties?.Path}`,
      authorizer: event.Properties?.Auth?.Authorizer ?? defaultAuthorizer,
    }));
}

function openapiOperations(source: string): { route: string; authorizer: string }[] {
  const doc = parse(source) as OpenApi;
  return Object.entries(doc.paths ?? {}).flatMap(([path, item]) =>
    Object.entries(item)
      .filter(([method]) => METHODS.includes(method))
      .map(([method, operation]) => {
        const scheme = Object.keys((operation.security ?? doc.security ?? [])[0] ?? {})[0];
        return {
          route: `${method.toUpperCase()} ${path}`,
          authorizer: scheme ? (AUTHORIZER_FOR_SCHEME[scheme] ?? `unknown scheme ${scheme}`) : 'NONE',
        };
      }),
  );
}

export const templateRoutes = (source: string) => templateEvents(source).map((e) => e.route).sort();
export const openapiRoutes = (source: string) => openapiOperations(source).map((e) => e.route).sort();
export const templateRouteAuth = (source: string) =>
  templateEvents(source).map((e) => `${e.route} ${e.authorizer}`).sort();
export const openapiRouteAuth = (source: string) =>
  openapiOperations(source).map((e) => `${e.route} ${e.authorizer}`).sort();
