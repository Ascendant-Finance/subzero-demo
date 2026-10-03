process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5433/trelloclone_test';
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6380';
process.env.JWT_ACCESS_SECRET = 'test_access_secret';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret';
process.env.JWT_ACCESS_TTL = '15m';
process.env.JWT_REFRESH_TTL = '30d';
process.env.WEB_ORIGIN = 'http://localhost:3000';
process.env.COOKIE_DOMAIN = 'localhost';
process.env.UPLOAD_MAX_BYTES = '26214400';
process.env.SPACES_ENDPOINT = 'https://nyc3.digitaloceanspaces.com';
process.env.SPACES_REGION = 'nyc3';
process.env.SPACES_BUCKET = 'trello-clone-uploads';
process.env.SPACES_KEY = 'test-key';
process.env.SPACES_SECRET = 'test-secret';
process.env.SPACES_PUBLIC_BASE_URL = 'https://cdn.example.com';
