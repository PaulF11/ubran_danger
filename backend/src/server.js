require("dotenv").config();
const app = require("./app");

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(PORT, () => {
  console.log(`Urban Danger API listening on port ${PORT}`);
});
