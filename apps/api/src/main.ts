import { createApp } from './app.factory.js';
import { ConfigurationError, loadAppConfig } from './config/app-config.js';

async function bootstrap(): Promise<void> {
  const config = loadAppConfig(process.env);
  const app = await createApp(config);

  // SIGINT/SIGTERM close the HTTP server and release the database pool.
  app.enableShutdownHooks();

  await app.listen({ host: config.http.host, port: config.http.port });
}

bootstrap().catch((error: unknown) => {
  // The structured logger may not exist yet (invalid configuration), so report on stderr.
  const reason =
    error instanceof ConfigurationError
      ? error.message
      : `Vertex OS API failed to start: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`;
  process.stderr.write(`${reason}\n`);
  process.exitCode = 1;
});
