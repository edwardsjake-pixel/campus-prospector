import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import session from "express-session";
import connectPg from "connect-pg-simple";
import bcrypt from "bcrypt";
import type { Express, RequestHandler } from "express";
import { db } from "./db";
import { users } from "@shared/models/auth";
import { eq } from "drizzle-orm";

const SALT_ROUNDS = 12;

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: sessionTtl,
    },
  });
}

export const isAuthenticated: RequestHandler = (req, res, next) => {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ message: "Unauthorized" });
};

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  // --- Local Strategy (email + password) ---
  passport.use(
    new LocalStrategy({ usernameField: "email" }, async (email, password, done) => {
      try {
        const [user] = await db.select().from(users).where(eq(users.email, email));
        if (!user) return done(null, false, { message: "Invalid email or password" });
        if (!user.passwordHash) return done(null, false, { message: "Please sign in with Google" });
        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return done(null, false, { message: "Invalid email or password" });
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    })
  );

  // --- Google OAuth Strategy ---
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    const callbackURL =
      process.env.APP_URL
        ? `${process.env.APP_URL}/api/auth/google/callback`
        : "/api/auth/google/callback";

    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL,
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const email = profile.emails?.[0]?.value;
            if (!email) return done(new Error("No email returned from Google"));

            let [user] = await db.select().from(users).where(eq(users.googleId, profile.id));
            if (!user && email) {
              const [byEmail] = await db.select().from(users).where(eq(users.email, email));
              user = byEmail;
            }

            if (user) {
              if (!user.googleId) {
                const [updated] = await db
                  .update(users)
                  .set({ googleId: profile.id, updatedAt: new Date() })
                  .where(eq(users.id, user.id))
                  .returning();
                return done(null, updated);
              }
              return done(null, user);
            }

            const [newUser] = await db
              .insert(users)
              .values({
                email,
                firstName: profile.name?.givenName,
                lastName: profile.name?.familyName,
                profileImageUrl: profile.photos?.[0]?.value,
                googleId: profile.id,
              })
              .returning();
            return done(null, newUser);
          } catch (err) {
            return done(err as Error);
          }
        }
      )
    );
  }

  passport.serializeUser((user: any, cb) => cb(null, user.id));
  passport.deserializeUser(async (id: string, cb) => {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, id));
      cb(null, user ?? false);
    } catch (err) {
      cb(err);
    }
  });

  // Google OAuth routes
  app.get("/api/auth/google", passport.authenticate("google", { scope: ["openid", "email", "profile"] }));
  app.get(
    "/api/auth/google/callback",
    passport.authenticate("google", { failureRedirect: "/login?error=google" }),
    (_req, res) => res.redirect("/")
  );

  // Local register
  app.post("/api/auth/local/register", async (req, res) => {
    const { email, password, firstName, lastName } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Email and password required" });
    const [existing] = await db.select().from(users).where(eq(users.email, email));
    if (existing) return res.status(409).json({ message: "Email already registered" });
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const [user] = await db.insert(users).values({ email, passwordHash, firstName, lastName }).returning();
    req.login(user, (err) => {
      if (err) return res.status(500).json({ message: "Login failed after registration" });
      res.json(user);
    });
  });

  // Local login
  app.post("/api/auth/local/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info?.message ?? "Invalid credentials" });
      req.login(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        res.json(user);
      });
    })(req, res, next);
  });

  // Logout
  app.get("/api/auth/logout", (req, res) => {
    req.logout(() => res.redirect("/login"));
  });
  app.post("/api/auth/logout", (req, res) => {
    req.logout(() => res.json({ ok: true }));
  });
  app.get("/api/logout", (req, res) => {
    req.logout(() => res.redirect("/login"));
  });

  // Current user
  app.get("/api/auth/user", isAuthenticated, (req, res) => {
    res.json(req.user);
  });
}
