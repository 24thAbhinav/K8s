const express = require('express');

const app = express();
const port = process.env.PORT;

if (!port) {
  console.error('PORT is not set — expected it from the backend-config ConfigMap');
  process.exit(1);
}

console.log(`PORT = ${port} (imported from the backend-config ConfigMap)`);

app.get('/', (req, res) => {
  res.type('text/plain').send(`Backend is listening on PORT ${port}\n`);
});

app.get('/port', (req, res) => {
  res.json({ port });
});

app.listen(Number(port), () => console.log(`listening on port ${port}`));
