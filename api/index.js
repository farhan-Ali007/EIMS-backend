// This file is the entry point for Vercel serverless functions
import app from '../app.js';

export default async (req, res) => {
  // Forward the request to the Express app
  return app(req, res);
};
