import {
  instructors,
  courses,
  officeHours,
  visits,
  visitInteractions,
  plannedMeetings,
  type Instructor,
  type InsertInstructor,
  type Course,
  type InsertCourse,
  type OfficeHour,
  type InsertOfficeHour,
  type Visit,
  type InsertVisit,
  type VisitInteraction,
  type InsertVisitInteraction,
  type PlannedMeeting,
  type InsertPlannedMeeting,
} from "@shared/schema";
import { db } from "./db";
import { eq, like, or, and } from "drizzle-orm";

export interface IStorage {
  // Instructors
  getInstructors(filters?: { department?: string; institution?: string; targetPriority?: string; search?: string }): Promise<Instructor[]>;
  getInstructor(id: number): Promise<Instructor | undefined>;
  createInstructor(instructor: InsertInstructor): Promise<Instructor>;
  updateInstructor(id: number, updates: Partial<InsertInstructor>): Promise<Instructor>;
  deleteInstructor(id: number): Promise<void>;

  // Courses
  getCourses(instructorId?: number): Promise<Course[]>;
  createCourse(course: InsertCourse): Promise<Course>;
  updateCourse(id: number, updates: Partial<InsertCourse>): Promise<Course>;
  deleteCourse(id: number): Promise<void>;

  // Office Hours
  getOfficeHours(instructorId?: number): Promise<OfficeHour[]>;
  createOfficeHour(officeHour: InsertOfficeHour): Promise<OfficeHour>;
  updateOfficeHour(id: number, updates: Partial<InsertOfficeHour>): Promise<OfficeHour>;
  deleteOfficeHour(id: number): Promise<void>;

  // Visits
  getVisits(userId: string): Promise<Visit[]>;
  createVisit(visit: InsertVisit & { userId: string }): Promise<Visit>;
  
  // Interactions
  createInteraction(interaction: InsertVisitInteraction): Promise<VisitInteraction>;

  // Planned Meetings
  getPlannedMeetings(userId: string, date?: string): Promise<PlannedMeeting[]>;
  createPlannedMeeting(meeting: InsertPlannedMeeting): Promise<PlannedMeeting>;
  updatePlannedMeeting(id: number, updates: Partial<InsertPlannedMeeting>): Promise<PlannedMeeting>;
  deletePlannedMeeting(id: number): Promise<void>;

  // Bulk operations
  getInstructorByName(name: string): Promise<Instructor | undefined>;
  bulkCreateInstructors(items: InsertInstructor[]): Promise<{ created: Instructor[]; existing: Instructor[]; updated: Instructor[]; skippedCount: number }>;
  bulkCreateCourses(items: InsertCourse[]): Promise<Course[]>;
}

