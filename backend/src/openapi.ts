// OpenAPI 3.1 document built from the registered Express routes and the server's own Zod schemas.
// `npm run openapi -w backend` writes docs/openapi.json; a test fails when it is out of date.
import express from 'express';
import type { Pool } from 'pg';
import type { z } from 'zod/v4';

import { createApp, periodsQuery } from './app.js';
import { checklistQuery } from './check-routes.js';
import { diaryInput, diaryQuery } from './diary-routes.js';
import { goalInput, reviewsInput, routineLinksInput } from './goal-routes.js';
import { projectInput } from './project-link-routes.js';
import { monthQuery } from './record-routes.js';
import {
  listQuery as routineListQuery,
  moveInput,
  projectLinkInput,
  renameInput,
} from './routine-routes.js';
import { routineInput } from './routines.js';

type Json = Record<string, unknown>;

type CheckDef = {
  check: string;
  format?: string;
  pattern?: RegExp;
  minimum?: number;
  maximum?: number;
  length?: number;
  value?: number;
  inclusive?: boolean;
};
const checksOf = (def: Json) =>
  ((def.checks ?? []) as { _zod: { def: CheckDef } }[]).map((check) => check._zod.def);

const STRING_FORMATS: Record<string, string> = {
  uuid: 'uuid',
  guid: 'uuid',
  email: 'email',
  url: 'uri',
  datetime: 'date-time',
  date: 'date',
  time: 'time',
};
function stringFormat(format: string) {
  const name = STRING_FORMATS[format];
  if (!name) throw new Error(`Unsupported string format: ${format}`);
  return name;
}
// z.number().int() is a check and z.int() is the type itself; float32 and float64 are the same kinds but not integers.
const isIntegerFormat = (format: unknown) => typeof format === 'string' && format.includes('int');

// Converts the Zod 4 types the API uses. Refinements (cross-field rules) cannot be expressed
// here; any other unsupported type fails loudly instead of being silently dropped.
export function jsonSchema(schema: z.ZodType): Json {
  const def = schema._zod.def as unknown as Json & { type: string };
  switch (def.type) {
    case 'object': {
      const shape = def.shape as Record<string, z.ZodType>;
      const required = Object.keys(shape).filter((key) => !shape[key].isOptional());
      const catchall = def.catchall as z.ZodType | undefined;
      return {
        type: 'object',
        properties: Object.fromEntries(Object.entries(shape).map(([k, v]) => [k, jsonSchema(v)])),
        ...(required.length ? { required } : {}),
        ...(catchall?._zod.def.type === 'never' ? { additionalProperties: false } : {}),
      };
    }
    case 'string': {
      const out: Json = { type: 'string' };
      // z.uuid() and z.email() carry their format on the type, z.string().uuid() as a check.
      if (def.format) out.format = stringFormat(def.format as string);
      for (const check of checksOf(def)) {
        if (check.check === 'min_length') out.minLength = check.minimum;
        else if (check.check === 'max_length') out.maxLength = check.maximum;
        else if (check.check === 'length_equals') out.minLength = out.maxLength = check.length;
        else if (check.check === 'string_format' && check.format === 'regex')
          out.pattern = check.pattern!.source;
        else if (check.check === 'string_format') out.format = stringFormat(check.format!);
        // `overwrite` is trim(); `custom` is a refinement.
        else if (check.check !== 'overwrite' && check.check !== 'custom')
          throw new Error(`Unsupported string check: ${check.format ?? check.check}`);
      }
      return out;
    }
    case 'number': {
      const out: Json = { type: isIntegerFormat(def.format) ? 'integer' : 'number' };
      for (const check of checksOf(def)) {
        if (check.check === 'number_format') {
          if (isIntegerFormat(check.format)) out.type = 'integer';
        } else if (check.check === 'greater_than')
          out[check.inclusive ? 'minimum' : 'exclusiveMinimum'] = check.value;
        else if (check.check === 'less_than')
          out[check.inclusive ? 'maximum' : 'exclusiveMaximum'] = check.value;
        else if (check.check === 'multiple_of') out.multipleOf = check.value;
        else if (check.check !== 'custom')
          throw new Error(`Unsupported number check: ${check.check}`);
      }
      return out;
    }
    case 'boolean':
      return { type: 'boolean' };
    case 'array': {
      let min: number | undefined;
      let max: number | undefined;
      for (const check of checksOf(def)) {
        if (check.check === 'min_length') min = check.minimum;
        else if (check.check === 'max_length') max = check.maximum;
        else if (check.check === 'length_equals') min = max = check.length;
        else if (check.check !== 'custom')
          throw new Error(`Unsupported array check: ${check.check}`);
      }
      return {
        type: 'array',
        items: jsonSchema(def.element as z.ZodType),
        ...(min !== undefined ? { minItems: min } : {}),
        ...(max !== undefined ? { maxItems: max } : {}),
      };
    }
    case 'enum':
      return { type: 'string', enum: Object.values(def.entries as Record<string, string>) };
    case 'nullable': {
      const inner = jsonSchema(def.innerType as z.ZodType);
      return typeof inner.type === 'string'
        ? { ...inner, type: [inner.type, 'null'] }
        : { anyOf: [inner, { type: 'null' }] };
    }
    case 'optional':
      return jsonSchema(def.innerType as z.ZodType);
    case 'default':
      return { ...jsonSchema(def.innerType as z.ZodType), default: def.defaultValue };
    // .transform() is a pipe; the request is described by what comes in. z.preprocess() is a pipe
    // starting from a transform, which says nothing about the value, so its target describes it.
    case 'pipe': {
      const input = def.in as z.ZodType;
      return jsonSchema(input._zod.def.type === 'transform' ? (def.out as z.ZodType) : input);
    }
    case 'unknown':
      return {};
    default:
      throw new Error(`Unsupported Zod type for OpenAPI: ${def.type}`);
  }
}

