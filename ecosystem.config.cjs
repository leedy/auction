const path = require('path');
const appDir = __dirname;

module.exports = {
  apps: [
    {
      name: 'auction-backend',
      cwd: path.join(appDir, 'backend'),
      script: 'server.mjs',
      env: {
        NODE_ENV: 'production',
      },
      error_file: path.join(appDir, 'logs/backend-error.log'),
      out_file: path.join(appDir, 'logs/backend-out.log'),
      time: true,
    },
    {
      name: 'auction-frontend',
      cwd: path.join(appDir, 'frontend'),
      script: 'node_modules/.bin/vite',
      args: '--host',
      env: {
        NODE_ENV: 'development',
      },
      error_file: path.join(appDir, 'logs/frontend-error.log'),
      out_file: path.join(appDir, 'logs/frontend-out.log'),
      time: true,
    },
  ]
};
