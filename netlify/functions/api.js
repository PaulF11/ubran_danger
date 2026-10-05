const serverless = require("serverless-http");
const app = require("../../backend/src/app");

const expressHandler = serverless(app);

exports.handler = async (event, context) => {
  if (!event.path.startsWith("/api/")) {
    event.path = `/api${event.path === "/" ? "" : event.path}`;
  }
  return expressHandler(event, context);
};