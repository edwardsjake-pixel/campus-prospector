import {
  instructors,
  courses,
  officeHours,
  visits,
  visitInteractions,
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
} from "@shared/schema";
import { db } from "./db";
import { eq, like, or, and } from "drizzle-orm";

export interface IStorage {
  // Instructors
  getInstructors(filters?: { department?: string; targetPriority?: string; search?: string }): Promise<Instructor[]>;
  getInstructor(id: number): Promise<Instructor | undefined>;
  createInstructor(instructor: InsertInstructor): Promise<Instructor>;
  updateInstructor(id: number, updates: Partial<InsertInstructor>): Promise<Instructor>;

  // Courses
  getCourses(instructorId?: number): Promise<Course[]>;
  createCourse(course: InsertCourse): Promise<Course>;

  // Office Hours
  getOfficeHours(instructorId?: number): Promise<OfficeHour[]>;
  createOfficeHour(officeHour: InsertOfficeHour): Promise<OfficeHour>;

  // Visits
  getVisits(userId: string): Promise<Visit[]>;
  createVisit(visit: InsertVisit & { userId: string }): Promise<Visit>;
  
  // Interactions
  createInteraction(interaction: InsertVisitInteraction): Promise<VisitInteraction>;
}

export class DatabaseStorage implements IStorage {
  // Instructors
  async getInstructors(filters?: { department?: string; targetPriority?: string; search?: string }): Promise<Instructor[]> {
    let query = db.select().from(instructors);
    
    const conditions = [];
    if (filters?.department) conditions.push(eq(instructors.department, filters.department));
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
    const [newInstructor] = await db.insert(instructors).values(instructor).returning();
    return newInstructor;
  }

  async updateInstructor(id: number, updates: Partial<InsertInstructor>): Promise<Instructor> {
    const [updated] = await db.update(instructors).set(updates).where(eq(instructors.id, id)).returning();
    return updated;
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
}

export const storage = new DatabaseStorage();
