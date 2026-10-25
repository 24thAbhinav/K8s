const express = require("express");

// Load the .env file mounted from the backend-env Secret (read-only volume).
require("dotenv").config({
  path: process.env.ENV_FILE || "/app/.env",
});

const app = express();
const port = process.env.PORT;
const DB = process.env.DB;
const DB_PASSWORD = process.env.DB_PASSWORD;
if (!port) {
  console.error(
    "PORT is not set — expected it from the backend-config ConfigMap",
  );
  process.exit(1);
}

console.log(`PORT = ${port} (imported from the backend-config ConfigMap)`);
console.log(`DB = ${DB} (imported from the backend-config ConfigMap)`);
console.log(
  `DB_PASSWORD = ${
    DB_PASSWORD ? `${DB_PASSWORD[0]}*** (len ${DB_PASSWORD.length})` : "(missing)"
  } (imported from the backend-secret Secret)`,
);

const APP_MODE = process.env.APP_MODE;
const LOG_LEVEL = process.env.LOG_LEVEL;
const API_KEY = process.env.API_KEY;
console.log(`APP_MODE = ${APP_MODE}, LOG_LEVEL = ${LOG_LEVEL} (loaded from .env)`);
console.log(
  `API_KEY = ${
    API_KEY ? `${API_KEY[0]}*** (len ${API_KEY.length})` : "(missing)"
  } (loaded from .env)`,
);
app.get("/", (req, res) => {
  res.type("text/plain").send(`Backend is listening on PORT ${port}\n`);
});

app.get("/port", (req, res) => {
  res.json({ port });
});

app.listen(Number(port), () => console.log(`listening on port ${port}`));
