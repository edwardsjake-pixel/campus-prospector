import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MapPin, User, Filter, Plus, CalendarPlus } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import type { Instructor, OfficeHour } from "@shared/schema";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const HOUR_START = 7;
const HOUR_END = 21;
const TOTAL_HOURS = HOUR_END - HOUR_START;

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

function getTodayDayName(): string {
  const d = new Date();
  return DAYS[d.getDay() === 0 ? 6 : d.getDay() - 1];
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
    const beforeStart = Math.max(lecStart - bufferMinutes, HOUR_START * 60);
    const afterEnd = Math.min(lecEnd + bufferMinutes, HOUR_END * 60);
    windows.push({ start: beforeStart, end: lecStart });
    windows.push({ start: lecEnd, end: afterEnd });
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
    ? "border-purple-400/50"
    : "border-amber-300/40";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`absolute top-1 bottom-1 rounded-md border ${color} ${borderClass} flex items-center overflow-hidden cursor-default transition-opacity`}
          style={{ left: `${left}%`, width: `${width}%`, minWidth: "2px" }}
          data-testid={`block-${variant}`}
        >
          {width > 4 && (
            <span className="text-[10px] font-medium truncate px-1 leading-tight">
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

const addToPlanSchema = z.object({
  startTime: z.string().min(1, "Required"),
  endTime: z.string().min(1, "Required"),
  location: z.string().optional(),
  purpose: z.string().optional(),
  notes: z.string().optional(),
}).refine(data => data.endTime > data.startTime, {
  message: "End time must be after start time",
  path: ["endTime"],
});

export default function Availability() {
  const todayDay = getTodayDayName();
  const [selectedDay, setSelectedDay] = useState(todayDay);
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedInstructor, setSelectedInstructor] = useState<Instructor | null>(null);
  const [prefillTime, setPrefillTime] = useState<{ start: string; end: string; location: string } | null>(null);
  const { toast } = useToast();

  const todayDateStr = format(new Date(), "yyyy-MM-dd");

  const { data: rows = [], isLoading } = useQuery<AvailabilityRow[]>({
    queryKey: ["/api/availability", selectedDay],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/availability?dayOfWeek=${selectedDay}`);
      return res.json();
    },
    enabled: !!selectedDay,
  });

  const form = useForm<z.infer<typeof addToPlanSchema>>({
    resolver: zodResolver(addToPlanSchema),
    defaultValues: {
      startTime: "09:00",
      endTime: "10:00",
      location: "",
      purpose: "",
      notes: "",
    },
  });

  const createMeetingMutation = useMutation({
    mutationFn: async (values: z.infer<typeof addToPlanSchema>) => {
      return apiRequest("POST", "/api/planned-meetings", {
        ...values,
        instructorId: selectedInstructor!.id,
        date: todayDateStr,
        status: "planned",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planned-meetings"] });
      setAddDialogOpen(false);
      form.reset();
      toast({ title: "Added to plan", description: `Meeting with ${selectedInstructor?.name} added to today's plan.` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add meeting.", variant: "destructive" });
    },
  });

  const openAddDialog = (instructor: Instructor, row: AvailabilityRow) => {
    setSelectedInstructor(instructor);
    const firstOH = row.officeHours[0];
    const defaultStart = firstOH ? firstOH.startTime.slice(0, 5) : "09:00";
    const defaultEnd = firstOH ? firstOH.endTime.slice(0, 5) : "10:00";
    const defaultLocation = firstOH?.location || instructor.officeLocation || "";
    form.reset({
      startTime: defaultStart,
      endTime: defaultEnd,
      location: defaultLocation,
      purpose: "",
      notes: "",
    });
    setAddDialogOpen(true);
  };

  const departments = useMemo(() => {
    const depts = new Set<string>();
    rows.forEach(r => {
      if (r.instructor.department) depts.add(r.instructor.department);
    });
    return Array.from(depts).sort();
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (departmentFilter === "all") return rows;
    return rows.filter(r => r.instructor.department === departmentFilter);
  }, [rows, departmentFilter]);

  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => HOUR_START + i);

  const nowMinutes = useMemo(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }, []);

  const isToday = selectedDay === todayDay;
  const nowPosition = isToday ? minutesToPosition(nowMinutes) : -1;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-slate-900" data-testid="text-availability-title">
              Campus Availability
            </h1>
            <p className="text-slate-500 mt-1">See which instructors are likely on campus</p>
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Select value={selectedDay} onValueChange={setSelectedDay}>
                <SelectTrigger className="w-[160px]" data-testid="select-day">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS.map(day => (
                    <SelectItem key={day} value={day}>{day}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger className="w-[180px]" data-testid="select-department-filter">
                  <Filter className="w-4 h-4 mr-1 text-muted-foreground" />
                  <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departments.map(d => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-4 text-xs flex-wrap">
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
          </CardHeader>

          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-20 text-muted-foreground">
                Loading availability...
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground" data-testid="text-no-availability">
                <User className="w-10 h-10 mb-3 opacity-40" />
                <p className="font-medium">No instructors scheduled on {selectedDay}</p>
                <p className="text-sm">Try a different day or add office hours and lecture schedules</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[900px]">
                  <div className="flex border-b bg-muted/30">
                    <div className="w-56 shrink-0 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-r">
                      Instructor
                    </div>
                    <div className="flex-1 relative">
                      <div className="flex">
                        {hours.map(h => {
                          const label = h > 12 ? `${h - 12}p` : h === 12 ? "12p" : `${h}a`;
                          return (
                            <div
                              key={h}
                              className="flex-1 text-center text-[10px] text-muted-foreground py-2 border-r border-dashed border-muted-foreground/15 last:border-r-0"
                            >
                              {label}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {filteredRows.map((row) => {
                    const availWindows = computeAvailableWindows(row.officeHours, row.lectures);

                    return (
                      <div
                        key={row.instructor.id}
                        className="flex border-b last:border-b-0 hover-elevate"
                        data-testid={`row-instructor-${row.instructor.id}`}
                      >
                        <div className="w-56 shrink-0 px-4 py-3 border-r flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate" data-testid={`text-instructor-name-${row.instructor.id}`}>
                              {row.instructor.name}
                            </p>
                            {row.instructor.department && (
                              <span className="text-[11px] text-muted-foreground truncate block">{row.instructor.department}</span>
                            )}
                            {row.instructor.officeLocation && (
                              <div className="flex items-center gap-0.5 mt-0.5">
                                <MapPin className="w-2.5 h-2.5 text-muted-foreground" />
                                <span className="text-[10px] text-muted-foreground truncate">{row.instructor.officeLocation}</span>
                              </div>
                            )}
                          </div>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => openAddDialog(row.instructor, row)}
                                data-testid={`button-add-to-plan-${row.instructor.id}`}
                              >
                                <CalendarPlus className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Add to daily plan</TooltipContent>
                          </Tooltip>
                        </div>

                        <div className="flex-1 relative h-16">
                          {hours.map(h => (
                            <div
                              key={h}
                              className="absolute top-0 bottom-0 border-r border-dashed border-muted-foreground/10"
                              style={{ left: `${((h - HOUR_START) / TOTAL_HOURS) * 100}%` }}
                            />
                          ))}

                          {availWindows.map((w, i) => (
                            <TimeBlock
                              key={`avail-${i}`}
                              startMin={w.start}
                              endMin={w.end}
                              color="bg-amber-400/15 text-amber-800"
                              label="Likely in office"
                              variant="available"
                            />
                          ))}

                          {row.officeHours.map(oh => (
                            <TimeBlock
                              key={`oh-${oh.id}`}
                              startMin={timeToMinutes(oh.startTime)}
                              endMin={timeToMinutes(oh.endTime)}
                              color="bg-emerald-500/20 text-emerald-800"
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
                              color="bg-blue-500/20 text-blue-800"
                              label={lec.code}
                              sublabel={`${lec.name} · ${formatTime(lec.startTime)} - ${formatTime(lec.endTime)}${lec.building ? ` · ${lec.building}` : ""}${lec.room ? ` ${lec.room}` : ""}`}
                              variant="lecture"
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

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add {selectedInstructor?.name} to Today's Plan</DialogTitle>
            <DialogDescription>Schedule a meeting for {format(new Date(), "EEEE, MMMM d")}.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => createMeetingMutation.mutate(v))} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="startTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Time</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} data-testid="input-plan-start" />
                      </FormControl>
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
                      <FormControl>
                        <Input type="time" {...field} data-testid="input-plan-end" />
                      </FormControl>
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
                    <FormControl>
                      <Input placeholder="Building, room, or virtual link" {...field} data-testid="input-plan-location" />
                    </FormControl>
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
                    <FormControl>
                      <Input placeholder="e.g. Discuss textbook adoption" {...field} data-testid="input-plan-purpose" />
                    </FormControl>
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
                    <FormControl>
                      <Textarea placeholder="Any prep notes..." {...field} data-testid="input-plan-notes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={createMeetingMutation.isPending} data-testid="button-submit-plan">
                {createMeetingMutation.isPending ? "Adding..." : "Add to Daily Plan"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
