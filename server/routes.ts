import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./replit_integrations/auth";
import { registerAuthRoutes } from "./replit_integrations/auth";
import { api } from "@shared/routes";
import { z } from "zod";
import { insertInstructorSchema, insertCourseSchema, insertOfficeHourSchema, insertVisitSchema, insertVisitInteractionSchema } from "@shared/schema";

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
    });
    await storage.createCourse({
      code: "BOT201",
      name: "Ancient Flora",
      term: "Spring 2024",
      format: "hybrid",
      enrollment: 45,
      instructorId: i2.id,
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
