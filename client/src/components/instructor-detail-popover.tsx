import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronUp, BookOpen, Clock, Mail, MapPin, Plus, Pencil, Trash2, Check, X, Loader2, RefreshCw } from "lucide-react";
import { SiHubspot } from "react-icons/si";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatTime } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import type { Instructor, Course, OfficeHour } from "@shared/schema";

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

interface InstructorDetailProps {
  instructor: Instructor;
  courses?: Course[];
  officeHours?: OfficeHour[];
  hubspotUrl?: string | null;
  defaultExpanded?: boolean;
}

interface OfficeHourFormData {
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  location: string;
  isVirtual: boolean;
}

interface CourseFormData {
  code: string;
  name: string;
  term: string;
  format: string;
  enrollment: number;
  daysOfWeek: string;
  lectureStartTime: string;
  lectureEndTime: string;
  building: string;
  room: string;
}

const DEFAULT_OH: OfficeHourFormData = { dayOfWeek: "Monday", startTime: "09:00", endTime: "10:00", location: "", isVirtual: false };
const DEFAULT_COURSE: CourseFormData = { code: "", name: "", term: "", format: "in-person", enrollment: 0, daysOfWeek: "", lectureStartTime: "", lectureEndTime: "", building: "", room: "" };

function OfficeHourForm({ initial, onSave, onCancel, isPending }: {
  initial: OfficeHourFormData;
  onSave: (data: OfficeHourFormData) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState(initial);
  const isValid = form.dayOfWeek && form.startTime && form.endTime && form.startTime < form.endTime;
  return (
    <div className="space-y-1.5 p-2 border rounded bg-background" data-testid="form-office-hour">
      <div className="grid grid-cols-2 gap-1.5">
        <Select value={form.dayOfWeek} onValueChange={(v) => setForm({ ...form, dayOfWeek: v })}>
          <SelectTrigger className="h-7 text-xs" data-testid="select-oh-day">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DAYS_OF_WEEK.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input
          type="text"
          placeholder="Location"
          value={form.location}
          onChange={(e) => setForm({ ...form, location: e.target.value })}
          className="h-7 text-xs"
          data-testid="input-oh-location"
        />
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <Input
          type="time"
          value={form.startTime}
          onChange={(e) => setForm({ ...form, startTime: e.target.value })}
          className="h-7 text-xs"
          data-testid="input-oh-start"
        />
        <Input
          type="time"
          value={form.endTime}
          onChange={(e) => setForm({ ...form, endTime: e.target.value })}
          className="h-7 text-xs"
          data-testid="input-oh-end"
        />
      </div>
      {!isValid && form.startTime && form.endTime && form.startTime >= form.endTime && (
        <p className="text-[10px] text-destructive">End time must be after start time</p>
      )}
      <div className="flex gap-1 justify-end">
        <Button size="sm" variant="ghost" onClick={onCancel} className="h-6 px-2 text-xs" data-testid="button-oh-cancel" disabled={isPending}>
          <X className="w-3 h-3" />
        </Button>
        <Button size="sm" onClick={() => onSave(form)} className="h-6 px-2 text-xs" data-testid="button-oh-save" disabled={isPending || !isValid}>
          {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
        </Button>
      </div>
    </div>
  );
}

function CourseForm({ initial, onSave, onCancel, isPending }: {
  initial: CourseFormData;
  onSave: (data: CourseFormData) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState(initial);
  const toggleDay = (day: string) => {
    const days = form.daysOfWeek ? form.daysOfWeek.split(",").map(d => d.trim()).filter(Boolean) : [];
    const idx = days.indexOf(day);
    if (idx >= 0) days.splice(idx, 1); else days.push(day);
    setForm({ ...form, daysOfWeek: days.join(",") });
  };
  const selectedDays = form.daysOfWeek ? form.daysOfWeek.split(",").map(d => d.trim()).filter(Boolean) : [];
  const hasCode = form.code.trim().length > 0;
  const hasName = form.name.trim().length > 0;
  const timesValid = !form.lectureStartTime || !form.lectureEndTime || form.lectureStartTime < form.lectureEndTime;
  const isValid = hasCode && hasName && timesValid;

  return (
    <div className="space-y-1.5 p-2 border rounded bg-background" data-testid="form-course">
      <div className="grid grid-cols-2 gap-1.5">
        <Input placeholder="Code (e.g. CS101)" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className={`h-7 text-xs ${!hasCode && form.code !== initial.code ? "border-destructive" : ""}`} data-testid="input-course-code" />
        <Input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`h-7 text-xs ${!hasName && form.name !== initial.name ? "border-destructive" : ""}`} data-testid="input-course-name" />
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <Input placeholder="Term (e.g. Fall 2024)" value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })} className="h-7 text-xs" data-testid="input-course-term" />
        <Select value={form.format} onValueChange={(v) => setForm({ ...form, format: v })}>
          <SelectTrigger className="h-7 text-xs" data-testid="select-course-format">
            <SelectValue placeholder="Format" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="in-person">In Person</SelectItem>
            <SelectItem value="online">Online</SelectItem>
            <SelectItem value="hybrid">Hybrid</SelectItem>
          </SelectContent>
        </Select>
        <Input type="number" placeholder="Enrollment" value={form.enrollment || ""} onChange={(e) => setForm({ ...form, enrollment: Number(e.target.value) || 0 })} className="h-7 text-xs" data-testid="input-course-enrollment" />
      </div>
      <div className="flex flex-wrap gap-0.5">
        {DAYS_OF_WEEK.map(d => (
          <button
            key={d}
            type="button"
            onClick={() => toggleDay(d)}
            className={`px-1.5 py-0.5 rounded text-[10px] border transition-colors ${selectedDays.includes(d) ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary/50"}`}
            data-testid={`button-day-${d.toLowerCase()}`}
          >
            {d.slice(0, 3)}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <Input type="time" value={form.lectureStartTime} onChange={(e) => setForm({ ...form, lectureStartTime: e.target.value })} className="h-7 text-xs" data-testid="input-course-start" />
        <Input type="time" value={form.lectureEndTime} onChange={(e) => setForm({ ...form, lectureEndTime: e.target.value })} className="h-7 text-xs" data-testid="input-course-end" />
      </div>
      {!timesValid && (
        <p className="text-[10px] text-destructive">End time must be after start time</p>
      )}
      <div className="grid grid-cols-2 gap-1.5">
        <Input placeholder="Building" value={form.building} onChange={(e) => setForm({ ...form, building: e.target.value })} className="h-7 text-xs" data-testid="input-course-building" />
        <Input placeholder="Room" value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} className="h-7 text-xs" data-testid="input-course-room" />
      </div>
      <div className="flex gap-1 justify-end">
        <Button size="sm" variant="ghost" onClick={onCancel} className="h-6 px-2 text-xs" data-testid="button-course-cancel" disabled={isPending}>
          <X className="w-3 h-3" />
        </Button>
        <Button size="sm" onClick={() => onSave(form)} className="h-6 px-2 text-xs" data-testid="button-course-save" disabled={isPending || !isValid}>
          {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
        </Button>
      </div>
    </div>
  );
}

function invalidateCaches() {
  queryClient.invalidateQueries({ queryKey: ["/api/availability"] });
  queryClient.invalidateQueries({ queryKey: ["/api/instructors"] });
  queryClient.invalidateQueries({ queryKey: ["/api/office-hours"] });
  queryClient.invalidateQueries({ queryKey: ["/api/courses"] });
  queryClient.invalidateQueries({ queryKey: ["/api/course-instructors"] });
}

export function InstructorDetailToggle({ instructor, courses = [], officeHours = [], hubspotUrl, defaultExpanded = false }: InstructorDetailProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [addingOH, setAddingOH] = useState(false);
  const [editingOH, setEditingOH] = useState<number | null>(null);
  const [addingCourse, setAddingCourse] = useState(false);
  const [editingCourse, setEditingCourse] = useState<number | null>(null);
  const { toast } = useToast();

  const createOH = useMutation({
    mutationFn: async (data: OfficeHourFormData) => {
      await apiRequest("POST", "/api/office-hours", { ...data, instructorId: instructor.id });
    },
    onSuccess: () => { invalidateCaches(); setAddingOH(false); toast({ title: "Office hours added" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateOH = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: OfficeHourFormData }) => {
      await apiRequest("PUT", `/api/office-hours/${id}`, data);
    },
    onSuccess: () => { invalidateCaches(); setEditingOH(null); toast({ title: "Office hours updated" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteOH = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/office-hours/${id}`); },
    onSuccess: () => { invalidateCaches(); toast({ title: "Office hours deleted" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createCourse = useMutation({
    mutationFn: async (data: CourseFormData) => {
      await apiRequest("POST", "/api/courses", { ...data, instructorId: instructor.id });
    },
    onSuccess: () => { invalidateCaches(); setAddingCourse(false); toast({ title: "Course added" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateCourse = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: CourseFormData }) => {
      await apiRequest("PUT", `/api/courses/${id}`, data);
    },
    onSuccess: () => { invalidateCaches(); setEditingCourse(null); toast({ title: "Course updated" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="w-full">
      {!defaultExpanded && (
        <Button
          size="sm"
          variant="ghost"
          className="text-[10px] text-muted-foreground"
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          data-testid={`button-detail-toggle-${instructor.id}`}
        >
          {expanded ? <ChevronUp className="w-3 h-3 mr-0.5" /> : <ChevronDown className="w-3 h-3 mr-0.5" />}
          {expanded ? "Less" : "Details"}
        </Button>
      )}

      {expanded && (
        <div
          className="mt-1 bg-muted/50 border rounded-md p-2 space-y-1.5 text-xs"
          onClick={(e) => e.stopPropagation()}
          data-testid={`detail-panel-${instructor.id}`}
        >
          {instructor.email && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Mail className="w-3 h-3 shrink-0" />
              <span className="truncate">{instructor.email}</span>
              {hubspotUrl && (
                <a
                  href={hubspotUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="shrink-0 text-muted-foreground hover:text-orange-600 transition-colors"
                  data-testid={`link-hubspot-detail-${instructor.id}`}
                >
                  <SiHubspot className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          )}

          {(() => {
            const bldg = courses.find(c => c.building)?.building || null;
            const parts = [bldg, instructor.officeLocation].filter(Boolean);
            return parts.length > 0 ? (
              <div className="flex items-center gap-1 text-muted-foreground">
                <MapPin className="w-3 h-3 shrink-0" />
                <span className="truncate">{parts.join(", ")}</span>
              </div>
            ) : null;
          })()}

          {(instructor.bio || instructor.notes) && (
            <p className="text-muted-foreground text-[11px] leading-snug">
              {instructor.bio || instructor.notes}
            </p>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" /> Office Hours
              </p>
              {!addingOH && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs gap-1"
                  onClick={() => { setAddingOH(true); setEditingOH(null); }}
                  data-testid={`button-add-oh-${instructor.id}`}
                >
                  <Plus className="w-3 h-3" /> Add
                </Button>
              )}
            </div>

            {addingOH && (
              <OfficeHourForm
                initial={DEFAULT_OH}
                onSave={(data) => createOH.mutate(data)}
                onCancel={() => setAddingOH(false)}
                isPending={createOH.isPending}
              />
            )}

            {officeHours.length > 0 ? (
              <div className="space-y-1">
                {officeHours.map((oh) => (
                  editingOH === oh.id ? (
                    <OfficeHourForm
                      key={oh.id}
                      initial={{
                        dayOfWeek: oh.dayOfWeek,
                        startTime: oh.startTime?.slice(0, 5) || "09:00",
                        endTime: oh.endTime?.slice(0, 5) || "10:00",
                        location: oh.location || "",
                        isVirtual: oh.isVirtual || false,
                      }}
                      onSave={(data) => updateOH.mutate({ id: oh.id, data })}
                      onCancel={() => setEditingOH(null)}
                      isPending={updateOH.isPending}
                    />
                  ) : (
                    <div key={oh.id} className="flex items-center gap-1">
                      <Badge variant="secondary" className="text-[10px] flex-1">
                        {oh.dayOfWeek} {oh.startTime ? formatTime(oh.startTime) : ""}-{oh.endTime ? formatTime(oh.endTime) : ""}
                        {oh.location ? ` @ ${oh.location}` : ""}
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 shrink-0 text-muted-foreground"
                        onClick={() => { setEditingOH(oh.id); setAddingOH(false); }}
                        data-testid={`button-edit-oh-${oh.id}`}
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteOH.mutate(oh.id)}
                        data-testid={`button-delete-oh-${oh.id}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  )
                ))}
              </div>
            ) : !addingOH ? (
              <p className="text-[10px] text-muted-foreground italic">No office hours set</p>
            ) : null}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <BookOpen className="w-2.5 h-2.5" /> Courses ({courses.length})
              </p>
              {!addingCourse && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs gap-1"
                  onClick={() => { setAddingCourse(true); setEditingCourse(null); }}
                  data-testid={`button-add-course-${instructor.id}`}
                >
                  <Plus className="w-3 h-3" /> Add
                </Button>
              )}
            </div>

            {addingCourse && (
              <CourseForm
                initial={DEFAULT_COURSE}
                onSave={(data) => createCourse.mutate(data)}
                onCancel={() => setAddingCourse(false)}
                isPending={createCourse.isPending}
              />
            )}

            {courses.length > 0 ? (
              <div className="space-y-1">
                {courses.map((course) => (
                  editingCourse === course.id ? (
                    <CourseForm
                      key={course.id}
                      initial={{
                        code: course.code || "",
                        name: course.name || "",
                        term: course.term || "",
                        format: course.format || "in-person",
                        enrollment: course.enrollment || 0,
                        daysOfWeek: course.daysOfWeek || "",
                        lectureStartTime: course.lectureStartTime?.slice(0, 5) || "",
                        lectureEndTime: course.lectureEndTime?.slice(0, 5) || "",
                        building: course.building || "",
                        room: course.room || "",
                      }}
                      onSave={(data) => updateCourse.mutate({ id: course.id, data })}
                      onCancel={() => setEditingCourse(null)}
                      isPending={updateCourse.isPending}
                    />
                  ) : (
                    <div key={course.id} className="flex items-start gap-1 text-[11px]">
                      <div className="flex-1 min-w-0">
                        <span className="font-mono font-bold shrink-0">{course.code}</span>
                        <span className="text-muted-foreground ml-1">
                          {course.name}
                          {course.format && course.format !== "in-person" && (
                            <span className="ml-1 capitalize">({course.format})</span>
                          )}
                          {course.daysOfWeek && course.lectureStartTime && course.lectureEndTime && (
                            <span className="ml-1">
                              {course.daysOfWeek.split(",").map(d => d.trim().slice(0, 3)).join("/")}
                              {" "}{formatTime(course.lectureStartTime)}-{formatTime(course.lectureEndTime)}
                            </span>
                          )}
                          {course.building && <span className="ml-1">{course.building}{course.room ? ` ${course.room}` : ""}</span>}
                          {course.enrollment ? <span className="ml-1">({course.enrollment})</span> : null}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 shrink-0 text-muted-foreground mt-0.5"
                        onClick={() => { setEditingCourse(course.id); setAddingCourse(false); }}
                        data-testid={`button-edit-course-${course.id}`}
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
                    </div>
                  )
                ))}
              </div>
            ) : !addingCourse ? (
              <p className="text-[10px] text-muted-foreground italic">No courses assigned</p>
            ) : null}
          </div>

          {instructor.lastScrapedAt && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground pt-1.5 border-t">
              <RefreshCw className="w-2.5 h-2.5 shrink-0" />
              <span>
                Data scraped{" "}
                {formatDistanceToNow(new Date(instructor.lastScrapedAt as unknown as string), { addSuffix: true })}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
