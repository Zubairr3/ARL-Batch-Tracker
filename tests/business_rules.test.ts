import test from 'node:test';
import assert from 'node:assert';

const API_URL = 'http://127.0.0.1:3000';

test('Business Rules Test Suite', async (t) => {
  // Setup: Create a unique tray and batch for this specific test run
  const timestamp = Date.now();
  
  const trayRes = await fetch(`${API_URL}/trays`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: `TEST-TRAY-${timestamp}`, zone: 'Lab', capacity_units: 50 })
  });
  const tray = await trayRes.json() as any;

  const batchRes = await fetch(`${API_URL}/batches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tray_id: tray.id, crop: 'Test Crop', expected_harvest_on: '2026-10-15T00:00:00Z' })
  });
  const batch = await batchRes.json() as any;

  await t.test('Rule 1: A tray can hold at most one active batch (409 Conflict)', async () => {
    const duplicateBatchRes = await fetch(`${API_URL}/batches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tray_id: tray.id, crop: 'Cabbage', expected_harvest_on: '2026-10-20T00:00:00Z' })
    });
    // The database Partial Unique Index should block this
    assert.strictEqual(duplicateBatchRes.status, 409);
  });

  await t.test('Rule 2: Stage transitions only move forward, one step at a time', async () => {
    // Attempt illegal jump from SEEDED straight to HARVEST_READY
    const illegalJump = await fetch(`${API_URL}/batches/${batch.id}/stage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_stage: 'HARVEST_READY' })
    });
    assert.strictEqual(illegalJump.status, 409);

    // Perform a valid step to GERMINATION
    const validStep = await fetch(`${API_URL}/batches/${batch.id}/stage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_stage: 'GERMINATION' })
    });
    assert.strictEqual(validStep.status, 200);
  });

  await t.test('Rule 3: A harvest can only be recorded for a batch in HARVEST_READY', async () => {
    // The batch is currently in GERMINATION, so harvest should be rejected
    const prematureHarvest = await fetch(`${API_URL}/batches/${batch.id}/harvest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weight_grams: 500, grade: 'A' })
    });
    assert.strictEqual(prematureHarvest.status, 409);
  });

  await t.test('Rule 4: Recording a harvest frees the tray for reuse', async () => {
    // 1. Advance the batch legally to HARVEST_READY
    await fetch(`${API_URL}/batches/${batch.id}/stage`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to_stage: 'GROWING' })
    });
    await fetch(`${API_URL}/batches/${batch.id}/stage`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to_stage: 'HARVEST_READY' })
    });

    // 2. Record the Harvest
    const harvestRes = await fetch(`${API_URL}/batches/${batch.id}/harvest`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ weight_grams: 500, grade: 'A' })
    });
    assert.strictEqual(harvestRes.status, 201);

    // 3. Prove the tray is free by successfully planting a NEW batch in the SAME tray
    const newBatchRes = await fetch(`${API_URL}/batches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tray_id: tray.id, crop: 'New Crop', expected_harvest_on: '2026-11-01T00:00:00Z' })
    });
    assert.strictEqual(newBatchRes.status, 201);
  });
});