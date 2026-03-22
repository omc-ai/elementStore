// ═══════════════════════════════════════════════════════════════════
// ecosystem.config.js — PM2 process definition for ws-dispatcher
//
// Usage (via aic-daemon.sh or directly):
//   pm2 start  ecosystem.config.js
//   pm2 stop   ws-dispatcher
//   pm2 restart ws-dispatcher
//   pm2 logs   ws-dispatcher
//   pm2 status
//
// Survive reboots:
//   pm2 startup   # generate and run the startup command once
//   pm2 save      # freeze current process list
// ═══════════════════════════════════════════════════════════════════

const path = require('path');

module.exports = {
  apps: [
    {
      name: 'ws-dispatcher',
      script: path.join(__dirname, 'ws-dispatcher.js'),
      cwd: __dirname,

      // Interpreter — use the node in PATH (resolves through nvm if active)
      interpreter: 'node',

      // Default environment (used when no --env flag is passed)
      env: {
        NODE_ENV: 'production',
        ES_URL: process.env.ES_URL || 'http://arc3d.master.local/elementStore',
        DISPATCHER_PORT: process.env.DISPATCHER_PORT || '3102'
      },

      // Named environment — used when started with: pm2 start ... --env production
      env_production: {
        NODE_ENV: 'production',
        ES_URL: process.env.ES_URL || 'http://arc3d.master.local/elementStore',
        DISPATCHER_PORT: process.env.DISPATCHER_PORT || '3102'
      },

      // Logging
      out_file: '/tmp/aic-dispatcher.log',
      error_file: '/tmp/aic-dispatcher-error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',

      // Auto-restart behaviour
      autorestart: true,
      watch: false,
      max_restarts: 50,
      min_uptime: '10s',       // must stay up 10 s before restart resets counter
      restart_delay: 5000,     // wait 5 s between restarts
      exp_backoff_restart_delay: 2000,  // exponential back-off cap

      // Crash protection — don't restart if it keeps failing too fast
      max_memory_restart: '512M',

      // Single instance (no cluster needed)
      instances: 1,
      exec_mode: 'fork'
    }
  ]
};
