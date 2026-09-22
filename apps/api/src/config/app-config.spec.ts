import { describe, expect, it } from 'vitest';
import { ConfigurationError, loadAppConfig } from './app-config.js';

const validEnvironment = {
  DATABASE_URL: 'postgresql://vertex:secret-value@127.0.0.1:5432/vertex_os',
};

describe('loadAppConfig', () => {
  it('applies safe defaults when only the required variables are present', () => {
    const config = loadAppConfig(validEnvironment);

    expect(config).toEqual({
      environment: 'development',
      http: { host: '127.0.0.1', port: 3000 },
      database: { url: validEnvironment.DATABASE_URL },
      logging: { level: 'info' },
      docs: { enabled: true },
    });
  });

  it('disables API docs by default in production and allows an explicit override', () => {
    expect(loadAppConfig({ ...validEnvironment, NODE_ENV: 'production' }).docs.enabled).toBe(false);
    expect(
      loadAppConfig({ ...validEnvironment, NODE_ENV: 'production', API_DOCS_ENABLED: 'true' }).docs
        .enabled,
    ).toBe(true);
    expect(loadAppConfig({ ...validEnvironment, API_DOCS_ENABLED: 'false' }).docs.enabled).toBe(
      false,
    );
  });

  it('fails fast naming the offending variables without echoing their values', () => {
    const attempt = () =>
      loadAppConfig({ DATABASE_URL: 'mysql://user:top-secret@db/app', API_PORT: '70000' });

    expect(attempt).toThrow(ConfigurationError);
    expect(attempt).toThrow(/DATABASE_URL/);
    expect(attempt).toThrow(/API_PORT/);
    expect(attempt).not.toThrow(/top-secret/);
  });

  it('requires DATABASE_URL', () => {
    expect(() => loadAppConfig({})).toThrow(/DATABASE_URL/);
  });
});
