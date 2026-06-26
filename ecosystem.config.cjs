module.exports = {
  apps: [
    {
      name: "vymo-wishes",
      script: "dist/index.js",
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_restarts: 10,
      env_production: {
        NODE_ENV: "production",
      },
    },
  ],
};
