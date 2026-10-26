import express from "express";

const app = express();

app.listen(3000, () => {
  console.log("Express Server running on PORT 3000");
});

app.get("/", (req, res) => {
  try {
    res.status(200).json({
      health: "OK",
      version: "12:52 latest",
    });
  } catch (e) {
    console.log(e);
  }
});
