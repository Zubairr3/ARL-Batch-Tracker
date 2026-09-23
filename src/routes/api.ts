import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { CreateTrayBody, CreateBatchBody, BatchStage, STAGE_FLOW } from '../types.js';

export const apiRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {

  // ==========================================
  // TRAYS ENDPOINTS
  // ==========================================
  
  // 1. Create a Tray
  fastify.post<{ Body: CreateTrayBody }>('/trays', async (request, reply) => {
    const { code, zone, capacity_units } = request.body;

    if (!code || !zone || !capacity_units || capacity_units <= 0) {
      return reply.status(400).send({ error: 'Valid code, zone, and capacity_units are required.' });
    }

    try {
      const res = await fastify.pg.query(
        'INSERT INTO trays (code, zone, capacity_units) VALUES ($1, $2, $3) RETURNING *',
        [code, zone, capacity_units]
      );
      return reply.status(201).send(res.rows[0]);
    } catch (err: any) {
      if (err.code === '23505') { 
        return reply.status(409).send({ error: 'Tray code already exists.' });
      }
      throw err;
    }
  });

  // 2. Get All Trays
  fastify.get('/trays', async (request, reply) => {
    const res = await fastify.pg.query('SELECT * FROM trays ORDER BY id ASC');
    return reply.status(200).send(res.rows);
  });

  // 3. Get One Tray
  fastify.get<{ Params: { id: string } }>('/trays/:id', async (request, reply) => {
    const res = await fastify.pg.query('SELECT * FROM trays WHERE id = $1', [request.params.id]);
    if (res.rows.length === 0) {
      return reply.status(404).send({ error: 'Tray not found' }); 
    }
    return reply.status(200).send(res.rows[0]);
  });

  // ==========================================
  // BATCHES ENDPOINTS
  // ==========================================

  // 4. Seed a new batch into a tray
  fastify.post<{ Body: CreateBatchBody }>('/batches', async (request, reply) => {
    const { tray_id, crop, expected_harvest_on } = request.body;

    if (!tray_id || !crop || !expected_harvest_on) {
      return reply.status(400).send({ error: 'tray_id, crop, and expected_harvest_on are required.' });
    }

    try {
      const res = await fastify.pg.query(
        `INSERT INTO batches (tray_id, crop, expected_harvest_on, stage) 
         VALUES ($1, $2, $3, 'SEEDED') RETURNING *`,
        [tray_id, crop, expected_harvest_on]
      );
      return reply.status(201).send(res.rows[0]);
    } catch (err: any) {
      if (err.code === '23505') {
        return reply.status(409).send({ error: 'Conflict: This tray already has an active batch.' });
      }
      throw err;
    }
  });

  // 5. Get all batches with Filtering and Pagination
  fastify.get('/batches', async (request, reply) => {
    const { stage, crop, zone, limit = 10, offset = 0 } = request.query as any;
    
    let sql = `
      SELECT batches.*, trays.zone 
      FROM batches 
      JOIN trays ON batches.tray_id = trays.id 
      WHERE 1=1
    `;
    const values: any[] = [];
    let paramIndex = 1;

    if (stage) {
      sql += ` AND batches.stage = $${paramIndex++}`;
      values.push(stage);
    }
    if (crop) {
      sql += ` AND batches.crop = $${paramIndex++}`;
      values.push(crop);
    }
    if (zone) {
      sql += ` AND trays.zone = $${paramIndex++}`;
      values.push(zone);
    }

    sql += ` ORDER BY batches.id ASC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    values.push(limit, offset);

    const res = await fastify.pg.query(sql, values);
    return reply.status(200).send(res.rows);
  });

  // 6. Advance Stage
  fastify.patch<{ Params: { id: string }; Body: { to_stage: BatchStage } }>('/batches/:id/stage', async (request, reply) => {
    const { id } = request.params;
    const { to_stage } = request.body;

    const currentBatch = await fastify.pg.query('SELECT stage FROM batches WHERE id = $1', [id]);
    if (currentBatch.rows.length === 0) {
      return reply.status(404).send({ error: 'Batch not found.' });
    }

    const currentStage = currentBatch.rows[0].stage as BatchStage;
    const allowedNextStage = STAGE_FLOW[currentStage]; 

    if (to_stage === 'HARVESTED') {
      return reply.status(409).send({ error: 'Cannot advance to HARVESTED directly. Use the /harvest endpoint.' });
    }

    if (to_stage !== allowedNextStage) {
      return reply.status(409).send({ 
        error: `Invalid transition. Current stage is ${currentStage}. You must move to ${allowedNextStage}.` 
      });
    }

    const update = await fastify.pg.query('UPDATE batches SET stage = $1 WHERE id = $2 RETURNING *', [to_stage, id]);
    return reply.status(200).send(update.rows[0]);
  });

  // 7. Record Harvest
  fastify.post<{ Params: { id: string }; Body: { weight_grams: number, grade: string } }>('/batches/:id/harvest', async (request, reply) => {
    const { id } = request.params;
    const { weight_grams, grade } = request.body;

    if (!weight_grams || !['A', 'B', 'C'].includes(grade)) {
      return reply.status(400).send({ error: 'Invalid payload. Weight and grade (A,B,C) required.' });
    }

    const client = await fastify.pg.connect();
    
    try {
      await client.query('BEGIN'); 

      const batchRes = await client.query('SELECT stage FROM batches WHERE id = $1 FOR UPDATE', [id]);
      
      if (batchRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return reply.status(404).send({ error: 'Batch not found.' });
      }

      if (batchRes.rows[0].stage !== 'HARVEST_READY') {
        await client.query('ROLLBACK');
        return reply.status(409).send({ error: 'Batch must be in HARVEST_READY stage to be harvested.' });
      }

      const harvestRes = await client.query(
        'INSERT INTO harvests (batch_id, weight_grams, grade) VALUES ($1, $2, $3) RETURNING *',
        [id, weight_grams, grade]
      );

      await client.query("UPDATE batches SET stage = 'HARVESTED' WHERE id = $1", [id]);

      await client.query('COMMIT'); 
      return reply.status(201).send(harvestRes.rows[0]);
      
    } catch (err) {
      await client.query('ROLLBACK'); 
      throw err;
    } finally {
      client.release(); 
    }
  });
};