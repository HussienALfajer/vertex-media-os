import { createApp } from './app.factory.js';
import { ConfigurationError, loadAppConfig } from './config/app-config.js';
import { loadAuthConfig } from './config/auth-config.js';
import { safeErrorSerializer } from './logging/safe-error-serializer.js';

async function bootstrap(): Promise<void> {
  const config = loadAppConfig(process.env);
  const auth = loadAuthConfig(process.env);
  const app = await createApp(config, auth);

  // SIGINT/SIGTERM close the HTTP server and release the database pool.
  app.enableShutdownHooks();

  await app.listen({ host: config.http.host, port: config.http.port });
}

bootstrap().catch((error: unknown) => {
  // The structured logger may not exist yet (invalid configuration), so report on stderr, through
  // the error serializer so a database error prints only its allowlisted description (A2-01).
  const serialized = safeErrorSerializer(error);
  const reason =
    error instanceof ConfigurationError
      ? error.message
      : `Vertex OS API failed to start: ${serialized.stack || serialized.message}${
          serialized.database ? ` ${JSON.stringify(serialized.database)}` : ''
        }`;
  process.stderr.write(`${reason}\n`);
  process.exitCode = 1;
});
