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
  instructorSchedules,
  courseDetails,
  institutionDetails,
  scrapeJobs,
  organizations,
  users,
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
  type InstructorSchedule,
  type InsertInstructorSchedule,
  type CourseDetails,
  type InsertCourseDetails,
  type InstitutionDetails,
  type InsertInstitutionDetails,
  type ScrapeJob,
  type InsertScrapeJob,
  type Organization,
  type InsertOrganization,
} from "@shared/schema";
import { db } from "./db";
import { eq, like, or, and, inArray } from "drizzle-orm";

export interface IStorage {
  // Institutions
  getInstitutions(filters?: { classification?: string; state?: string; search?: string }): Promise<Institution[]>;
  getActiveInstitutionNames(): Promise<string[]>;
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
  getVisits(userId?: string): Promise<Visit[]>;
  createVisit(visit: InsertVisit & { userId: string }): Promise<Visit>;
  
  // Interactions
  createInteraction(interaction: InsertVisitInteraction): Promise<VisitInteraction>;

  // Planned Meetings
  getPlannedMeetings(userId?: string, date?: string): Promise<PlannedMeeting[]>;
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
  seedAllData(data: any): Promise<void>;

  // Scrape Jobs
  createScrapeJob(job: InsertScrapeJob): Promise<ScrapeJob>;
  getScrapeJobs(institutionId?: number): Promise<ScrapeJob[]>;
  getScrapeJob(id: number): Promise<ScrapeJob | undefined>;
  updateScrapeJob(id: number, updates: Partial<ScrapeJob>): Promise<ScrapeJob>;
  getScrapeJobStats(): Promise<{ total: number; pending: number; running: number; complete: number; failed: number }>;

  // Instructor Schedules
  getInstructorSchedules(instructorId: number): Promise<InstructorSchedule[]>;
  createInstructorSchedule(schedule: InsertInstructorSchedule): Promise<InstructorSchedule>;

  // Course Details
  getCourseDetails(courseId: number): Promise<CourseDetails | undefined>;
  upsertCourseDetails(details: InsertCourseDetails): Promise<CourseDetails>;

  // Institution Details
  getInstitutionDetails(institutionId: number): Promise<InstitutionDetails | undefined>;
  upsertInstitutionDetails(details: InsertInstitutionDetails): Promise<InstitutionDetails>;

  // Organizations
  getOrganization(id: number): Promise<Organization | undefined>;
  createOrganization(data: InsertOrganization): Promise<Organization>;
  updateOrganization(id: number, updates: Partial<InsertOrganization>): Promise<Organization>;
  getUserOrganization(userId: string): Promise<Organization | null>;
  setUserOrganization(userId: string, orgId: number): Promise<void>;
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

