import Fastify from 'fastify';
import fastifyPostgres from '@fastify/postgres';
import { apiRoutes } from './routes/api.js';
import dotenv from 'dotenv';

dotenv.config();

const app = Fastify({ logger: true });

// Connect to PostgreSQL
app.register(fastifyPostgres, {
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/agresearch'
});

// Load all our endpoints from the api.ts file
app.register(apiRoutes);

// Start the server
const start = async () => {
  try {
    const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
    
    // Listen on 0.0.0.0 for Render, using the 'app' variable
    await app.listen({ port: port, host: '0.0.0.0' });
    console.log(`Server listening on port ${port}`);
    
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();