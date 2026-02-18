import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./replit_integrations/auth";
import { registerAuthRoutes } from "./replit_integrations/auth";
import { api } from "@shared/routes";
import { z } from "zod";
import { insertInstructorSchema, insertCourseSchema, insertOfficeHourSchema, insertVisitSchema, insertVisitInteractionSchema, insertPlannedMeetingSchema } from "@shared/schema";
import { syncHubSpotData, fetchDealStageLabels, fetchImportPreview, importSelectedContacts, searchHubSpotContacts, type HubSpotImportPreviewContact } from "./hubspot";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Set up Replit Auth
  await setupAuth(app);
  registerAuthRoutes(app);

  // === Instructors ===
  app.get(api.instructors.list.path, async (req, res) => {
    const filters = {
      department: req.query.department as string,
      institution: req.query.institution as string,
      targetPriority: req.query.targetPriority as string,
      search: req.query.search as string,
    };
    const instructors = await storage.getInstructors(filters);
    res.json(instructors);
  });

  app.get(api.instructors.get.path, async (req, res) => {
    const instructor = await storage.getInstructor(Number(req.params.id));
    if (!instructor) return res.status(404).json({ message: "Instructor not found" });
    res.json(instructor);
  });

  app.post(api.instructors.create.path, async (req, res) => {
    try {
      const input = api.instructors.create.input.parse(req.body);
      const instructor = await storage.createInstructor(input);
      res.status(201).json(instructor);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: error.errors[0].message });
      } else {
        res.status(500).json({ message: "Internal Server Error" });
      }
    }
  });

  app.put(api.instructors.update.path, async (req, res) => {
    try {
      const input = api.instructors.update.input.parse(req.body);
      const instructor = await storage.updateInstructor(Number(req.params.id), input);
      res.json(instructor);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: error.errors[0].message });
      } else {
        res.status(404).json({ message: "Instructor not found" });
      }
    }
  });

  app.delete("/api/instructors/:id", async (req, res) => {
    try {
      await storage.deleteInstructor(Number(req.params.id));
      res.json({ message: "Deleted" });
    } catch (error) {
      res.status(404).json({ message: "Instructor not found" });
    }
  });

  // === Courses ===
  app.get(api.courses.list.path, async (req, res) => {
    const instructorId = req.query.instructorId ? Number(req.query.instructorId) : undefined;
    const courses = await storage.getCourses(instructorId);
    res.json(courses);
  });

  app.post(api.courses.create.path, async (req, res) => {
    try {
      const input = api.courses.create.input.parse(req.body);
      const course = await storage.createCourse(input);
      res.status(201).json(course);
    } catch (error) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  app.put("/api/courses/:id", async (req, res) => {
    try {
      const course = await storage.updateCourse(Number(req.params.id), req.body);
      res.json(course);
    } catch (error) {
      res.status(404).json({ message: "Course not found" });
    }
  });

  app.delete("/api/courses/:id", async (req, res) => {
    try {
      await storage.deleteCourse(Number(req.params.id));
      res.json({ message: "Deleted" });
    } catch (error) {
      res.status(404).json({ message: "Course not found" });
    }
  });

  // === Office Hours ===
  app.get(api.officeHours.list.path, async (req, res) => {
    const instructorId = req.query.instructorId ? Number(req.query.instructorId) : undefined;
    const officeHours = await storage.getOfficeHours(instructorId);
    res.json(officeHours);
  });

  app.post(api.officeHours.create.path, async (req, res) => {
    try {
      const input = api.officeHours.create.input.parse(req.body);
      const officeHour = await storage.createOfficeHour(input);
      res.status(201).json(officeHour);
    } catch (error) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  app.put("/api/office-hours/:id", async (req, res) => {
    try {
      const officeHour = await storage.updateOfficeHour(Number(req.params.id), req.body);
      res.json(officeHour);
    } catch (error) {
      res.status(404).json({ message: "Office hour not found" });
    }
  });

  app.delete("/api/office-hours/:id", async (req, res) => {
    try {
      await storage.deleteOfficeHour(Number(req.params.id));
      res.json({ message: "Deleted" });
    } catch (error) {
      res.status(404).json({ message: "Office hour not found" });
    }
  });

  // === Visits ===
  app.get(api.visits.list.path, async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const visits = await storage.getVisits((req.user as any).claims.sub);
    res.json(visits);
  });

  app.post(api.visits.create.path, async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      const input = api.visits.create.input.parse(req.body);
      const visit = await storage.createVisit({
        ...input,
        userId: (req.user as any).claims.sub // User ID from Replit Auth
      });
      res.status(201).json(visit);
    } catch (error) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  // === Interactions ===
  app.post(api.interactions.create.path, async (req, res) => {
    try {
      const input = api.interactions.create.input.parse(req.body);
      const interaction = await storage.createInteraction(input);
      res.status(201).json(interaction);
    } catch (error) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  // === Planned Meetings ===
  app.get(api.plannedMeetings.list.path, async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const date = req.query.date as string | undefined;
    const meetings = await storage.getPlannedMeetings((req.user as any).claims.sub, date);
    res.json(meetings);
  });

  app.post(api.plannedMeetings.create.path, async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      const input = api.plannedMeetings.create.input.parse(req.body);
      const meeting = await storage.createPlannedMeeting({
        ...input,
        userId: (req.user as any).claims.sub,
      });
      res.status(201).json(meeting);
    } catch (error) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  app.put(api.plannedMeetings.update.path, async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      const input = api.plannedMeetings.update.input.parse(req.body);
      const meeting = await storage.updatePlannedMeeting(Number(req.params.id), input);
      res.json(meeting);
    } catch (error) {
      res.status(404).json({ message: "Meeting not found" });
    }
  });

  app.delete(api.plannedMeetings.delete.path, async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      await storage.deletePlannedMeeting(Number(req.params.id));
      res.json({ message: "Deleted" });
    } catch (error) {
      res.status(404).json({ message: "Meeting not found" });
    }
  });

  // === Availability (Gantt view) ===
  app.get(api.availability.list.path, async (req, res) => {
    const dayOfWeek = req.query.dayOfWeek as string;
    if (!dayOfWeek) return res.status(400).json({ message: "dayOfWeek is required" });

    const institution = req.query.institution as string | undefined;
    const showAll = req.query.showAll === "true";

    const filters: any = {};
    if (institution) filters.institution = institution;
    const allInstructors = await storage.getInstructors(filters);
    const allOfficeHours = await storage.getOfficeHours();
    const allCourses = await storage.getCourses();

    const result = allInstructors.map(instructor => {
      const oh = allOfficeHours.filter(
        o => o.instructorId === instructor.id && o.dayOfWeek === dayOfWeek
      );
      const lectures = allCourses.filter(
        c => c.instructorId === instructor.id &&
          c.daysOfWeek && c.daysOfWeek.split(",").map(d => d.trim()).includes(dayOfWeek) &&
          c.lectureStartTime && c.lectureEndTime
      );
      if (!showAll && oh.length === 0 && lectures.length === 0) return null;
      const instructorCourses = allCourses.filter(c => c.instructorId === instructor.id);
      const allOh = allOfficeHours.filter(o => o.instructorId === instructor.id);
      return {
        instructor,
        officeHours: oh,
        allOfficeHours: allOh,
        courses: instructorCourses,
        lectures: lectures.map(l => ({
          id: l.id,
          code: l.code,
          name: l.name,
          startTime: l.lectureStartTime,
          endTime: l.lectureEndTime,
          building: l.building,
          room: l.room,
        })),
      };
    }).filter(Boolean);

    res.json(result);
  });

  // === CSV Import ===
  app.post(api.import.instructors.path, async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      const rows = req.body.rows as any[];
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ message: "No data provided" });
      }
      const DAY_ABBREV: Record<string, string> = {
        m: "Monday", mo: "Monday", mon: "Monday", monday: "Monday",
        t: "Tuesday", tu: "Tuesday", tue: "Tuesday", tues: "Tuesday", tuesday: "Tuesday",
        w: "Wednesday", we: "Wednesday", wed: "Wednesday", wednesday: "Wednesday",
        r: "Thursday", th: "Thursday", thu: "Thursday", thur: "Thursday", thurs: "Thursday", thursday: "Thursday",
        f: "Friday", fr: "Friday", fri: "Friday", friday: "Friday",
        s: "Saturday", sa: "Saturday", sat: "Saturday", saturday: "Saturday",
        u: "Sunday", su: "Sunday", sun: "Sunday", sunday: "Sunday",
      };

      function parseDays(raw: string): string {
        if (!raw || !raw.trim()) return "";
        const cleaned = raw.trim();
        if (/^[MTWRFSU]+$/i.test(cleaned) && cleaned.length <= 7) {
          const charMap: Record<string, string> = { M: "Monday", T: "Tuesday", W: "Wednesday", R: "Thursday", F: "Friday", S: "Saturday", U: "Sunday" };
          return cleaned.toUpperCase().split("").map(c => charMap[c]).filter(Boolean).join(",");
        }
        const parts = cleaned.split(/[,\/;&\s]+/).filter(Boolean);
        const days = parts.map(p => DAY_ABBREV[p.toLowerCase()]).filter(Boolean);
        return days.length > 0 ? days.join(",") : cleaned;
      }

      function parseTime(raw: string): string | null {
        if (!raw || !raw.trim()) return null;
        const t = raw.trim();
        const hhmm = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(am|pm))?$/i);
        if (hhmm) {
          let h = parseInt(hhmm[1], 10);
          const m = hhmm[2];
          const ampm = hhmm[4];
          if (ampm) {
            if (ampm.toLowerCase() === "pm" && h < 12) h += 12;
            if (ampm.toLowerCase() === "am" && h === 12) h = 0;
          }
          return `${String(h).padStart(2, "0")}:${m}:00`;
        }
        const plain = t.match(/^(\d{1,2})(?:\s*(am|pm))$/i);
        if (plain) {
          let h = parseInt(plain[1], 10);
          const ampm = plain[2];
          if (ampm.toLowerCase() === "pm" && h < 12) h += 12;
          if (ampm.toLowerCase() === "am" && h === 12) h = 0;
          return `${String(h).padStart(2, "0")}:00:00`;
        }
        return null;
      }

      const parsed = rows.map((row: any) => {
        const courseName = row.largestCourse || row.largest_course || null;
        const enrollmentRaw = row.enrollment || row.enrolled || null;
        const enrollment = enrollmentRaw ? parseInt(String(enrollmentRaw).replace(/[^0-9]/g, ""), 10) : 0;
        const daysRaw = row.daysOfWeek || row.days_of_week || row.days || null;
        const startRaw = row.lectureStartTime || row.lecture_start_time || row.startTime || row.start_time || null;
        const endRaw = row.lectureEndTime || row.lecture_end_time || row.endTime || row.end_time || null;
        const ohDaysRaw = row.officeHourDays || row.office_hour_days || null;
        const ohStartRaw = row.officeHourStartTime || row.office_hour_start_time || null;
        const ohEndRaw = row.officeHourEndTime || row.office_hour_end_time || null;
        const ohLocation = row.officeHourLocation || row.office_hour_location || null;
        return {
          instructor: {
            name: String(row.name || "").trim(),
            email: row.email ? String(row.email).trim() : null,
            department: row.department ? String(row.department).trim() : null,
            institution: row.institution ? String(row.institution).trim() : null,
            officeLocation: row.officeLocation || row.office_location ? String(row.officeLocation || row.office_location).trim() : null,
            bio: row.bio ? String(row.bio).trim() : null,
            notes: row.notes ? String(row.notes).trim() : null,
            targetPriority: row.targetPriority || row.target_priority || "medium",
          },
          courseName: courseName ? String(courseName).trim() : null,
          enrollment: isNaN(enrollment) ? 0 : enrollment,
          daysOfWeek: daysRaw ? parseDays(String(daysRaw)) : null,
          lectureStartTime: startRaw ? parseTime(String(startRaw)) : null,
          lectureEndTime: endRaw ? parseTime(String(endRaw)) : null,
          building: row.building ? String(row.building).trim() : null,
          room: row.room ? String(row.room).trim() : null,
          officeHourDays: ohDaysRaw ? parseDays(String(ohDaysRaw)) : null,
          officeHourStartTime: ohStartRaw ? parseTime(String(ohStartRaw)) : null,
          officeHourEndTime: ohEndRaw ? parseTime(String(ohEndRaw)) : null,
          officeHourLocation: ohLocation ? String(ohLocation).trim() : null,
        };
      }).filter(p => p.instructor.name.length > 0);
      const items = parsed.map(p => p.instructor);
      const courseNames = parsed.map(p => p.courseName);
      const result = await storage.bulkCreateInstructors(items);

      let coursesCreated = 0;
      const allInstructors = [...result.created, ...result.existing, ...result.updated];
      for (let i = 0; i < parsed.length; i++) {
        const cName = parsed[i].courseName;
        if (cName && cName.length > 0) {
          const normalizedName = parsed[i].instructor.name.toLowerCase().trim();
          const instructor = allInstructors.find(inst => inst.name.toLowerCase().trim() === normalizedName);
          if (instructor) {
            const code = cName.split(/\s+/).slice(0, 2).join(" ").substring(0, 20);
            await storage.createCourse({
              code: code,
              name: cName,
              term: "Current",
              format: "in-person",
              enrollment: parsed[i].enrollment || 0,
              instructorId: instructor.id,
              daysOfWeek: parsed[i].daysOfWeek || null,
              lectureStartTime: parsed[i].lectureStartTime || null,
              lectureEndTime: parsed[i].lectureEndTime || null,
              building: parsed[i].building || null,
              room: parsed[i].room || null,
            });
            coursesCreated++;
          }
        }
      }

      let officeHoursCreated = 0;
      for (let i = 0; i < parsed.length; i++) {
        const p = parsed[i];
        if (p.officeHourStartTime && p.officeHourEndTime) {
          const normalizedName = p.instructor.name.toLowerCase().trim();
          const instructor = allInstructors.find(inst => inst.name.toLowerCase().trim() === normalizedName);
          if (instructor) {
            const ohDays = p.officeHourDays ? p.officeHourDays.split(",").filter(Boolean) : ["Monday"];
            for (const day of ohDays) {
              await storage.createOfficeHour({
                instructorId: instructor.id,
                dayOfWeek: day.trim(),
                startTime: p.officeHourStartTime!,
                endTime: p.officeHourEndTime!,
                location: p.officeHourLocation || instructor.officeLocation || null,
                isVirtual: false,
              });
              officeHoursCreated++;
            }
          }
        }
      }

      res.json({ imported: result.created.length, updated: result.updated.length, skipped: result.skippedCount, coursesCreated, officeHoursCreated });
    } catch (error) {
      res.status(400).json({ message: "Failed to import instructors" });
    }
  });

  app.post(api.import.courses.path, async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      const rows = req.body.rows as any[];
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ message: "No data provided" });
      }
      const items = rows.map((row: any) => ({
        code: String(row.code || "").trim(),
        name: String(row.name || "").trim(),
        term: String(row.term || "").trim(),
        format: String(row.format || "in-person").trim(),
        enrollment: row.enrollment ? Number(row.enrollment) : 0,
        instructorId: row.instructorId || row.instructor_id ? Number(row.instructorId || row.instructor_id) : null,
      })).filter(item => item.code.length > 0 && item.name.length > 0);
      const created = await storage.bulkCreateCourses(items);
      res.json({ imported: created.length });
    } catch (error) {
      res.status(400).json({ message: "Failed to import courses" });
    }
  });

  // === Deals ===
  app.get("/api/deals", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    const instructorId = req.query.instructorId ? Number(req.query.instructorId) : undefined;
    if (instructorId) {
      const deals = await storage.getDealsByInstructor(instructorId);
      return res.json(deals);
    }
    const deals = await storage.getAllDeals();
    res.json(deals);
  });

  // === HubSpot Sync ===
  app.post("/api/hubspot/sync", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      const companyNames = req.body.companyNames as string[];
      if (!Array.isArray(companyNames) || companyNames.length === 0) {
        return res.status(400).json({ message: "companyNames array is required" });
      }
      const result = await syncHubSpotData(companyNames, {
        getInstructorByEmail: (email) => storage.getInstructorByEmail(email),
        createInstructor: (data) => storage.createInstructor(data),
        updateInstructor: (id, data) => storage.updateInstructor(id, data),
        upsertDeal: (data) => storage.upsertDeal(data),
      });
      res.json(result);
    } catch (error: any) {
      console.error("HubSpot sync error:", error);
      res.status(500).json({ message: error.message || "HubSpot sync failed" });
    }
  });

  app.get("/api/hubspot/deal-stages", async (_req, res) => {
    try {
      const labels = await fetchDealStageLabels();
      res.json(labels);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to fetch deal stages" });
    }
  });

  app.post("/api/hubspot/import-preview", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      const school = (req.body.school as string) || 'both';
      if (!['purdue', 'iu', 'both'].includes(school)) {
        return res.status(400).json({ message: "school must be 'purdue', 'iu', or 'both'" });
      }
      const allInstructors = await storage.getInstructors();
      const existingEmails = new Set(
        allInstructors
          .map(i => i.email?.toLowerCase())
          .filter((e): e is string => !!e)
      );
      const stageLabels = await fetchDealStageLabels();
      const preview = await fetchImportPreview(school, existingEmails, stageLabels);
      res.json(preview);
    } catch (error: any) {
      console.error("HubSpot import preview error:", error);
      res.status(500).json({ message: error.message || "Failed to fetch import preview" });
    }
  });

  app.post("/api/hubspot/search-contacts", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      const school = (req.body.school as string) || 'both';
      const query = (req.body.query as string) || '';
      if (!query.trim()) {
        return res.status(400).json({ message: "query is required" });
      }
      if (!['purdue', 'iu', 'both'].includes(school)) {
        return res.status(400).json({ message: "school must be 'purdue', 'iu', or 'both'" });
      }
      const allInstructors = await storage.getInstructors();
      const existingEmails = new Set(
        allInstructors
          .map(i => i.email?.toLowerCase())
          .filter((e): e is string => !!e)
      );
      const stageLabels = await fetchDealStageLabels();
      const results = await searchHubSpotContacts(school, query, existingEmails, stageLabels);
      res.json(results);
    } catch (error: any) {
      console.error("HubSpot search contacts error:", error);
      res.status(500).json({ message: error.message || "Failed to search contacts" });
    }
  });

  app.post("/api/hubspot/import", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    try {
      const contacts = req.body.contacts as HubSpotImportPreviewContact[];
      if (!Array.isArray(contacts) || contacts.length === 0) {
        return res.status(400).json({ message: "contacts array is required" });
      }
      const result = await importSelectedContacts(contacts, {
        getInstructorByEmail: (email) => storage.getInstructorByEmail(email),
        createInstructor: (data) => storage.createInstructor(data),
        upsertDeal: (data) => storage.upsertDeal(data),
      });
      res.json(result);
    } catch (error: any) {
      console.error("HubSpot import error:", error);
      res.status(500).json({ message: error.message || "Failed to import contacts" });
    }
  });

  // Seed data if empty
  const existingInstructors = await storage.getInstructors();
  if (existingInstructors.length === 0) {
    const i1 = await storage.createInstructor({
      name: "Dr. Alan Grant",
      email: "agrant@university.edu",
      department: "Paleontology",
      officeLocation: "Science Hall 101",
      bio: "Focuses on dinosaur behavior.",
      targetPriority: "high",
      notes: "Prefer email contact.",
    });
    const i2 = await storage.createInstructor({
      name: "Dr. Ellie Sattler",
      email: "esattler@university.edu",
      department: "Paleobotany",
      officeLocation: "Science Hall 102",
      bio: "Expert in prehistoric plants.",
      targetPriority: "medium",
      notes: "Office hours are busy.",
    });

    await storage.createCourse({
      code: "PAL101",
      name: "Intro to Paleontology",
      term: "Spring 2024",
      format: "in-person",
      enrollment: 150,
      instructorId: i1.id,
      daysOfWeek: "Monday,Wednesday,Friday",
      lectureStartTime: "09:00",
      lectureEndTime: "10:00",
      building: "Science Hall",
      room: "200",
    });
    await storage.createCourse({
      code: "BOT201",
      name: "Ancient Flora",
      term: "Spring 2024",
      format: "hybrid",
      enrollment: 45,
      instructorId: i2.id,
      daysOfWeek: "Tuesday,Thursday",
      lectureStartTime: "13:00",
      lectureEndTime: "14:30",
      building: "Greenhouse",
      room: "A1",
    });

    await storage.createOfficeHour({
      instructorId: i1.id,
      dayOfWeek: "Monday",
      startTime: "14:00",
      endTime: "16:00",
      location: "Science Hall 101",
      isVirtual: false,
    });
    await storage.createOfficeHour({
      instructorId: i2.id,
      dayOfWeek: "Tuesday",
      startTime: "10:00",
      endTime: "12:00",
      location: "Zoom",
      isVirtual: true,
    });
  }

  return httpServer;
}