export class DatabaseStorage implements IStorage {
  // Instructors
  async getInstructors(filters?: { department?: string; institution?: string; targetPriority?: string; search?: string }): Promise<Instructor[]> {
    let query = db.select().from(instructors);
    
    const conditions = [];
    if (filters?.department) conditions.push(eq(instructors.department, filters.department));
    if (filters?.institution) conditions.push(eq(instructors.institution, filters.institution));
    if (filters?.targetPriority) conditions.push(eq(instructors.targetPriority, filters.targetPriority));
    if (filters?.search) {
      conditions.push(or(
        like(instructors.name, `%${filters.search}%`),
        like(instructors.bio, `%${filters.search}%`)
      ));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    return await query;
  }

  async getInstructor(id: number): Promise<Instructor | undefined> {
    const [instructor] = await db.select().from(instructors).where(eq(instructors.id, id));
    return instructor;
  }

  async createInstructor(instructor: InsertInstructor): Promise<Instructor> {
    const existing = await this.getInstructorByName(instructor.name);
    if (existing) {
      return existing;
    }
    const [newInstructor] = await db.insert(instructors).values(instructor).returning();
    return newInstructor;
  }

  async updateInstructor(id: number, updates: Partial<InsertInstructor>): Promise<Instructor> {
    const [updated] = await db.update(instructors).set(updates).where(eq(instructors.id, id)).returning();
    return updated;
  }

  async deleteInstructor(id: number): Promise<void> {
    await db.delete(officeHours).where(eq(officeHours.instructorId, id));
    await db.delete(courses).where(eq(courses.instructorId, id));
    await db.delete(visitInteractions).where(eq(visitInteractions.instructorId, id));
    await db.delete(plannedMeetings).where(eq(plannedMeetings.instructorId, id));
    await db.delete(instructors).where(eq(instructors.id, id));
  }

  // Courses
  async getCourses(instructorId?: number): Promise<Course[]> {
    if (instructorId) {
      return await db.select().from(courses).where(eq(courses.instructorId, instructorId));
    }
    return await db.select().from(courses);
  }

  async createCourse(course: InsertCourse): Promise<Course> {
    const [newCourse] = await db.insert(courses).values(course).returning();
    return newCourse;
  }

  async updateCourse(id: number, updates: Partial<InsertCourse>): Promise<Course> {
    const [updated] = await db.update(courses).set(updates).where(eq(courses.id, id)).returning();
    return updated;
  }

  async deleteCourse(id: number): Promise<void> {
    await db.delete(courses).where(eq(courses.id, id));
  }

  // Office Hours
  async getOfficeHours(instructorId?: number): Promise<OfficeHour[]> {
    if (instructorId) {
      return await db.select().from(officeHours).where(eq(officeHours.instructorId, instructorId));
    }
    return await db.select().from(officeHours);
  }

  async createOfficeHour(officeHour: InsertOfficeHour): Promise<OfficeHour> {
    const [newOH] = await db.insert(officeHours).values(officeHour).returning();
    return newOH;
  }

  async updateOfficeHour(id: number, updates: Partial<InsertOfficeHour>): Promise<OfficeHour> {
    const [updated] = await db.update(officeHours).set(updates).where(eq(officeHours.id, id)).returning();
    return updated;
  }

  async deleteOfficeHour(id: number): Promise<void> {
    await db.delete(officeHours).where(eq(officeHours.id, id));
  }

  // Visits
  async getVisits(userId: string): Promise<Visit[]> {
    return await db.select().from(visits).where(eq(visits.userId, userId));
  }

  async createVisit(visit: InsertVisit & { userId: string }): Promise<Visit> {
    const [newVisit] = await db.insert(visits).values(visit).returning();
    return newVisit;
  }

  // Interactions
  async createInteraction(interaction: InsertVisitInteraction): Promise<VisitInteraction> {
    const [newInteraction] = await db.insert(visitInteractions).values(interaction).returning();
    return newInteraction;
  }

  // Planned Meetings
  async getPlannedMeetings(userId: string, date?: string): Promise<PlannedMeeting[]> {
    const conditions = [eq(plannedMeetings.userId, userId)];
    if (date) conditions.push(eq(plannedMeetings.date, date));
    return await db.select().from(plannedMeetings).where(and(...conditions));
  }

  async createPlannedMeeting(meeting: InsertPlannedMeeting): Promise<PlannedMeeting> {
    const [newMeeting] = await db.insert(plannedMeetings).values(meeting).returning();
    return newMeeting;
  }

  async updatePlannedMeeting(id: number, updates: Partial<InsertPlannedMeeting>): Promise<PlannedMeeting> {
    const [updated] = await db.update(plannedMeetings).set(updates).where(eq(plannedMeetings.id, id)).returning();
    return updated;
  }

  async deletePlannedMeeting(id: number): Promise<void> {
    await db.delete(plannedMeetings).where(eq(plannedMeetings.id, id));
  }

  async getInstructorByName(name: string): Promise<Instructor | undefined> {
    const [instructor] = await db.select().from(instructors).where(eq(instructors.name, name));
    return instructor;
  }

  async bulkCreateInstructors(items: InsertInstructor[]): Promise<{ created: Instructor[]; existing: Instructor[]; updated: Instructor[]; skippedCount: number }> {
    if (items.length === 0) return { created: [], existing: [], updated: [], skippedCount: 0 };

    const allExisting = await db.select().from(instructors);
    const existingNames = new Set(allExisting.map(i => i.name.toLowerCase().trim()));

    const toCreate: InsertInstructor[] = [];
    const alreadyExisting: Instructor[] = [];
    const updatedInstructors: Instructor[] = [];

    for (let i = 0; i < items.length; i++) {
      const normalizedName = items[i].name.toLowerCase().trim();
      const match = allExisting.find(e => e.name.toLowerCase().trim() === normalizedName);
      if (match) {
        const updates: Partial<InsertInstructor> = {};
        const fields: (keyof InsertInstructor)[] = ["email", "department", "institution", "officeLocation", "bio", "notes", "targetPriority"];
        for (const field of fields) {
          const newVal = items[i][field];
          const existingVal = match[field as keyof Instructor];
          if (newVal && String(newVal).trim() && (!existingVal || !String(existingVal).trim())) {
            (updates as any)[field] = newVal;
          }
        }
        if (Object.keys(updates).length > 0) {
          const updated = await this.updateInstructor(match.id, updates);
          updatedInstructors.push(updated);
        } else {
          alreadyExisting.push(match);
        }
      } else if (!existingNames.has(normalizedName)) {
        toCreate.push(items[i]);
        existingNames.add(normalizedName);
      }
    }

    const newlyCreated = toCreate.length > 0
      ? await db.insert(instructors).values(toCreate).returning()
      : [];

    return { created: newlyCreated, existing: alreadyExisting, updated: updatedInstructors, skippedCount: alreadyExisting.length };
  }

  async bulkCreateCourses(items: InsertCourse[]): Promise<Course[]> {
    if (items.length === 0) return [];
    return await db.insert(courses).values(items).returning();
  }
}

export const storage = new DatabaseStorage();
