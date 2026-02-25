import {
  institutions,
  departments,
  instructors,
  courses,
  courseInstructors,
  officeHours,
  visits,
  visitInteractions,
  plannedMeetings,
  deals,
  type Institution,
  type InsertInstitution,
  type Department,
  type InsertDepartment,
  type DepartmentWithInstitution,
  type Instructor,
  type InsertInstructor,
  type InstructorWithDetails,
  type Course,
  type InsertCourse,
  type CourseInstructor,
  type InsertCourseInstructor,
  type OfficeHour,
  type InsertOfficeHour,
  type Visit,
  type InsertVisit,
  type VisitInteraction,
  type InsertVisitInteraction,
  type PlannedMeeting,
  type InsertPlannedMeeting,
  type Deal,
  type InsertDeal,
} from "@shared/schema";
import { db } from "./db";
import { eq, like, or, and, inArray } from "drizzle-orm";

export interface IStorage {
  // Institutions
  getInstitutions(filters?: { classification?: string; state?: string; search?: string }): Promise<Institution[]>;
  seedInstitutions(items: InsertInstitution[]): Promise<number>;

  // Departments
  getDepartments(institutionId?: number): Promise<DepartmentWithInstitution[]>;
  getDepartment(id: number): Promise<DepartmentWithInstitution | undefined>;
  createDepartment(dept: InsertDepartment): Promise<Department>;
  findOrCreateDepartment(institutionName: string, departmentName: string): Promise<Department>;

  // Instructors
  getInstructors(filters?: { departmentId?: number; institutionId?: number; targetPriority?: string; search?: string }): Promise<InstructorWithDetails[]>;
  getInstructor(id: number): Promise<Instructor | undefined>;
  createInstructor(instructor: InsertInstructor): Promise<Instructor>;
  updateInstructor(id: number, updates: Partial<InsertInstructor>): Promise<Instructor>;
  deleteInstructor(id: number): Promise<void>;

  // Courses
  getCourses(instructorId?: number): Promise<Course[]>;
  createCourse(course: InsertCourse): Promise<Course>;
  updateCourse(id: number, updates: Partial<InsertCourse>): Promise<Course>;
  deleteCourse(id: number): Promise<void>;

  // Course-Instructor links
  getCourseInstructors(courseId?: number): Promise<CourseInstructor[]>;
  addCourseInstructor(link: InsertCourseInstructor): Promise<CourseInstructor>;
  removeCourseInstructor(id: number): Promise<void>;

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

  // Deals
  getDealsByInstructor(instructorId: number): Promise<Deal[]>;
  getAllDeals(): Promise<Deal[]>;
  upsertDeal(deal: InsertDeal): Promise<Deal>;
  deleteDeal(id: number): Promise<void>;

  // Lookup
  getInstructorByEmail(email: string): Promise<Instructor | undefined>;
  getInstructorByName(name: string): Promise<Instructor | undefined>;
  bulkCreateInstructors(items: { name: string; email?: string | null; institutionName?: string | null; departmentName?: string | null; departmentId?: number | null; officeLocation?: string | null; bio?: string | null; notes?: string | null; targetPriority?: string | null }[]): Promise<{ created: Instructor[]; existing: Instructor[]; updated: Instructor[]; skippedCount: number }>;
  bulkCreateCourses(items: InsertCourse[]): Promise<Course[]>;
}

export class DatabaseStorage implements IStorage {
  // Institutions
  async getInstitutions(filters?: { classification?: string; state?: string; search?: string }): Promise<Institution[]> {
    const conditions = [];
    if (filters?.classification) {
      conditions.push(eq(institutions.classification, filters.classification));
    }
    if (filters?.state) {
      conditions.push(eq(institutions.state, filters.state));
    }
    if (filters?.search) {
      conditions.push(like(institutions.name, `%${filters.search}%`));
    }
    if (conditions.length > 0) {
      return db.select().from(institutions).where(and(...conditions));
    }
    return db.select().from(institutions);
  }

  async seedInstitutions(items: InsertInstitution[]): Promise<number> {
    let count = 0;
    for (const item of items) {
      try {
        await db.insert(institutions).values(item).onConflictDoNothing();
        count++;
      } catch {
      }
    }
    return count;
  }

  // Departments
  async getDepartments(institutionId?: number): Promise<DepartmentWithInstitution[]> {
    const allDepts = institutionId
      ? await db.select().from(departments).where(eq(departments.institutionId, institutionId))
      : await db.select().from(departments);

    const instIds = Array.from(new Set(allDepts.map(d => d.institutionId)));
    const allInsts = instIds.length > 0
      ? await db.select().from(institutions).where(inArray(institutions.id, instIds))
      : [];
    const instMap = new Map(allInsts.map(i => [i.id, i]));

    return allDepts.map(d => ({
      ...d,
      institution: instMap.get(d.institutionId)!,
    }));
  }

