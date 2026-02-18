import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Plus, Clock, MapPin, Trash2, CalendarDays, Check, GripVertical } from "lucide-react";
import type { PlannedMeeting, Instructor, OfficeHour, Course } from "@shared/schema";
import { InstructorDetailToggle } from "@/components/instructor-detail-popover";

const HOUR_START = 7;
const HOUR_END = 21;
const TOTAL_HOURS = HOUR_END - HOUR_START;
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface LectureBlock {
  id: number;
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  building: string | null;
  room: string | null;
}

interface AvailabilityRow {
  instructor: Instructor;
  officeHours: OfficeHour[];
  allOfficeHours: OfficeHour[];
  courses: Course[];
  lectures: LectureBlock[];
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToPosition(minutes: number): number {
  const startMinutes = HOUR_START * 60;
  const totalMinutes = TOTAL_HOURS * 60;
  return ((minutes - startMinutes) / totalMinutes) * 100;
}

function minutesToWidth(start: number, end: number): number {
  const totalMinutes = TOTAL_HOURS * 60;
  return ((end - start) / totalMinutes) * 100;
}

function formatTime(time: string): string {
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display}:${m} ${ampm}`;
}

function computeAvailableWindows(
  officeHours: OfficeHour[],
  lectures: LectureBlock[],
  bufferMinutes: number = 30
): { start: number; end: number }[] {
  const windows: { start: number; end: number }[] = [];
  for (const oh of officeHours) {
    windows.push({ start: timeToMinutes(oh.startTime), end: timeToMinutes(oh.endTime) });
  }
  for (const lec of lectures) {
    const lecStart = timeToMinutes(lec.startTime);
    const lecEnd = timeToMinutes(lec.endTime);
    windows.push({ start: Math.max(lecStart - bufferMinutes, HOUR_START * 60), end: lecStart });
    windows.push({ start: lecEnd, end: Math.min(lecEnd + bufferMinutes, HOUR_END * 60) });
  }
  if (windows.length === 0) return [];
  windows.sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [windows[0]];
  for (let i = 1; i < windows.length; i++) {
    const last = merged[merged.length - 1];
    if (windows[i].start <= last.end) {
      last.end = Math.max(last.end, windows[i].end);
    } else {
      merged.push(windows[i]);
    }
  }
  return merged;
}

function TimeBlock({
  startMin,
  endMin,
  color,
  label,
  sublabel,
  variant,
}: {
  startMin: number;
  endMin: number;
  color: string;
  label: string;
  sublabel?: string;
  variant: "office" | "lecture" | "available" | "meeting";
}) {
  const left = minutesToPosition(startMin);
  const width = minutesToWidth(startMin, endMin);
  if (width <= 0) return null;

  const borderClass = variant === "office"
    ? "border-emerald-400/50"
    : variant === "lecture"
    ? "border-blue-400/50"
    : variant === "meeting"
    ? "border-purple-400/60"
    : "border-amber-300/40";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`absolute rounded-md border ${color} ${borderClass} flex items-center overflow-hidden cursor-default transition-opacity`}
          style={{
            left: `${left}%`,
            width: `${width}%`,
            minWidth: "2px",
            top: variant === "meeting" ? "50%" : "2px",
            bottom: variant === "meeting" ? "2px" : "auto",
            height: variant === "meeting" ? "calc(50% - 4px)" : "calc(50% - 4px)",
          }}
          data-testid={`block-${variant}`}
        >
          {width > 4 && (
            <span className="text-[10px] font-semibold truncate px-1.5 leading-tight drop-shadow-sm">
              {label}
            </span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <p className="font-semibold text-sm">{label}</p>
        {sublabel && <p className="text-xs text-muted-foreground">{sublabel}</p>}
      </TooltipContent>
    </Tooltip>
  );
}

const meetingFormSchema = z.object({
  instructorId: z.coerce.number().min(1, "Select an instructor"),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
  location: z.string().optional(),
  purpose: z.string().optional(),
  notes: z.string().optional(),
}).refine(data => data.endTime > data.startTime, {
  message: "End time must be after start time",
  path: ["endTime"],
});

type MeetingFormValues = z.infer<typeof meetingFormSchema>;

const STATUS_COLORS: Record<string, string> = {
  planned: "bg-purple-100 text-purple-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

export default function Planner() {
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [rowOrder, setRowOrder] = useState<number[]>([]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const dragCounter = useRef(0);
  const { toast } = useToast();

  const selectedDateStr = date ? format(date, "yyyy-MM-dd") : "";
  const selectedDayName = date ? DAY_NAMES[date.getDay()] : "";

  const { data: meetings = [], isLoading: meetingsLoading } = useQuery<PlannedMeeting[]>({
    queryKey: ["/api/planned-meetings", selectedDateStr],
    queryFn: () => fetch(`/api/planned-meetings?date=${selectedDateStr}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!selectedDateStr,
  });

  const { data: instructors = [] } = useQuery<Instructor[]>({
    queryKey: ["/api/instructors"],
  });

  const { data: availabilityRows = [] } = useQuery<AvailabilityRow[]>({
    queryKey: ["/api/availability", selectedDayName],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/availability?dayOfWeek=${selectedDayName}`);
      return res.json();
    },
    enabled: !!selectedDayName,
  });

  const getInstructor = (id: number) => instructors.find(i => i.id === id);

  const form = useForm<MeetingFormValues>({
    resolver: zodResolver(meetingFormSchema),
    defaultValues: {
      instructorId: 0,
      startTime: "09:00",
      endTime: "10:00",
      location: "",
      purpose: "",
      notes: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (values: MeetingFormValues) => {
      return apiRequest("POST", "/api/planned-meetings", {
        ...values,
        date: selectedDateStr,
        status: "planned",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planned-meetings", selectedDateStr] });
      setDialogOpen(false);
      form.reset();
      toast({ title: "Meeting planned", description: "Added to your day plan." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create meeting.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/planned-meetings/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planned-meetings", selectedDateStr] });
      toast({ title: "Removed", description: "Meeting removed from plan." });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) =>
      apiRequest("PUT", `/api/planned-meetings/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planned-meetings", selectedDateStr] });
    },
  });

  const meetingsByInstructor = useMemo(() => {
    const map = new Map<number, PlannedMeeting[]>();
    meetings.forEach(m => {
      if (!map.has(m.instructorId)) map.set(m.instructorId, []);
      map.get(m.instructorId)!.push(m);
    });
    return map;
  }, [meetings]);

  const plannerRows = useMemo(() => {
    const rows: {
      instructor: Instructor;
      officeHours: OfficeHour[];
      allOfficeHours: OfficeHour[];
      courses: Course[];
      lectures: LectureBlock[];
      meetings: PlannedMeeting[];
    }[] = [];

    const availMap = new Map<number, AvailabilityRow>();
    availabilityRows.forEach(ar => availMap.set(ar.instructor.id, ar));

    meetingsByInstructor.forEach((mList, instId) => {
      const ar = availMap.get(instId);
      if (ar) {
        rows.push({
          instructor: ar.instructor,
          officeHours: ar.officeHours,
          allOfficeHours: ar.allOfficeHours || ar.officeHours,
          courses: ar.courses || [],
          lectures: ar.lectures,
          meetings: mList,
        });
      } else {
        const inst = getInstructor(instId);
        if (inst) {
          rows.push({
            instructor: inst,
            officeHours: [],
            allOfficeHours: [],
            courses: [],
            lectures: [],
            meetings: mList,
          });
        }
      }
    });

    return rows;
  }, [availabilityRows, meetingsByInstructor, instructors]);

  const orderedPlannerRows = useMemo(() => {
    if (rowOrder.length === 0) return plannerRows;
    const rowMap = new Map(plannerRows.map(r => [r.instructor.id, r]));
    const ordered: typeof plannerRows = [];
    rowOrder.forEach(id => {
      const r = rowMap.get(id);
      if (r) {
        ordered.push(r);
        rowMap.delete(id);
      }
    });
    rowMap.forEach(r => ordered.push(r));
    return ordered;
  }, [plannerRows, rowOrder]);

  const saveOrder = useCallback((ids: number[]) => {
    setRowOrder(ids);
    if (selectedDateStr) {
      try {
        const stored = JSON.parse(localStorage.getItem("plannerRowOrder") || "{}");
        stored[selectedDateStr] = ids;
        localStorage.setItem("plannerRowOrder", JSON.stringify(stored));
      } catch {}
    }
  }, [selectedDateStr]);

  useEffect(() => {
    if (!selectedDateStr) return;
    try {
      const stored = JSON.parse(localStorage.getItem("plannerRowOrder") || "{}");
      const saved = stored[selectedDateStr];
      if (Array.isArray(saved) && saved.length > 0) {
        setRowOrder(saved);
      } else {
        setRowOrder([]);
      }
    } catch {
      setRowOrder([]);
    }
  }, [selectedDateStr]);

  const handleDragStart = useCallback((idx: number) => {
    setDragIdx(idx);
  }, []);

  const handleDragEnter = useCallback((idx: number) => {
    dragCounter.current++;
    setDragOverIdx(idx);
  }, []);

  const handleDragLeave = useCallback(() => {
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      setDragOverIdx(null);
      dragCounter.current = 0;
    }
  }, []);

  const handleDrop = useCallback((dropIdx: number) => {
    if (dragIdx === null || dragIdx === dropIdx) {
      setDragIdx(null);
      setDragOverIdx(null);
      dragCounter.current = 0;
      return;
    }
    const currentIds = orderedPlannerRows.map(r => r.instructor.id);
    const [moved] = currentIds.splice(dragIdx, 1);
    currentIds.splice(dropIdx, 0, moved);
    saveOrder(currentIds);
    setDragIdx(null);
    setDragOverIdx(null);
    dragCounter.current = 0;
  }, [dragIdx, orderedPlannerRows, saveOrder]);

  const handleDragEnd = useCallback(() => {
    setDragIdx(null);
    setDragOverIdx(null);
    dragCounter.current = 0;
  }, []);

  const sortedMeetings = [...meetings].sort((a, b) => a.startTime.localeCompare(b.startTime));

  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => HOUR_START + i);

  const nowMinutes = useMemo(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }, []);

  const isToday = date ? format(date, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd") : false;
  const nowPosition = isToday ? minutesToPosition(nowMinutes) : -1;

  return (
    <Layout>
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-display font-bold" data-testid="text-planner-title">Campus Plan</h1>
          <p className="text-muted-foreground">Plan your campus day and schedule instructor meetings.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-meeting" disabled={!date}>
              <Plus className="w-4 h-4 mr-2" />
              Add Meeting
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Plan a Meeting — {date ? format(date, "EEEE, MMM d") : ""}</DialogTitle>
              <DialogDescription>Schedule a meeting with an instructor for this day.</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
                <FormField
                  control={form.control}
                  name="instructorId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Instructor</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ? String(field.value) : ""}>
                        <FormControl>
                          <SelectTrigger data-testid="select-meeting-instructor">
                            <SelectValue placeholder="Select instructor" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {instructors.map((inst) => (
                            <SelectItem key={inst.id} value={String(inst.id)}>
                              {inst.name} {inst.department ? `— ${inst.department}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Time</FormLabel>
                        <FormControl><Input type="time" {...field} data-testid="input-meeting-start" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="endTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End Time</FormLabel>
                        <FormControl><Input type="time" {...field} data-testid="input-meeting-end" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Location</FormLabel>
                      <FormControl><Input placeholder="Building, room, or virtual link" {...field} data-testid="input-meeting-location" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="purpose"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Purpose</FormLabel>
                      <FormControl><Input placeholder="e.g. Discuss textbook adoption" {...field} data-testid="input-meeting-purpose" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl><Textarea placeholder="Any prep notes..." {...field} data-testid="input-meeting-notes" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-meeting">
                  {createMutation.isPending ? "Adding..." : "Add to Day Plan"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                className="rounded-md border-none w-full flex justify-center"
              />
            </CardContent>
          </Card>

          {sortedMeetings.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <CalendarDays className="w-4 h-4" />
                  Meetings ({sortedMeetings.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {sortedMeetings.map((meeting) => {
                  const inst = getInstructor(meeting.instructorId);
                  return (
                    <div key={meeting.id} className="p-2 rounded-md border" data-testid={`meeting-card-${meeting.id}`}>
                      <div className="flex items-start justify-between gap-1">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium text-sm truncate" data-testid={`text-meeting-instructor-${meeting.id}`}>
                              {inst?.name || "Unknown"}
                            </span>
                            <Badge variant="secondary" className={`text-[10px] py-0 ${STATUS_COLORS[meeting.status || "planned"] || ""}`}>
                              {meeting.status || "planned"}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                            <span className="flex items-center gap-0.5">
                              <Clock className="w-3 h-3" />
                              {meeting.startTime.slice(0, 5)} – {meeting.endTime.slice(0, 5)}
                            </span>
                            {meeting.location && (
                              <span className="flex items-center gap-0.5">
                                <MapPin className="w-3 h-3" />
                                {meeting.location}
                              </span>
                            )}
                          </div>
                          {meeting.purpose && (
                            <p className="text-xs mt-0.5 text-muted-foreground">{meeting.purpose}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          {meeting.status !== "completed" && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => updateStatusMutation.mutate({ id: meeting.id, status: "completed" })}
                              data-testid={`button-complete-meeting-${meeting.id}`}
                            >
                              <Check className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => deleteMutation.mutate(meeting.id)}
                            data-testid={`button-delete-meeting-${meeting.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="xl:col-span-3 space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h3 className="font-semibold text-lg">
              Day Plan — {date ? format(date, "EEEE, MMMM d, yyyy") : "Select a date"}
            </h3>
            <div className="flex items-center gap-4 text-xs flex-wrap">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-purple-500/25 border border-purple-400/60" />
                <span className="text-muted-foreground">Your Meeting</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-emerald-500/20 border border-emerald-400/50" />
                <span className="text-muted-foreground">Office Hours</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-blue-500/20 border border-blue-400/50" />
                <span className="text-muted-foreground">Lecture</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-amber-400/15 border border-amber-300/40" />
                <span className="text-muted-foreground">Likely Available</span>
              </div>
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              {meetingsLoading ? (
                <div className="flex items-center justify-center py-20 text-muted-foreground">Loading...</div>
              ) : orderedPlannerRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <CalendarDays className="w-10 h-10 mb-3 opacity-40" />
                  <p className="font-medium" data-testid="text-no-meetings">No meetings planned</p>
                  <p className="text-sm mt-1">Click "Add Meeting" to schedule your day, or add from Availability.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div className="min-w-[800px]">
                    <div className="flex border-b bg-muted/30">
                      <div className="w-52 shrink-0 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-r">
                        Instructor
                      </div>
                      <div className="flex-1 relative">
                        <div className="flex">
                          {hours.map(h => {
                            const label = h > 12 ? `${h - 12}p` : h === 12 ? "12p" : `${h}a`;
                            return (
                              <div key={h} className="flex-1 text-center text-[10px] text-muted-foreground py-2 border-r border-dashed border-muted-foreground/15 last:border-r-0">
                                {label}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {orderedPlannerRows.map((row, rowIndex) => {
                      const availWindows = computeAvailableWindows(row.officeHours, row.lectures);
                      const hasMeetings = row.meetings.length > 0;
                      const hasSchedule = row.officeHours.length > 0 || row.lectures.length > 0;
                      const rowHeight = hasMeetings && hasSchedule ? "h-20" : "h-12";
                      const isDragging = dragIdx === rowIndex;
                      const isDragOver = dragOverIdx === rowIndex && dragIdx !== rowIndex;

                      return (
                        <div
                          key={row.instructor.id}
                          onDragEnter={() => handleDragEnter(rowIndex)}
                          onDragLeave={handleDragLeave}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            handleDrop(rowIndex);
                          }}
                          onDragEnd={handleDragEnd}
                          className={`flex border-b last:border-b-0 transition-all ${isDragging ? "opacity-40" : ""} ${isDragOver ? "border-t-2 border-t-primary" : ""}`}
                          data-testid={`planner-row-${row.instructor.id}`}
                        >
                          <div className="w-52 shrink-0 px-2 py-3 border-r flex items-center gap-1">
                            <div
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.effectAllowed = "move";
                                handleDragStart(rowIndex);
                              }}
                              className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground shrink-0"
                              data-testid={`drag-handle-${row.instructor.id}`}
                            >
                              <GripVertical className="w-4 h-4" />
                            </div>
                            <div className="min-w-0 flex-1 flex flex-col justify-center">
                              <p className="font-medium text-sm truncate">{row.instructor.name}</p>
                            {row.instructor.department && (
                              <span className="text-[10px] text-muted-foreground truncate block">{row.instructor.department}</span>
                            )}
                            {(() => {
                              const bldg = (row.courses || []).find((c: any) => c.building)?.building || null;
                              const parts = [bldg, row.instructor.officeLocation].filter(Boolean);
                              return parts.length > 0 ? (
                                <div className="flex items-center gap-0.5 mt-0.5">
                                  <MapPin className="w-2.5 h-2.5 text-muted-foreground" />
                                  <span className="text-[10px] text-muted-foreground truncate">{parts.join(", ")}</span>
                                </div>
                              ) : null;
                            })()}
                            <InstructorDetailToggle
                              instructor={row.instructor}
                              courses={row.courses || []}
                              officeHours={row.allOfficeHours || row.officeHours}
                            />
                            </div>
                          </div>

                          <div className={`flex-1 relative ${rowHeight}`}>
                            {hours.map(h => (
                              <div
                                key={h}
                                className="absolute top-0 bottom-0 border-r border-dashed border-muted-foreground/10"
                                style={{ left: `${((h - HOUR_START) / TOTAL_HOURS) * 100}%` }}
                              />
                            ))}

                            {hasMeetings && hasSchedule && (
                              <div
                                className="absolute left-0 right-0 border-b border-dashed border-muted-foreground/15"
                                style={{ top: "50%" }}
                              />
                            )}

                            {availWindows.map((w, i) => (
                              <TimeBlock
                                key={`avail-${i}`}
                                startMin={w.start}
                                endMin={w.end}
                                color="bg-amber-400/25 text-amber-900 dark:text-amber-100"
                                label="Likely in office"
                                variant="available"
                              />
                            ))}

                            {row.officeHours.map(oh => (
                              <TimeBlock
                                key={`oh-${oh.id}`}
                                startMin={timeToMinutes(oh.startTime)}
                                endMin={timeToMinutes(oh.endTime)}
                                color="bg-emerald-500/30 text-emerald-900 dark:text-emerald-100"
                                label="Office Hours"
                                sublabel={`${formatTime(oh.startTime)} - ${formatTime(oh.endTime)}${oh.location ? ` · ${oh.location}` : ""}`}
                                variant="office"
                              />
                            ))}

                            {row.lectures.map(lec => (
                              <TimeBlock
                                key={`lec-${lec.id}`}
                                startMin={timeToMinutes(lec.startTime)}
                                endMin={timeToMinutes(lec.endTime)}
                                color="bg-blue-500/30 text-blue-900 dark:text-blue-100"
                                label={lec.code}
                                sublabel={`${lec.name} · ${formatTime(lec.startTime)} - ${formatTime(lec.endTime)}${lec.building ? ` · ${lec.building}` : ""}${lec.room ? ` ${lec.room}` : ""}`}
                                variant="lecture"
                              />
                            ))}

                            {row.meetings.map(m => (
                              <TimeBlock
                                key={`meeting-${m.id}`}
                                startMin={timeToMinutes(m.startTime)}
                                endMin={timeToMinutes(m.endTime)}
                                color={m.status === "completed" ? "bg-green-500/25 text-green-800" : "bg-purple-500/25 text-purple-800"}
                                label={m.purpose || "Meeting"}
                                sublabel={`${formatTime(m.startTime)} - ${formatTime(m.endTime)}${m.location ? ` · ${m.location}` : ""}${m.status === "completed" ? " (Done)" : ""}`}
                                variant="meeting"
                              />
                            ))}

                            {isToday && nowPosition >= 0 && nowPosition <= 100 && (
                              <div
                                className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
                                style={{ left: `${nowPosition}%` }}
                              >
                                <div className="absolute -top-1 -left-1 w-2.5 h-2.5 rounded-full bg-red-500" />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
