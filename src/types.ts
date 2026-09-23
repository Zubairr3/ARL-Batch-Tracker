// Define exactly what stages are allowed
export type BatchStage = 'SEEDED' | 'GERMINATION' | 'GROWING' | 'HARVEST_READY' | 'HARVESTED';

// A map to define Rule 2: Stage transitions only move forward one step at a time
export const STAGE_FLOW: Record<BatchStage, BatchStage | null> = {
  SEEDED: 'GERMINATION',
  GERMINATION: 'GROWING',
  GROWING: 'HARVEST_READY',
  HARVEST_READY: 'HARVESTED',
  HARVESTED: null
};

// Blueprint for creating a new tray
export interface CreateTrayBody {
  code: string;
  zone: string;
  capacity_units: number;
}

// Blueprint for creating a batch
export interface CreateBatchBody {
  tray_id: number;
  crop: string;
  expected_harvest_on: string;
}