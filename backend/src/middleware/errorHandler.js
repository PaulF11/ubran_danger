// File note: This file handles errorHandler.js.

function errorHandler(err, req, res, next) {
  console.error(err);
  const status = err.status || 500;
  res
    .status(status)
    .json({
      success: false,
      message: status >= 500 ? "Internal Server Error" : err.message,
    });
}

module.exports = errorHandler;
