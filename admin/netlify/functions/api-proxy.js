const { createProxyHandler } = require("../../../netlify/lib/apiProxy");

exports.handler = createProxyHandler();
