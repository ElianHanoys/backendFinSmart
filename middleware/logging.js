// middleware/logging.js
export const requestLogger = (req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
};

export const responseLogger = (req, res, next) => {
  const originalSend = res.send;
  
  res.send = function(body) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} -> ${res.statusCode}`);
    originalSend.call(this, body);
  };
  
  next();
};