type Operation = {
  summary: string;
  body?: [name: string, schema: z.ZodType];
  query?: z.ZodType;
  // Success status first; the rest are documented error statuses.
  status: number[];
};
// Every registered route must appear here exactly once (checked when building).
// Every route that reads an id, a date, a body or a query also answers 400 when validation fails.
const operations: Record<string, Operation> = {
  'GET /api/health': { summary: 'Check the server and database connection', status: [200, 500] },
  'GET /api/me': { summary: 'Get the signed-in user', status: [200, 401, 503] },
  'GET /api/periods': {
    summary: 'Get the daily, weekly, four-week and twelve-week periods that hold a date',
    query: periodsQuery,
    status: [200, 400],
  },

  'GET /api/checklist': {
    summary:
      'Get the routines of one cadence with their checked state for the period holding a date; only today and the 7 days before it can be viewed',
    query: checklistQuery,
    status: [200, 400],
  },
  'PUT /api/routines/:id/checks/:date': {
    summary:
      'Check a routine for the period holding a date; repeating it changes nothing. Only today and the 7 days before it can change',
    status: [200, 400, 404],
  },
  'DELETE /api/routines/:id/checks/:date': {
    summary:
      'Uncheck a routine for the period holding a date; repeating it changes nothing. Only today and the 7 days before it can change',
    status: [200, 400, 404],
  },

  'GET /api/diary': {
    summary: 'Get the diary entry of a day (or null) with the routine progress of that day',
    query: diaryQuery,
    status: [200, 400],
  },
  'PUT /api/diary/:date': {
    summary: 'Write the diary entry of a day, replacing the existing one; no future dates',
    body: ['DiaryEntry', diaryInput],
    status: [200, 400],
  },

  'GET /api/goals': {
    summary: 'List the twelve-week goals of the current period and of past periods',
    status: [200],
  },
  'POST /api/goals': {
    summary: 'Add a goal to the current twelve-week period',
    body: ['Goal', goalInput],
    status: [201, 400],
  },
  'PUT /api/goals/reviews': {
    summary:
      'Save the reviews of goals of ended periods, all or nothing; clearing both answers marks a goal as not reviewed',
    body: ['GoalReviews', reviewsInput],
    status: [200, 400, 404],
  },
  'PATCH /api/goals/:id': {
    summary: 'Rename a goal of the current period',
    body: ['Goal', goalInput],
    status: [200, 400, 404],
  },
  'PUT /api/goals/:id/routines': {
    summary:
      'Replace the routines linked to a goal of the current period; only active daily and weekly routines',
    body: ['GoalRoutineLinks', routineLinksInput],
    status: [200, 400, 404],
  },
  'DELETE /api/goals/:id': {
    summary: 'Delete a goal of the current period',
    status: [200, 400, 404],
  },

  'GET /api/project-links': { summary: 'List project links', status: [200] },
  'POST /api/project-links': {
    summary: 'Add a project link; the URL is https:// or a private access address',
    body: ['ProjectLink', projectInput],
    status: [201, 400, 409],
  },
  'DELETE /api/project-links/:id': {
    summary: 'Delete a project link; routines linked to it lose the link',
    status: [200, 400, 404],
  },

  'GET /api/records': {
    summary: 'Get the daily routine progress and diary marks of each day of a month',
    query: monthQuery,
    status: [200, 400],
  },
  'GET /api/records/:date': {
    summary: 'Get the daily routines, their checks and the diary entry of one past day',
    status: [200, 400],
  },

  'GET /api/stats': {
    summary: 'Get routine achievement statistics, including archived routines',
    status: [200],
  },

  'GET /api/routines': {
    summary: 'List active routines, optionally of one cadence',
    query: routineListQuery,
    status: [200, 400],
  },
  'POST /api/routines': {
    summary:
      'Add a routine; a daily routine needs a category and other cadences take none. The first routine fixes the first-use date of four- and twelve-week periods',
    body: ['Routine', routineInput],
    status: [201, 400],
  },
  'PATCH /api/routines/:id': {
    summary: 'Rename an active routine',
    body: ['RoutineRename', renameInput],
    status: [200, 400, 404],
  },
  'POST /api/routines/:id/move': {
    summary: 'Move a routine one place up or down within its group; returns the group',
    body: ['RoutineMove', moveInput],
    status: [200, 400, 404],
  },
  'PUT /api/routines/:id/project-link': {
    summary: 'Link a routine to a project, or clear the link with null',
    body: ['RoutineProjectLink', projectLinkInput],
    status: [200, 400, 404],
  },
  'POST /api/routines/:id/archive': {
    summary: 'Archive a routine: it leaves the lists but its past checks stay',
    status: [200, 400, 404],
  },
};

