import { z } from 'zod';
import { instructors, courses, officeHours, visits, visitInteractions, plannedMeetings } from './schema';
import { createInsertSchema } from 'drizzle-zod';

// ============================================
// SHARED ERROR SCHEMAS
// ============================================
export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

// ============================================
// API CONTRACT
// ============================================
export const api = {
  instructors: {
    list: {
      method: 'GET' as const,
      path: '/api/instructors' as const,
      input: z.object({
        department: z.string().optional(),
        targetPriority: z.string().optional(),
        search: z.string().optional(),
      }).optional(),
      responses: {
        200: z.array(z.custom<typeof instructors.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/instructors/:id' as const,
      responses: {
        200: z.custom<typeof instructors.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/instructors' as const,
      input: createInsertSchema(instructors).omit({ id: true, createdAt: true }),
      responses: {
        201: z.custom<typeof instructors.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/instructors/:id' as const,
      input: createInsertSchema(instructors).omit({ id: true, createdAt: true }).partial(),
      responses: {
        200: z.custom<typeof instructors.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
  },
  courses: {
    list: {
      method: 'GET' as const,
      path: '/api/courses' as const,
      input: z.object({
        instructorId: z.coerce.number().optional(),
      }).optional(),
      responses: {
        200: z.array(z.custom<typeof courses.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/courses' as const,
      input: createInsertSchema(courses).omit({ id: true }),
      responses: {
        201: z.custom<typeof courses.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
  },
  officeHours: {
    list: {
      method: 'GET' as const,
      path: '/api/office-hours' as const,
      input: z.object({
        instructorId: z.coerce.number().optional(),
      }).optional(),
      responses: {
        200: z.array(z.custom<typeof officeHours.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/office-hours' as const,
      input: createInsertSchema(officeHours).omit({ id: true }),
      responses: {
        201: z.custom<typeof officeHours.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
  },
  visits: {
    list: {
      method: 'GET' as const,
      path: '/api/visits' as const,
      responses: {
        200: z.array(z.custom<typeof visits.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/visits' as const,
      input: createInsertSchema(visits).omit({ id: true, createdAt: true, userId: true }),
      responses: {
        201: z.custom<typeof visits.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
  },
  interactions: {
    create: {
      method: 'POST' as const,
      path: '/api/interactions' as const,
      input: createInsertSchema(visitInteractions).omit({ id: true }),
      responses: {
        201: z.custom<typeof visitInteractions.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
  },
  plannedMeetings: {
    list: {
      method: 'GET' as const,
      path: '/api/planned-meetings' as const,
      responses: {
        200: z.array(z.custom<typeof plannedMeetings.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/planned-meetings' as const,
      input: createInsertSchema(plannedMeetings).omit({ id: true, createdAt: true, userId: true }),
      responses: {
        201: z.custom<typeof plannedMeetings.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/planned-meetings/:id' as const,
      input: createInsertSchema(plannedMeetings).omit({ id: true, createdAt: true, userId: true }).partial(),
      responses: {
        200: z.custom<typeof plannedMeetings.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/planned-meetings/:id' as const,
      responses: {
        200: z.object({ message: z.string() }),
        404: errorSchemas.notFound,
      },
    },
  },
  import: {
    instructors: {
      method: 'POST' as const,
      path: '/api/import/instructors' as const,
      responses: {
        200: z.object({ imported: z.number() }),
        400: errorSchemas.validation,
      },
    },
    courses: {
      method: 'POST' as const,
      path: '/api/import/courses' as const,
      responses: {
        200: z.object({ imported: z.number() }),
        400: errorSchemas.validation,
      },
    },
  },
};

// ============================================
// HELPER FUNCTIONS
// ============================================
export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

// ============================================
// TYPE HELPERS
// ============================================
export type InstructorInput = z.infer<typeof api.instructors.create.input>;
export type CourseInput = z.infer<typeof api.courses.create.input>;
export type OfficeHourInput = z.infer<typeof api.officeHours.create.input>;
export type VisitInput = z.infer<typeof api.visits.create.input>;
export type InteractionInput = z.infer<typeof api.interactions.create.input>;
export type PlannedMeetingInput = z.infer<typeof api.plannedMeetings.create.input>;
