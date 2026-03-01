import { pgTable, text, serial, integer, boolean, timestamp, time, date, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";
export * from "./models/auth";

// === ENUMS ===

export const tenureStatusEnum = pgEnum("tenure_status", ["tenured", "tenure_track", "adjunct", "visiting", "unknown"]);
export const schedDayOfWeekEnum = pgEnum("sched_day_of_week", ["mon", "tue", "wed", "thu", "fri"]);
export const lmsPlatformEnum = pgEnum("lms_platform", ["canvas", "blackboard", "d2l", "moodle", "other", "unknown"]);
export const scrapeJobTypeEnum = pgEnum("scrape_job_type", ["faculty_directory", "course_schedule", "rmp", "linkedin", "syllabus", "institution_it"]);
export const scrapeJobStatusEnum = pgEnum("scrape_job_status", ["pending", "running", "complete", "failed"]);

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

export const departments = pgTable("departments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  institutionId: integer("institution_id").references(() => institutions.id).notNull(),
});

export const instructors = pgTable("instructors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  email: text("email"),
  phone: text("phone"),
  linkedinUrl: text("linkedin_url"),
  departmentId: integer("department_id").references(() => departments.id),
  officeLocation: text("office_location"),
  bio: text("bio"),
  notes: text("notes"),
  targetPriority: text("target_priority").default("medium"),
  researchInterests: text("research_interests").array(),
  publicationsCount: integer("publications_count"),
  yearsAtInstitution: integer("years_at_institution"),
  tenureStatus: tenureStatusEnum("tenure_status").default("unknown"),
  personalWebsite: text("personal_website"),
  photoUrl: text("photo_url"),
  lastScrapedAt: timestamp("last_scraped_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const courses = pgTable("courses", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  term: text("term").notNull(),
  format: text("format").notNull(),
  enrollment: integer("enrollment").default(0),
  departmentId: integer("department_id").references(() => departments.id),
  daysOfWeek: text("days_of_week"),
  lectureStartTime: time("lecture_start_time"),
  lectureEndTime: time("lecture_end_time"),
  building: text("building"),
  room: text("room"),
});

export const courseInstructors = pgTable("course_instructors", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").references(() => courses.id).notNull(),
  instructorId: integer("instructor_id").references(() => instructors.id).notNull(),
  role: text("role").default("primary"),
});

export const officeHours = pgTable("office_hours", {
  id: serial("id").primaryKey(),
  instructorId: integer("instructor_id").references(() => instructors.id).notNull(),
  dayOfWeek: text("day_of_week").notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  location: text("location"),
  isVirtual: boolean("is_virtual").default(false),
});

export const visits = pgTable("visits", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  location: text("location").notNull(),
  notes: text("notes"),
  userId: text("user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const visitInteractions = pgTable("visit_interactions", {
  id: serial("id").primaryKey(),
  visitId: integer("visit_id").references(() => visits.id).notNull(),
  instructorId: integer("instructor_id").references(() => instructors.id).notNull(),
  outcome: text("outcome"),
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
  courseId: integer("course_id").references(() => courses.id),
  hubspotContactId: text("hubspot_contact_id"),
  lastSyncedAt: timestamp("last_synced_at").defaultNow(),
});

export const instructorSchedules = pgTable("instructor_schedules", {
  id: serial("id").primaryKey(),
  instructorId: integer("instructor_id").references(() => instructors.id).notNull(),
  courseId: integer("course_id").references(() => courses.id),
  dayOfWeek: schedDayOfWeekEnum("day_of_week").notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  building: text("building"),
  roomNumber: text("room_number"),
  semester: text("semester"),
  scrapedAt: timestamp("scraped_at").defaultNow(),
});

export const courseDetails = pgTable("course_details", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").references(() => courses.id).notNull(),
  enrollmentCount: integer("enrollment_count"),
  maxEnrollment: integer("max_enrollment"),
  textbook: text("textbook"),
  courseware: text("courseware"),
  lmsPlatform: lmsPlatformEnum("lms_platform").default("unknown"),
  syllabusUrl: text("syllabus_url"),
  semester: text("semester"),
  scrapedAt: timestamp("scraped_at").defaultNow(),
});

export const institutionDetails = pgTable("institution_details", {
  id: serial("id").primaryKey(),
  institutionId: integer("institution_id").references(() => institutions.id).notNull(),
  itContactName: text("it_contact_name"),
  itContactEmail: text("it_contact_email"),
  procurementContactName: text("procurement_contact_name"),
  procurementContactEmail: text("procurement_contact_email"),
  budgetCycleStartMonth: integer("budget_cycle_start_month"),
  currentVendors: text("current_vendors").array(),
  lmsPlatform: lmsPlatformEnum("lms_platform").default("unknown"),
  totalEnrollment: integer("total_enrollment"),
  scrapedAt: timestamp("scraped_at").defaultNow(),
});

export const scrapeJobs = pgTable("scrape_jobs", {
  id: serial("id").primaryKey(),
  institutionId: integer("institution_id").references(() => institutions.id).notNull(),
  jobType: scrapeJobTypeEnum("job_type").notNull(),
  status: scrapeJobStatusEnum("status").default("pending").notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  errorMessage: text("error_message"),
  recordsAdded: integer("records_added"),
});

// === RELATIONS ===

export const institutionsRelations = relations(institutions, ({ many }) => ({
  departments: many(departments),
  details: many(institutionDetails),
  scrapeJobs: many(scrapeJobs),
}));

