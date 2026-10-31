// Route sets for the parity test (design D7): template.yaml declares routes as HttpApi events, openapi.yaml as paths.
import { parse } from 'yaml';

const METHODS = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options'];

interface Template {
  Resources?: Record<string, { Type?: string; Properties?: { Events?: Record<string, { Type?: string; Properties?: { Method?: string; Path?: string } }> } }>;
}

// CloudFormation short-form tags (!Ref, !Sub, ...) are not YAML core types. Route keys never use them, so they parse as plain values.
const parseCfn = (source: string): unknown => parse(source, { logLevel: 'error' });

export function templateRoutes(source: string): string[] {
  const template = parseCfn(source) as Template;
  return Object.values(template.Resources ?? {})
    .filter((resource) => resource.Type === 'AWS::Serverless::Function')
    .flatMap((fn) => Object.values(fn.Properties?.Events ?? {}))
    .filter((event) => event.Type === 'HttpApi')
    .map((event) => `${event.Properties?.Method?.toUpperCase()} ${event.Properties?.Path}`)
    .sort();
}

export function openapiRoutes(source: string): string[] {
  const doc = parse(source) as { paths?: Record<string, Record<string, unknown>> };
  return Object.entries(doc.paths ?? {})
    .flatMap(([path, item]) => Object.keys(item).filter((key) => METHODS.includes(key)).map((m) => `${m.toUpperCase()} ${path}`))
    .sort();
}