  async getDepartment(id: number): Promise<DepartmentWithInstitution | undefined> {
    const [dept] = await db.select().from(departments).where(eq(departments.id, id));
    if (!dept) return undefined;
    const [inst] = await db.select().from(institutions).where(eq(institutions.id, dept.institutionId));
    return { ...dept, institution: inst };
  }

  async createDepartment(dept: InsertDepartment): Promise<Department> {
    const [newDept] = await db.insert(departments).values(dept).returning();
    return newDept;
  }

  async findOrCreateDepartment(institutionName: string, departmentName: string): Promise<Department> {
    const deptNameClean = (departmentName || "General").trim() || "General";
    const instNameClean = (institutionName || "").trim();

    let instId: number | undefined;
    if (instNameClean) {
      const [existing] = await db.select().from(institutions).where(eq(institutions.name, instNameClean));
      if (existing) {
        instId = existing.id;
      } else {
        const [created] = await db.insert(institutions).values({ name: instNameClean }).returning();
        instId = created.id;
      }
    }

    if (!instId) {
      const [unassigned] = await db.select().from(institutions).where(eq(institutions.name, "Unassigned"));
      if (unassigned) {
        instId = unassigned.id;
      } else {
        const [created] = await db.insert(institutions).values({ name: "Unassigned" }).returning();
        instId = created.id;
      }
    }

    const existingDepts = await db.select().from(departments).where(
      and(eq(departments.name, deptNameClean), eq(departments.institutionId, instId))
    );
    if (existingDepts.length > 0) {
      return existingDepts[0];
    }

    const [newDept] = await db.insert(departments).values({
      name: deptNameClean,
      institutionId: instId,
    }).returning();
    return newDept;
  }

  // Instructors
  async getInstructors(filters?: { departmentId?: number; institutionId?: number; targetPriority?: string; search?: string }): Promise<InstructorWithDetails[]> {
    let allInstructorRows: Instructor[];

    if (filters?.institutionId) {
      const deptRows = await db.select().from(departments).where(eq(departments.institutionId, filters.institutionId));
      const deptIds = deptRows.map(d => d.id);
      if (deptIds.length === 0) return [];
      const conditions = [inArray(instructors.departmentId, deptIds)];
      if (filters.targetPriority) conditions.push(eq(instructors.targetPriority, filters.targetPriority));
      if (filters.search) {
        conditions.push(or(
          like(instructors.name, `%${filters.search}%`),
          like(instructors.bio, `%${filters.search}%`)
        )!);
      }
      allInstructorRows = await db.select().from(instructors).where(and(...conditions));
    } else {
      const conditions = [];
      if (filters?.departmentId) conditions.push(eq(instructors.departmentId, filters.departmentId));
      if (filters?.targetPriority) conditions.push(eq(instructors.targetPriority, filters.targetPriority));
      if (filters?.search) {
        conditions.push(or(
          like(instructors.name, `%${filters.search}%`),
          like(instructors.bio, `%${filters.search}%`)
        )!);
      }
      allInstructorRows = conditions.length > 0
        ? await db.select().from(instructors).where(and(...conditions))
        : await db.select().from(instructors);
    }

    const allCourseInstructors = await db.select().from(courseInstructors);
    const allCourses = await db.select().from(courses);
    const allOfficeHours = await db.select().from(officeHours);

    const coursesByCI = new Map<number, number[]>();
    for (const ci of allCourseInstructors) {
      const list = coursesByCI.get(ci.instructorId) || [];
      list.push(ci.courseId);
      coursesByCI.set(ci.instructorId, list);
    }

    const courseMap = new Map(allCourses.map(c => [c.id, c]));

    const ohByInstructor = new Map<number, OfficeHour[]>();
    for (const oh of allOfficeHours) {
      const list = ohByInstructor.get(oh.instructorId) || [];
      list.push(oh);
      ohByInstructor.set(oh.instructorId, list);
    }

    const allDepts = await db.select().from(departments);
    const allInsts = await db.select().from(institutions);
    const instMap = new Map(allInsts.map(i => [i.id, i]));
    const deptMap = new Map<number, DepartmentWithInstitution>();
    for (const d of allDepts) {
      deptMap.set(d.id, { ...d, institution: instMap.get(d.institutionId)! });
    }

    return allInstructorRows.map(inst => {
      const courseIds = coursesByCI.get(inst.id) || [];
      const instCourses = courseIds.map(id => courseMap.get(id)).filter(Boolean) as Course[];

      return {
        ...inst,
        courses: instCourses,
        officeHours: ohByInstructor.get(inst.id) || [],
        department: inst.departmentId ? deptMap.get(inst.departmentId) || null : null,
      };
    });
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
    await db.delete(courseInstructors).where(eq(courseInstructors.instructorId, id));
    await db.delete(visitInteractions).where(eq(visitInteractions.instructorId, id));
    await db.delete(plannedMeetings).where(eq(plannedMeetings.instructorId, id));
    await db.delete(instructors).where(eq(instructors.id, id));
  }

