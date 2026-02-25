import { pgTable, text, serial, integer, boolean, timestamp, time, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";
export * from "./models/auth";

// === TABLE DEFINITIONS ===

export const institutions = pgTable("institutions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  city: text("city"),
  state: text("state"),
  control: text("control"),
  classification: text("classification"),
  domain: text("domain"),
});

export const instructors = pgTable("instructors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  email: text("email"),
  department: text("department"),
  institution: text("institution"),
  officeLocation: text("office_location"),
  bio: text("bio"),
  notes: text("notes"),
  targetPriority: text("target_priority").default("medium"), // low, medium, high
  createdAt: timestamp("created_at").defaultNow(),
});

export const courses = pgTable("courses", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(), // e.g. CS101
  name: text("name").notNull(),
  term: text("term").notNull(), // e.g. Fall 2023
  format: text("format").notNull(), // online, in-person, hybrid
  enrollment: integer("enrollment").default(0),
  instructorId: integer("instructor_id").references(() => instructors.id),
  daysOfWeek: text("days_of_week"), // comma-separated: "Monday,Wednesday,Friday"
  lectureStartTime: time("lecture_start_time"),
  lectureEndTime: time("lecture_end_time"),
  building: text("building"),
  room: text("room"),
});

export const officeHours = pgTable("office_hours", {
  id: serial("id").primaryKey(),
  instructorId: integer("instructor_id").references(() => instructors.id).notNull(),
  dayOfWeek: text("day_of_week").notNull(), // Monday, Tuesday, etc.
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  location: text("location"), // Can override instructor office
  isVirtual: boolean("is_virtual").default(false),
});

export const visits = pgTable("visits", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  location: text("location").notNull(), // Building/Campus
  notes: text("notes"),
  userId: text("user_id").notNull(), // Sales rep ID from auth
  createdAt: timestamp("created_at").defaultNow(),
});

export const visitInteractions = pgTable("visit_interactions", {
  id: serial("id").primaryKey(),
  visitId: integer("visit_id").references(() => visits.id).notNull(),
  instructorId: integer("instructor_id").references(() => instructors.id).notNull(),
  outcome: text("outcome"), // met, left_material, unavailable, follow_up
  notes: text("notes"),
});

export const plannedMeetings = pgTable("planned_meetings", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  instructorId: integer("instructor_id").references(() => instructors.id).notNull(),
  userId: text("user_id").notNull(),
  location: text("location"),
  purpose: text("purpose"),
  status: text("status").default("planned"),
  notes: text("notes"),
  meetingType: text("meeting_type").default("scheduled"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const deals = pgTable("deals", {
  id: serial("id").primaryKey(),
  hubspotDealId: text("hubspot_deal_id").notNull().unique(),
  dealName: text("deal_name").notNull(),
  stage: text("stage"),
  amount: text("amount"),
  closeDate: text("close_date"),
  pipeline: text("pipeline"),
  instructorId: integer("instructor_id").references(() => instructors.id),
  hubspotContactId: text("hubspot_contact_id"),
  lastSyncedAt: timestamp("last_synced_at").defaultNow(),
});

// === RELATIONS ===

export const instructorsRelations = relations(instructors, ({ many }) => ({
  courses: many(courses),
  officeHours: many(officeHours),
  interactions: many(visitInteractions),
  plannedMeetings: many(plannedMeetings),
  deals: many(deals),
}));

export const coursesRelations = relations(courses, ({ one }) => ({
  instructor: one(instructors, {
    fields: [courses.instructorId],
    references: [instructors.id],
  }),
}));

export const officeHoursRelations = relations(officeHours, ({ one }) => ({
  instructor: one(instructors, {
    fields: [officeHours.instructorId],
    references: [instructors.id],
  }),
}));

export const visitsRelations = relations(visits, ({ many }) => ({
  interactions: many(visitInteractions),
}));

export const visitInteractionsRelations = relations(visitInteractions, ({ one }) => ({
  visit: one(visits, {
    fields: [visitInteractions.visitId],
    references: [visits.id],
  }),
  instructor: one(instructors, {
    fields: [visitInteractions.instructorId],
    references: [instructors.id],
  }),
}));

export const plannedMeetingsRelations = relations(plannedMeetings, ({ one }) => ({
  instructor: one(instructors, {
    fields: [plannedMeetings.instructorId],
    references: [instructors.id],
  }),
}));

export const dealsRelations = relations(deals, ({ one }) => ({
  instructor: one(instructors, {
    fields: [deals.instructorId],
    references: [instructors.id],
  }),
}));

// === BASE SCHEMAS ===

export const insertInstitutionSchema = createInsertSchema(institutions).omit({ id: true });
export const insertInstructorSchema = createInsertSchema(instructors).omit({ id: true, createdAt: true });
export const insertCourseSchema = createInsertSchema(courses).omit({ id: true });
export const insertOfficeHourSchema = createInsertSchema(officeHours).omit({ id: true });
export const insertVisitSchema = createInsertSchema(visits).omit({ id: true, createdAt: true });
export const insertVisitInteractionSchema = createInsertSchema(visitInteractions).omit({ id: true });
export const insertPlannedMeetingSchema = createInsertSchema(plannedMeetings).omit({ id: true, createdAt: true });
export const insertDealSchema = createInsertSchema(deals).omit({ id: true, lastSyncedAt: true });

// === EXPLICIT API CONTRACT TYPES ===

export type Institution = typeof institutions.$inferSelect;
export type InsertInstitution = z.infer<typeof insertInstitutionSchema>;
export type Instructor = typeof instructors.$inferSelect;
export type InsertInstructor = z.infer<typeof insertInstructorSchema>;
export type Course = typeof courses.$inferSelect;
export type InsertCourse = z.infer<typeof insertCourseSchema>;
export type OfficeHour = typeof officeHours.$inferSelect;
export type InsertOfficeHour = z.infer<typeof insertOfficeHourSchema>;
export type Visit = typeof visits.$inferSelect;
export type InsertVisit = z.infer<typeof insertVisitSchema>;
export type VisitInteraction = typeof visitInteractions.$inferSelect;
export type InsertVisitInteraction = z.infer<typeof insertVisitInteractionSchema>;
export type PlannedMeeting = typeof plannedMeetings.$inferSelect;
export type InsertPlannedMeeting = z.infer<typeof insertPlannedMeetingSchema>;
export type Deal = typeof deals.$inferSelect;
export type InsertDeal = z.infer<typeof insertDealSchema>;

// Complex types for UI
export type InstructorWithDetails = Instructor & {
  courses: Course[];
  officeHours: OfficeHour[];
};

export type VisitWithInteractions = Visit & {
  interactions: (VisitInteraction & { instructor: Instructor })[];
};

export type PlannedMeetingWithInstructor = PlannedMeeting & {
  instructor: Instructor;
};
