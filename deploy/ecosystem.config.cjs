// PM2 processes for demo.sub-zero.dev, alongside the SubZero API's own.
//
// The API runs from a git checkout built on the droplet and reads its secrets
// from /root/subzero-demo/.env (symlinked into apps/api, where Nest's
// ConfigModule looks). The web app is a Next.js standalone bundle built in
// GitHub Actions and unpacked into /root/subzero-demo/web, because a Next build
// would starve the production SubZero API sharing this box.
const ROOT = '/root/subzero-demo';
// The droplet's system Node is 18.7; Next.js 15 needs 18.18+. Other apps here
// already run on this nvm Node 20, and so does the demo.
const NODE = '/root/.nvm/versions/node/v20.20.0/bin/node';

module.exports = {
  apps: [
    {
      name: 'subzero-demo-api',
      cwd: `${ROOT}/app/apps/api`,
      script: 'dist/main.js',
      interpreter: NODE,
      env: { NODE_ENV: 'production' },
      max_memory_restart: '400M',
    },
    {
      name: 'subzero-demo-web',
      cwd: `${ROOT}/web/apps/web`,
      script: 'server.js',
      interpreter: NODE,
      env: { NODE_ENV: 'production', PORT: '3100', HOSTNAME: '127.0.0.1' },
      max_memory_restart: '300M',
    },
  ],
};
