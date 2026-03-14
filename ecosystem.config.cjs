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
  ]
};