type Layer = {
  route?: { path: string; methods: Record<string, boolean> };
  handle?: { stack?: Layer[] };
};

// The routes live in sub-routers mounted with app.use(prefix, router). Express keeps no mount path
// on the layer, so it is recorded while the app is built (see documentedApp).
const mounts = new WeakMap<object, string>();

// The app as the server builds it, with no database: routes are only registered, never called, so
// the pool is never used. Use this instead of createApp where the routes are listed.
export function documentedApp() {
  const original = express.application.use;
  express.application.use = function (this: unknown, ...args: unknown[]) {
    const [first, ...handlers] = args;
    if (typeof first === 'string')
      for (const handler of handlers.flat())
        if (typeof handler === 'function') mounts.set(handler, first);
    return (original as (...all: unknown[]) => unknown).apply(this, args);
  } as typeof original;
  try {
    return createApp({} as Pool);
  } finally {
    express.application.use = original;
  }
}

function routesOf(stack: Layer[], prefix: string): string[] {
  return stack.flatMap((layer) => {
    if (layer.route) {
      const path = layer.route.path === '/' ? '' : layer.route.path;
      return Object.keys(layer.route.methods).map((m) => `${m.toUpperCase()} ${prefix}${path}`);
    }
    const mount = layer.handle && mounts.get(layer.handle);
    return layer.handle?.stack && mount !== undefined
      ? routesOf(layer.handle.stack, prefix + mount)
      : [];
  });
}
export function registeredRoutes(app: express.Express) {
  return routesOf((app as unknown as { router: { stack: Layer[] } }).router.stack, '');
}

const statusText: Record<number, string> = {
  200: 'Success',
  201: 'Created',
  400: 'Input validation failed, or the date or item is not allowed for this action',
  401: 'Sign-in required (no session from the shared sign-in)',
  404: 'No target',
  409: 'Duplicate',
  500: 'Server error',
  503: 'The shared sign-in service is unavailable or not configured',
};

// Path parameters: ids are positive integers of up to 15 digits (ADR-0025) and dates are YYYY-MM-DD.
function pathParam(name: string): Json {
  if (name === 'date') return { type: 'string', format: 'date' };
  if (name === 'id') return { type: 'integer', minimum: 1, maximum: 999999999999999 };
  return { type: 'string' };
}

export function buildOpenApi(app: express.Express) {
  const routes = registeredRoutes(app);
  const missing = routes.filter((route) => !operations[route]);
  const extra = Object.keys(operations).filter((route) => !routes.includes(route));
  if (missing.length || extra.length)
    throw new Error(`OpenAPI operations differ from routes: +${missing} -${extra}`);
  const schemas: Json = {
    Error: {
      type: 'object',
      properties: { error: { type: 'string', description: 'English error message' } },
      required: ['error'],
    },
  };
  const paths: Record<string, Json> = {};
  for (const route of [...routes].sort()) {
    const [method, path] = route.split(' ');
    const op = operations[route];
    const parameters: Json[] = [...path.matchAll(/:(\w+)/g)].map(([, name]) => ({
      name,
      in: 'path',
      required: true,
      schema: pathParam(name),
    }));
    if (op.query) {
      const query = jsonSchema(op.query) as { properties: Json; required?: string[] };
      for (const [name, schema] of Object.entries(query.properties))
        parameters.push({ name, in: 'query', required: !!query.required?.includes(name), schema });
    }
    if (op.body) schemas[op.body[0]] = jsonSchema(op.body[1]);
    const [success, ...failures] = op.status;
    const responses: Json = { [success]: { description: statusText[success] } };
    for (const status of failures)
      responses[status] = {
        description: statusText[status],
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      };
    const key = path.replace(/:(\w+)/g, '{$1}');
    paths[key] ??= {};
    paths[key][method.toLowerCase()] = {
      summary: op.summary,
      ...(parameters.length ? { parameters } : {}),
      ...(op.body
        ? {
            requestBody: {
              required: true,
              content: {
                'application/json': { schema: { $ref: `#/components/schemas/${op.body[0]}` } },
              },
            },
          }
        : {}),
      responses,
    };
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Plan Routine API',
      version: '1.0.0',
      description:
        'Dates are YYYY-MM-DD (Asia/Seoul). Ids are positive integers (numbers, up to 15 digits). Every error response is { error: English message }.',
    },
    servers: [{ url: '/' }],
    paths,
    components: { schemas },
  };
}
