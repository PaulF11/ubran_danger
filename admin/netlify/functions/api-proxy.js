// File note: This file handles api-proxy.js.

const { createProxyHandler } = require("../../../netlify/lib/apiProxy");

exports.handler = createProxyHandler();