  async getActiveInstitutionNames(): Promise<string[]> {
    const rows = await db
      .selectDistinct({ name: institutions.name })
      .from(institutions)
      .innerJoin(departments, eq(departments.institutionId, institutions.id))
      .innerJoin(instructors, eq(instructors.departmentId, departments.id));
    return rows.map(r => r.name);
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
        const normalizeForMatch = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
        const normalized = normalizeForMatch(instNameClean);
        const allInsts = await db.select().from(institutions);
        const fuzzyMatch = allInsts.find(i => normalizeForMatch(i.name) === normalized);
        if (fuzzyMatch) {
          instId = fuzzyMatch.id;
        } else {
          const [created] = await db.insert(institutions).values({ name: instNameClean }).returning();
          instId = created.id;
        }
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
  async getVisits(userId?: string): Promise<Visit[]> {
    if (userId) return await db.select().from(visits).where(eq(visits.userId, userId));
    return await db.select().from(visits);
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
  async getPlannedMeetings(userId?: string, date?: string): Promise<PlannedMeeting[]> {
    const conditions = [];
    if (userId) conditions.push(eq(plannedMeetings.userId, userId));
    if (date) conditions.push(eq(plannedMeetings.date, date));
    if (conditions.length === 0) return await db.select().from(plannedMeetings);
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

  async seedAllData(data: any): Promise<void> {
    await db.delete(plannedMeetings);
    await db.delete(visitInteractions);
    await db.delete(visits);
    await db.delete(deals);
    await db.delete(officeHours);
    await db.delete(courseInstructors);
    await db.delete(courses);
    await db.delete(instructors);
    await db.delete(departments);
    console.log("[seed] Cleared existing data for clean seed");

    const idMaps: Record<string, Map<number, number>> = {
      departments: new Map(),
      instructors: new Map(),
      courses: new Map(),
      visits: new Map(),
    };

    if (data.departments?.length) {
      const allInsts = await db.select().from(institutions);
      const instById = new Map(allInsts.map(i => [i.id, i]));
      const instByName = new Map(allInsts.map(i => [i.name, i]));
      const instIdMap = new Map<number, number>();

      for (const dept of data.departments) {
        const oldId = dept.id;
        let targetInstId = dept.institution_id;

        if (!instById.has(targetInstId)) {
          const instName = data._institutionNames?.[String(targetInstId)];
          if (instName) {
            const existing = instByName.get(instName);
            if (existing) {
              targetInstId = existing.id;
            } else {
              const [newInst] = await db.insert(institutions).values({
                name: instName,
                city: "",
                state: "",
                control: "Public",
                classification: "R1",
                domain: "",
              }).returning();
              instById.set(newInst.id, newInst);
              instByName.set(newInst.name, newInst);
              targetInstId = newInst.id;
            }
          }
        }

        const [inserted] = await db.insert(departments).values({
          name: dept.name,
          institutionId: targetInstId,
        }).returning();
        idMaps.departments.set(oldId, inserted.id);
      }
      console.log(`[seed] ${data.departments.length} departments`);
    }

    if (data.instructors?.length) {
      for (const inst of data.instructors) {
        const oldId = inst.id;
        const newDeptId = inst.department_id ? idMaps.departments.get(inst.department_id) : null;
        const [inserted] = await db.insert(instructors).values({
          name: inst.name,
          email: inst.email,
          officeLocation: inst.office_location,
          bio: inst.bio,
          notes: inst.notes,
          targetPriority: inst.target_priority || "medium",
          departmentId: newDeptId || null,
        }).returning();
        idMaps.instructors.set(oldId, inserted.id);
      }
      console.log(`[seed] ${data.instructors.length} instructors`);
    }

    if (data.courses?.length) {
      for (const c of data.courses) {
        const oldId = c.id;
        const newDeptId = c.department_id ? idMaps.departments.get(c.department_id) : null;
        const [inserted] = await db.insert(courses).values({
          code: c.code,
          name: c.name,
          term: c.term,
          format: c.format,
          enrollment: c.enrollment,
          departmentId: newDeptId || null,
          daysOfWeek: c.days_of_week,
          lectureStartTime: c.lecture_start_time,
          lectureEndTime: c.lecture_end_time,
          building: c.building,
          room: c.room,
        }).returning();
        idMaps.courses.set(oldId, inserted.id);
      }
      console.log(`[seed] ${data.courses.length} courses`);
    }

    if (data.course_instructors?.length) {
      for (const ci of data.course_instructors) {
        const newCourseId = idMaps.courses.get(ci.course_id);
        const newInstructorId = idMaps.instructors.get(ci.instructor_id);
        if (newCourseId && newInstructorId) {
          await db.insert(courseInstructors).values({
            courseId: newCourseId,
            instructorId: newInstructorId,
            role: ci.role || "primary",
          });
        }
      }
      console.log(`[seed] ${data.course_instructors.length} course_instructors`);
    }

    if (data.office_hours?.length) {
      for (const oh of data.office_hours) {
        const newInstructorId = idMaps.instructors.get(oh.instructor_id);
        if (newInstructorId) {
          await db.insert(officeHours).values({
            instructorId: newInstructorId,
            dayOfWeek: oh.day_of_week,
            startTime: oh.start_time,
            endTime: oh.end_time,
            location: oh.location,
            isVirtual: oh.is_virtual,
          });
        }
      }
      console.log(`[seed] ${data.office_hours.length} office_hours`);
    }

    if (data.deals?.length) {
      for (const d of data.deals) {
        const newInstructorId = d.instructor_id ? idMaps.instructors.get(d.instructor_id) : null;
        const newCourseId = d.course_id ? idMaps.courses.get(d.course_id) : null;
        await db.insert(deals).values({
          hubspotDealId: d.hubspot_deal_id,
          dealName: d.deal_name,
          stage: d.stage,
          amount: d.amount,
          closeDate: d.close_date,
          pipeline: d.pipeline,
          instructorId: newInstructorId || null,
          courseId: newCourseId || null,
        });
      }
      console.log(`[seed] ${data.deals.length} deals`);
    }

    if (data.visits?.length) {
      for (const v of data.visits) {
        const oldId = v.id;
        const [inserted] = await db.insert(visits).values({
          userId: v.user_id,
          date: v.date,
          location: v.location,
          notes: v.notes,
        }).returning();
        idMaps.visits.set(oldId, inserted.id);
      }
      console.log(`[seed] ${data.visits.length} visits`);
    }

    if (data.planned_meetings?.length) {
      for (const pm of data.planned_meetings) {
        const newInstructorId = pm.instructor_id ? idMaps.instructors.get(pm.instructor_id) : null;
        await db.insert(plannedMeetings).values({
          userId: pm.user_id,
          instructorId: newInstructorId || null,
          date: pm.date,
          startTime: pm.start_time,
          endTime: pm.end_time,
          location: pm.location,
          purpose: pm.purpose,
          status: pm.status,
          meetingType: pm.meeting_type,
          notes: pm.notes,
        });
      }
      console.log(`[seed] ${data.planned_meetings.length} planned_meetings`);
    }
  }

  // Scrape Jobs
  async createScrapeJob(job: InsertScrapeJob): Promise<ScrapeJob> {
    const [created] = await db.insert(scrapeJobs).values(job).returning();
    return created;
  }

  async getScrapeJobs(institutionId?: number): Promise<ScrapeJob[]> {
    if (institutionId) {
      return db.select().from(scrapeJobs).where(eq(scrapeJobs.institutionId, institutionId));
    }
    return db.select().from(scrapeJobs);
  }

  async getScrapeJob(id: number): Promise<ScrapeJob | undefined> {
    const [job] = await db.select().from(scrapeJobs).where(eq(scrapeJobs.id, id));
    return job;
  }

  async updateScrapeJob(id: number, updates: Partial<ScrapeJob>): Promise<ScrapeJob> {
    const [updated] = await db.update(scrapeJobs).set(updates).where(eq(scrapeJobs.id, id)).returning();
    return updated;
  }

  async getScrapeJobStats(): Promise<{ total: number; pending: number; running: number; complete: number; failed: number }> {
    const all = await db.select().from(scrapeJobs);
    return {
      total: all.length,
      pending: all.filter(j => j.status === "pending").length,
      running: all.filter(j => j.status === "running").length,
      complete: all.filter(j => j.status === "complete").length,
      failed: all.filter(j => j.status === "failed").length,
    };
  }

  // Instructor Schedules
  async getInstructorSchedules(instructorId: number): Promise<InstructorSchedule[]> {
    return db.select().from(instructorSchedules).where(eq(instructorSchedules.instructorId, instructorId));
  }

  async createInstructorSchedule(schedule: InsertInstructorSchedule): Promise<InstructorSchedule> {
    const [created] = await db.insert(instructorSchedules).values(schedule).returning();
    return created;
  }

  // Course Details
  async getCourseDetails(courseId: number): Promise<CourseDetails | undefined> {
    const [detail] = await db.select().from(courseDetails).where(eq(courseDetails.courseId, courseId));
    return detail;
  }

  async upsertCourseDetails(details: InsertCourseDetails): Promise<CourseDetails> {
    const existing = await this.getCourseDetails(details.courseId);
    if (existing) {
      const [updated] = await db.update(courseDetails)
        .set({ ...details, scrapedAt: new Date() })
        .where(eq(courseDetails.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(courseDetails).values(details).returning();
    return created;
  }

  // Institution Details
  async getInstitutionDetails(institutionId: number): Promise<InstitutionDetails | undefined> {
    const [detail] = await db.select().from(institutionDetails).where(eq(institutionDetails.institutionId, institutionId));
    return detail;
  }

  async upsertInstitutionDetails(details: InsertInstitutionDetails): Promise<InstitutionDetails> {
    const existing = await this.getInstitutionDetails(details.institutionId);
    if (existing) {
      const [updated] = await db.update(institutionDetails)
        .set({ ...details, scrapedAt: new Date() })
        .where(eq(institutionDetails.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(institutionDetails).values(details).returning();
    return created;
  }

  // Organizations
  async getOrganization(id: number): Promise<Organization | undefined> {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, id));
    return org;
  }

  async createOrganization(data: InsertOrganization): Promise<Organization> {
    const [org] = await db.insert(organizations).values(data).returning();
    return org;
  }

  async updateOrganization(id: number, updates: Partial<InsertOrganization>): Promise<Organization> {
    const [org] = await db.update(organizations).set(updates).where(eq(organizations.id, id)).returning();
    return org;
  }

  async getUserOrganization(userId: string): Promise<Organization | null> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user?.organizationId) return null;
    const [org] = await db.select().from(organizations).where(eq(organizations.id, user.organizationId));
    return org || null;
  }

  async setUserOrganization(userId: string, orgId: number): Promise<void> {
    await db.update(users).set({ organizationId: orgId }).where(eq(users.id, userId));
  }
}

export const storage = new DatabaseStorage();
