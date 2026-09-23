# ARL Batch Tracker API

A RESTful API built with Fastify, TypeScript, and PostgreSQL to manage the lifecycle of leafy greens in tray-based aeroponic beds.

Live Deployment:https://arl-batch-tracker.onrender.com

---

## 🚀 Setup & Installation (Clean Machine)

**Prerequisites:** Node.js (v18+) and PostgreSQL installed locally.

**1. Clone the repository**
```bash
git clone [Insert Your GitHub Repo URL Here]
cd ARL-Batch-Tracker

**2. Install dependencies**

Bash
npm install
3. Environment Variables
Create a .env file in the root directory based on the provided .env.example:

Bash
cp .env.example .env
Ensure your .env contains your local PostgreSQL connection string: DATABASE_URL=postgres://user:password@localhost:5432/arl_db

4. Database Setup
Execute the provided schema file to create the tables and constraints:

Bash
psql -U your_username -d arl_db -f schema.sql
5. Run the Application

Bash
npm run dev
The server will start at http://127.0.0.1:3000.

6. Run the Test Suite
The test suite utilizes Node's native test runner (node:test) to verify the 4 core business rules.
Note: Ensure the local development server is running in a separate terminal before executing tests.

Bash
npm test
🧠 Architectural Decisions & Assumptions
The prompt asks: "Where do you enforce a rule? In the handler, in the service layer, in the database, or in more than one place?"

I chose a Hybrid Approach (Database + Handler Layer):

Absolute Data Integrity (The Database): Rules that govern cross-record state (like "A tray can hold at most one active batch") are enforced strictly at the database level using a partial unique index. The application layer can have bugs, and multiple server instances can create race conditions. The database is the single source of truth and the final line of defense.

Business Logic & Flow (The Handler/Service Layer): Sequential logic, like validating state machine transitions (SEEDED -> GERMINATION), is handled in the application layer. Keeping state transitions in TypeScript makes it much easier to unit test, debug, and expand future routing logic without writing complex SQL triggers.

Part 3a: Concurrency Safety
I chose Part 3a to guarantee that if two requests arrive at the exact same instant to seed a batch in a specific tray, exactly one succeeds and the other fails cleanly (409 Conflict).

How it works:
Instead of relying on a slow, application-level read-then-write lock, I implemented this PostgreSQL constraint in schema.sql:

SQL
CREATE UNIQUE INDEX one_active_batch_per_tray 
ON batches (tray_id) 
WHERE stage != 'HARVESTED';
Why this holds behind a load balancer: If the API is scaled horizontally behind a load balancer, application-level checks will fail due to race conditions. By pushing this constraint to the ACID-compliant database, PostgreSQL handles the row-level locking natively. The second concurrent request will violate the index, throw a unique constraint error, and the Fastify handler catches this error to return a clean 409 Conflict.

Assumptions & Trade-offs
Timezones: All dates (expected_harvest_on, seeded_on) are stored and returned in UTC (ISO-8601). Frontend clients are assumed to handle local timezone conversions.

Pagination: Implemented simple LIMIT and OFFSET for GET /batches. For a massive production dataset, cursor-based pagination (e.g., filtering by the last seen ID) would be more performant to avoid deep OFFSET scans.

Testing: Tests are currently integration tests written against the active HTTP server and database, proving the actual end-to-end flow of the business rules.

🤖 AI Usage
AI tools (Gemini) were utilized primarily as a thought partner for debugging TypeScript configurations, scaffolding the boilerplate setup for Fastify routing, and discussing the trade-offs between application-level locking versus PostgreSQL partial indexes for handling race conditions. All core business logic, schema design, and test implementations were manually driven and verified.