export const departmentsRelations = relations(departments, ({ one, many }) => ({
  institution: one(institutions, {
    fields: [departments.institutionId],
    references: [institutions.id],
  }),
  instructors: many(instructors),
  courses: many(courses),
}));

export const instructorsRelations = relations(instructors, ({ one, many }) => ({
  department: one(departments, {
    fields: [instructors.departmentId],
    references: [departments.id],
  }),
  courseInstructors: many(courseInstructors),
  officeHours: many(officeHours),
  interactions: many(visitInteractions),
  plannedMeetings: many(plannedMeetings),
  deals: many(deals),
  schedules: many(instructorSchedules),
}));

export const coursesRelations = relations(courses, ({ one, many }) => ({
  department: one(departments, {
    fields: [courses.departmentId],
    references: [departments.id],
  }),
  courseInstructors: many(courseInstructors),
  deals: many(deals),
  details: many(courseDetails),
  instructorSchedules: many(instructorSchedules),
}));

export const courseInstructorsRelations = relations(courseInstructors, ({ one }) => ({
  course: one(courses, {
    fields: [courseInstructors.courseId],
    references: [courses.id],
  }),
  instructor: one(instructors, {
    fields: [courseInstructors.instructorId],
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
  course: one(courses, {
    fields: [deals.courseId],
    references: [courses.id],
  }),
}));

export const instructorSchedulesRelations = relations(instructorSchedules, ({ one }) => ({
  instructor: one(instructors, {
    fields: [instructorSchedules.instructorId],
    references: [instructors.id],
  }),
  course: one(courses, {
    fields: [instructorSchedules.courseId],
    references: [courses.id],
  }),
}));

export const courseDetailsRelations = relations(courseDetails, ({ one }) => ({
  course: one(courses, {
    fields: [courseDetails.courseId],
    references: [courses.id],
  }),
}));

export const institutionDetailsRelations = relations(institutionDetails, ({ one }) => ({
  institution: one(institutions, {
    fields: [institutionDetails.institutionId],
    references: [institutions.id],
  }),
}));

export const scrapeJobsRelations = relations(scrapeJobs, ({ one }) => ({
  institution: one(institutions, {
    fields: [scrapeJobs.institutionId],
    references: [institutions.id],
  }),
}));

// === BASE SCHEMAS ===

export const insertInstitutionSchema = createInsertSchema(institutions).omit({ id: true });
export const insertDepartmentSchema = createInsertSchema(departments).omit({ id: true });
export const insertInstructorSchema = createInsertSchema(instructors).omit({ id: true, createdAt: true });
export const insertCourseSchema = createInsertSchema(courses).omit({ id: true });
export const insertCourseInstructorSchema = createInsertSchema(courseInstructors).omit({ id: true });
export const insertOfficeHourSchema = createInsertSchema(officeHours).omit({ id: true });
export const insertVisitSchema = createInsertSchema(visits).omit({ id: true, createdAt: true });
export const insertVisitInteractionSchema = createInsertSchema(visitInteractions).omit({ id: true });
export const insertPlannedMeetingSchema = createInsertSchema(plannedMeetings).omit({ id: true, createdAt: true });
export const insertDealSchema = createInsertSchema(deals).omit({ id: true, lastSyncedAt: true });
export const insertInstructorScheduleSchema = createInsertSchema(instructorSchedules).omit({ id: true, scrapedAt: true });
export const insertCourseDetailsSchema = createInsertSchema(courseDetails).omit({ id: true, scrapedAt: true });
export const insertInstitutionDetailsSchema = createInsertSchema(institutionDetails).omit({ id: true, scrapedAt: true });
export const insertScrapeJobSchema = createInsertSchema(scrapeJobs).omit({ id: true });

// === EXPLICIT API CONTRACT TYPES ===

export type Institution = typeof institutions.$inferSelect;
export type InsertInstitution = z.infer<typeof insertInstitutionSchema>;
export type Department = typeof departments.$inferSelect;
export type InsertDepartment = z.infer<typeof insertDepartmentSchema>;
export type Instructor = typeof instructors.$inferSelect;
export type InsertInstructor = z.infer<typeof insertInstructorSchema>;
export type Course = typeof courses.$inferSelect;
export type InsertCourse = z.infer<typeof insertCourseSchema>;
export type CourseInstructor = typeof courseInstructors.$inferSelect;
export type InsertCourseInstructor = z.infer<typeof insertCourseInstructorSchema>;
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
export type InstructorSchedule = typeof instructorSchedules.$inferSelect;
export type InsertInstructorSchedule = z.infer<typeof insertInstructorScheduleSchema>;
export type CourseDetails = typeof courseDetails.$inferSelect;
export type InsertCourseDetails = z.infer<typeof insertCourseDetailsSchema>;
export type InstitutionDetails = typeof institutionDetails.$inferSelect;
export type InsertInstitutionDetails = z.infer<typeof insertInstitutionDetailsSchema>;
export type ScrapeJob = typeof scrapeJobs.$inferSelect;
export type InsertScrapeJob = z.infer<typeof insertScrapeJobSchema>;

// Complex types for UI
export type DepartmentWithInstitution = Department & {
  institution: Institution;
};

export type InstructorWithDetails = Instructor & {
  courses: Course[];
  officeHours: OfficeHour[];
  department: DepartmentWithInstitution | null;
};

export type VisitWithInteractions = Visit & {
  interactions: (VisitInteraction & { instructor: Instructor })[];
};

export type PlannedMeetingWithInstructor = PlannedMeeting & {
  instructor: Instructor;
};