  // Courses
  async getCourses(instructorId?: number): Promise<Course[]> {
    if (instructorId) {
      const links = await db.select().from(courseInstructors).where(eq(courseInstructors.instructorId, instructorId));
      const courseIds = links.map(l => l.courseId);
      if (courseIds.length === 0) return [];
      return db.select().from(courses).where(inArray(courses.id, courseIds));
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
    await db.delete(courseInstructors).where(eq(courseInstructors.courseId, id));
    await db.delete(courses).where(eq(courses.id, id));
  }

  // Course-Instructor links
  async getCourseInstructors(courseId?: number): Promise<CourseInstructor[]> {
    if (courseId) {
      return db.select().from(courseInstructors).where(eq(courseInstructors.courseId, courseId));
    }
    return db.select().from(courseInstructors);
  }

  async addCourseInstructor(link: InsertCourseInstructor): Promise<CourseInstructor> {
    const [created] = await db.insert(courseInstructors).values(link).returning();
    return created;
  }

  async removeCourseInstructor(id: number): Promise<void> {
    await db.delete(courseInstructors).where(eq(courseInstructors.id, id));
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

  async getInstructorByEmail(email: string): Promise<Instructor | undefined> {
    const [instructor] = await db.select().from(instructors).where(eq(instructors.email, email));
    return instructor;
  }

  async getInstructorByName(name: string): Promise<Instructor | undefined> {
    const [instructor] = await db.select().from(instructors).where(eq(instructors.name, name));
    return instructor;
  }

  async getDealsByInstructor(instructorId: number): Promise<Deal[]> {
    return await db.select().from(deals).where(eq(deals.instructorId, instructorId));
  }

  async getAllDeals(): Promise<Deal[]> {
    return await db.select().from(deals);
  }

  async upsertDeal(deal: InsertDeal): Promise<Deal> {
    const [existing] = await db.select().from(deals).where(eq(deals.hubspotDealId, deal.hubspotDealId));
    if (existing) {
      const [updated] = await db.update(deals).set({
        dealName: deal.dealName,
        stage: deal.stage,
        amount: deal.amount,
        instructorId: deal.instructorId,
        courseId: deal.courseId,
        hubspotContactId: deal.hubspotContactId,
        lastSyncedAt: new Date(),
      }).where(eq(deals.id, existing.id)).returning();
      return updated;
    }
    const [created] = await db.insert(deals).values(deal).returning();
    return created;
  }

  async deleteDeal(id: number): Promise<void> {
    await db.delete(deals).where(eq(deals.id, id));
  }

  async bulkCreateInstructors(items: { name: string; email?: string | null; institutionName?: string | null; departmentName?: string | null; departmentId?: number | null; officeLocation?: string | null; bio?: string | null; notes?: string | null; targetPriority?: string | null }[]): Promise<{ created: Instructor[]; existing: Instructor[]; updated: Instructor[]; skippedCount: number }> {
    if (items.length === 0) return { created: [], existing: [], updated: [], skippedCount: 0 };

    const allExisting = await db.select().from(instructors);
    const existingNames = new Set(allExisting.map(i => i.name.toLowerCase().trim()));

    const toCreate: InsertInstructor[] = [];
    const alreadyExisting: Instructor[] = [];
    const updatedInstructors: Instructor[] = [];

    for (const item of items) {
      let deptId = item.departmentId || null;
      if (!deptId && (item.institutionName || item.departmentName)) {
        const dept = await this.findOrCreateDepartment(
          item.institutionName || "",
          item.departmentName || "General"
        );
        deptId = dept.id;
      }

      const normalizedName = item.name.toLowerCase().trim();
      const match = allExisting.find(e => e.name.toLowerCase().trim() === normalizedName);

      if (match) {
        const updates: Partial<InsertInstructor> = {};
        if (item.email && !match.email) updates.email = item.email;
        if (deptId && !match.departmentId) updates.departmentId = deptId;
        if (item.officeLocation && !match.officeLocation) updates.officeLocation = item.officeLocation;
        if (item.bio && !match.bio) updates.bio = item.bio;
        if (item.notes && !match.notes) updates.notes = item.notes;

        if (Object.keys(updates).length > 0) {
          const updated = await this.updateInstructor(match.id, updates);
          updatedInstructors.push(updated);
        } else {
          alreadyExisting.push(match);
        }
      } else if (!existingNames.has(normalizedName)) {
        toCreate.push({
          name: item.name,
          email: item.email || null,
          departmentId: deptId,
          officeLocation: item.officeLocation || null,
          bio: item.bio || null,
          notes: item.notes || null,
          targetPriority: item.targetPriority || "medium",
        });
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
