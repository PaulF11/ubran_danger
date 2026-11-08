// File note: This file handles api.js.
const serverless = require("serverless-http");
const app = require("../../backend/src/app");

const expressHandler = serverless(app);
const API_FUNCTION_PATH = "/.netlify/functions/api";

exports.handler = async (event, context) => {
  const pathname =
    event.path || (event.rawUrl ? new URL(event.rawUrl).pathname : "");
  if (pathname === "/api" || pathname.startsWith("/api/")) {
    event.path = pathname;
  } else {
    const functionPathIndex = pathname.indexOf(API_FUNCTION_PATH);
    if (
      functionPathIndex < 0 ||
      (pathname.length > functionPathIndex + API_FUNCTION_PATH.length &&
        pathname[functionPathIndex + API_FUNCTION_PATH.length] !== "/")
    ) {
      return {
        statusCode: 404,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          success: false,
          message: "The requested API route was not found.",
        }),
      };
    }
    event.path = `/api${pathname.slice(
      functionPathIndex + API_FUNCTION_PATH.length,
    )}`;
  }
  return expressHandler(event, context);
};