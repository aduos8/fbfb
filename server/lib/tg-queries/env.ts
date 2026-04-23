export type EnvShape = {
  NODE_ENV: string;
  PORT: string;
  API_BASE_URL: string;
  CASSANDRA_CONTACT_POINTS: string;
  CASSANDRA_LOCAL_DC: string;
  CASSANDRA_KEYSPACE: string;
  CASSANDRA_USERNAME: string;
  CASSANDRA_PASSWORD: string;
  POSTGRES_URL: string;
  REDIS_URL: string;
  SEARCH_BACKEND: string;
  OPENSEARCH_URL: string;
  OPENSEARCH_USERNAME: string;
  OPENSEARCH_PASSWORD: string;
  MEILISEARCH_URL: string;
  MEILISEARCH_API_KEY: string;
  TELEGRAM_API_ID: string;
  TELEGRAM_API_HASH: string;
  TELEGRAM_SESSION: string;
  STORAGEBOX_SFTP_HOST: string;
  STORAGEBOX_SFTP_USER: string;
  STORAGEBOX_SFTP_PASSWORD: string;
  STORAGEBOX_BASE_URL: string;
  JWT_SECRET: string;
  ALLOW_PLACEHOLDER_SERVICES: string;
  ENABLE_STARTUP_CHECKS: string;
  SEARCH_ONLY_MODE: string;
};

export function readEnv(source: Record<string, string | undefined> = process.env): EnvShape {
  return {
    NODE_ENV: source.NODE_ENV ?? "development",
    PORT: source.PORT ?? "3000",
    API_BASE_URL: source.API_BASE_URL ?? "http://localhost:3000/api",
    CASSANDRA_CONTACT_POINTS: source.CASSANDRA_CONTACT_POINTS ?? "127.0.0.1",
    CASSANDRA_LOCAL_DC: source.CASSANDRA_LOCAL_DC ?? "datacenter1",
    CASSANDRA_KEYSPACE: source.CASSANDRA_KEYSPACE ?? "tgosint",
    CASSANDRA_USERNAME: source.CASSANDRA_USERNAME ?? "",
    CASSANDRA_PASSWORD: source.CASSANDRA_PASSWORD ?? "",
    POSTGRES_URL: source.POSTGRES_URL ?? "",
    REDIS_URL: source.REDIS_URL ?? "",
    SEARCH_BACKEND: source.SEARCH_BACKEND ?? "opensearch",
    OPENSEARCH_URL: source.OPENSEARCH_URL ?? "",
    OPENSEARCH_USERNAME: source.OPENSEARCH_USERNAME ?? "",
    OPENSEARCH_PASSWORD: source.OPENSEARCH_PASSWORD ?? "",
    MEILISEARCH_URL: source.MEILISEARCH_URL ?? "",
    MEILISEARCH_API_KEY: source.MEILISEARCH_API_KEY ?? "",
    TELEGRAM_API_ID: source.TELEGRAM_API_ID ?? "",
    TELEGRAM_API_HASH: source.TELEGRAM_API_HASH ?? "",
    TELEGRAM_SESSION: source.TELEGRAM_SESSION ?? "",
    STORAGEBOX_SFTP_HOST: source.STORAGEBOX_SFTP_HOST ?? "",
    STORAGEBOX_SFTP_USER: source.STORAGEBOX_SFTP_USER ?? "",
    STORAGEBOX_SFTP_PASSWORD: source.STORAGEBOX_SFTP_PASSWORD ?? "",
    STORAGEBOX_BASE_URL: source.STORAGEBOX_BASE_URL ?? "",
    JWT_SECRET: source.JWT_SECRET ?? "",
    ALLOW_PLACEHOLDER_SERVICES: source.ALLOW_PLACEHOLDER_SERVICES ?? "false",
    ENABLE_STARTUP_CHECKS: source.ENABLE_STARTUP_CHECKS ?? "",
    SEARCH_ONLY_MODE: source.SEARCH_ONLY_MODE ?? "false",
  };
}

export function readBooleanEnv(value: string | undefined, fallback = false): boolean {
  if (value === undefined || value === "") {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function isProductionEnv(source: Record<string, string | undefined> = process.env): boolean {
  return readEnv(source).NODE_ENV === "production";
}

export function arePlaceholderServicesAllowed(source: Record<string, string | undefined> = process.env): boolean {
  return readBooleanEnv(readEnv(source).ALLOW_PLACEHOLDER_SERVICES, false);
}

export function shouldRunStartupChecks(source: Record<string, string | undefined> = process.env): boolean {
  return readBooleanEnv(readEnv(source).ENABLE_STARTUP_CHECKS, isProductionEnv(source));
}

export function isSearchOnlyMode(source: Record<string, string | undefined> = process.env): boolean {
  return readBooleanEnv(readEnv(source).SEARCH_ONLY_MODE, false);
}
