/**
 * Lambda entry point. Separate from server.ts on purpose:
 *
 * - server.ts runs migrations on boot, which is right for one long-lived process
 *   and wrong here — it would run on every cold start, and concurrent cold starts
 *   would race each other. Migrations run in the deploy pipeline instead.
 * - The app is built once at module scope so warm invocations reuse it, along
 *   with the Postgres pool's open connections.
 */
import type { APIGatewayProxyEventV2, Context } from "aws-lambda";
import serverlessExpress from "serverless-http";
import { createApp } from "./app.js";

const handle = serverlessExpress(createApp());

type LambdaResult = {
  statusCode: number;
  headers?: Record<string, string | string[] | undefined>;
  multiValueHeaders?: Record<string, string[]>;
  cookies?: string[];
  body?: string;
  isBase64Encoded?: boolean;
};

/**
 * Function URLs use payload format 2.0, where Set-Cookie must be returned in a
 * top-level `cookies` array. Left as a header it is dropped, so sign-in appears
 * to succeed and the session silently never persists.
 */
function liftCookies(result: LambdaResult): LambdaResult {
  const cookies: string[] = [];

  for (const source of [result.headers, result.multiValueHeaders]) {
    if (!source) continue;
    for (const key of Object.keys(source)) {
      if (key.toLowerCase() !== "set-cookie") continue;
      const value = (source as Record<string, unknown>)[key];
      if (Array.isArray(value)) cookies.push(...(value as string[]));
      else if (typeof value === "string") cookies.push(value);
      delete (source as Record<string, unknown>)[key];
    }
  }

  if (cookies.length) result.cookies = [...(result.cookies ?? []), ...cookies];
  return result;
}

export const handler = async (event: APIGatewayProxyEventV2, context: Context) => {
  // Without this Lambda waits for the pg pool's idle sockets to close before
  // returning, adding the full idle timeout to every response.
  context.callbackWaitsForEmptyEventLoop = false;
  return liftCookies((await handle(event, context)) as LambdaResult);
};
