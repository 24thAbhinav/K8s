const express = require("express");

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
app.get("/", (req, res) => {
  res.type("text/plain").send(`Backend is listening on PORT ${port}\n`);
});

app.get("/port", (req, res) => {
  res.json({ port });
});

app.listen(Number(port), () => console.log(`listening on port ${port}`));
