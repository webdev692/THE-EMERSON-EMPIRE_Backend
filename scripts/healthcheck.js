const http = require('http');

const port = process.env.PORT || 3000;
const url = `http://localhost:${port}/health`;

http.get(url, (res) => {
  if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
    console.log(`Healthcheck passed: ${res.statusCode}`);
    process.exit(0);
  }

  console.error(`Healthcheck failed: ${res.statusCode}`);
  process.exit(1);
}).on('error', (error) => {
  console.error(`Healthcheck error: ${error.message}`);
  process.exit(1);
});
