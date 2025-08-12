// Zod schema for ModeConfig (JS, shared between server and any JS client)
import { z } from 'zod';

// Helpers
const zInt = z.number().int().nonnegative();
const zPercent01 = z.number().min(0).max(1);

export const gravityPointSchema = z.object({
  t: z.number().min(0),
  gravity: z.number().positive()
}).strict();

export const attackTableSchema = z.object({
  single: z.number().min(0),
  double: z.number().min(0),
  triple: z.number().min(0),
  tetris: z.number().min(0),
  tspin: z.object({
    single: z.number().min(0),
    double: z.number().min(0),
    triple: z.number().min(0)
  }).strict(),
  backToBackBonus: z.number().min(0),
  comboTable: z.array(z.number().min(0)).min(1)
}).strict();

export const rulesSchema = z.object({
  attackTable: attackTableSchema,
  garbage: z.object({
    delayMs: zInt,
    telegraphMs: zInt,
    messiness: zPercent01,
    cancelPolicy: z.enum(['net','none','ratio']).default('net')
  }).strict(),
  speed: z.object({
    lockDelayMs: zInt,
    gravityCurve: z.array(gravityPointSchema).min(1)
  }).strict(),
  inputs: z.object({
    dasMs: zInt,
    arrMs: zInt,
    allow180: z.boolean().default(true),
    allowHold: z.boolean().default(true),
    holdConsumesLock: z.boolean().default(true)
  }).strict(),
  badges: z.object({
    enabled: z.boolean(),
    perKOPercent: zInt,
    maxStacks: zInt
  }).strict()
}).strict();

export const lobbySchema = z.object({
  minPlayers: zInt,
  maxPlayers: zInt,
  seedPolicy: z.enum(['perPlayer','shared'])
}).strict().refine(v=>v.maxPlayers>=v.minPlayers, { message: 'maxPlayers must be >= minPlayers' });

export const objectivesSchema = z.object({
  winCondition: z.enum(['last_standing','first_to_objectives']),
  checkpoints: z.array(z.object({
    type: z.enum(['kos','send_garbage','survive']),
    count: zInt.optional(),
    lines: zInt.optional(),
    seconds: zInt.optional()
  }).strict()).optional(),
  targets: z.object({
    tspins: z.object({ variant: z.enum(['single','double','triple']).optional(), count: zInt.optional(), withinSeconds: zInt.optional() }).partial(),
    survive: z.object({ seconds: zInt }).partial()
  }).partial().optional()
}).strict();

export const leaderboardSchema = z.object({
  scope: z.enum(['global','friends','none']).default('global'),
  scoring: z.enum(['placement','score','time'])
}).strict();

export const dailySchema = z.object({
  enabled: z.boolean(),
  seed: z.string().optional(),
  activeFrom: z.string().optional(),
  activeTo: z.string().optional()
}).strict().optional();

export const modeConfigSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  visibility: z.enum(['public','private','daily']).default('public'),
  mode: z.enum(['br','arcade','solo']).default('solo'),
  lobby: lobbySchema,
  rules: rulesSchema,
  objectives: objectivesSchema,
  leaderboard: leaderboardSchema,
  daily: dailySchema
}).strict();

export default modeConfigSchema;
