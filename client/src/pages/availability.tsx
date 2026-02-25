import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { MapPin, User, Filter, CalendarPlus, Building2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import type { Instructor, OfficeHour, Course } from "@shared/schema";
import { InstructorDetailToggle } from "@/components/instructor-detail-popover";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const HOUR_START = 7;
const HOUR_END = 21;
const TOTAL_HOURS = HOUR_END - HOUR_START;
const DEFAULT_MEETING_DURATION = 30;

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

function minutesToTimeStr(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
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

function findBestMeetingSlot(
  officeHours: OfficeHour[],
  lectures: LectureBlock[],
  durationMinutes: number = DEFAULT_MEETING_DURATION
): { start: number; end: number; location: string } | null {
  if (officeHours.length > 0) {
    const oh = officeHours[0];
    const ohStart = timeToMinutes(oh.startTime);
    const ohEnd = timeToMinutes(oh.endTime);
    if (ohEnd - ohStart >= durationMinutes) {
      return { start: ohStart, end: ohStart + durationMinutes, location: oh.location || "" };
    }
    return { start: ohStart, end: ohEnd, location: oh.location || "" };
  }

  const availWindows = computeAvailableWindows(officeHours, lectures);
  for (const w of availWindows) {
    const lectureTimes = lectures.map(l => ({
      start: timeToMinutes(l.startTime),
      end: timeToMinutes(l.endTime),
    }));
    const isLecture = lectureTimes.some(lt => lt.start === w.start && lt.end === w.end);
    if (isLecture) continue;

    if (w.end - w.start >= durationMinutes) {
      return { start: w.start, end: w.start + durationMinutes, location: "" };
    }
    if (w.end - w.start > 0) {
      return { start: w.start, end: w.end, location: "" };
    }
  }

  return null;
}

function TimeBlock({
  startMin,
  endMin,
  label,
  sublabel,
  variant,
  lane,
}: {
  startMin: number;
  endMin: number;
  label: string;
  sublabel?: string;
  variant: "office" | "lecture" | "available" | "meeting";
  lane: "top" | "bottom" | "full";
}) {
  const left = minutesToPosition(startMin);
  const width = minutesToWidth(startMin, endMin);
  if (width <= 0) return null;

  const colorMap = {
    office: "bg-emerald-500/30 text-emerald-900 dark:text-emerald-100 border-emerald-400/50",
    lecture: "bg-blue-500/30 text-blue-900 dark:text-blue-100 border-blue-400/50",
    available: "bg-amber-400/15 text-amber-900 dark:text-amber-100 border-amber-300/40",
    meeting: "bg-purple-500/25 text-purple-800 dark:text-purple-200 border-purple-400/60",
  };

  const laneStyle = lane === "top"
    ? "top-0.5 bottom-[50%]"
    : lane === "bottom"
    ? "top-[50%] bottom-0.5"
    : "top-0.5 bottom-0.5";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`absolute ${laneStyle} rounded-md border ${colorMap[variant]} flex items-center overflow-hidden cursor-default`}
          style={{ left: `${left}%`, width: `${width}%`, minWidth: "2px" }}
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

export default function Availability() {
  const todayDay = getTodayDayName();
  const [selectedDay, setSelectedDay] = useState(todayDay);
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [institutionFilter, setInstitutionFilter] = useState<string>("all");
  const [showAll, setShowAll] = useState(true);
  const { toast } = useToast();

  const todayDateStr = format(new Date(), "yyyy-MM-dd");

  const { data: rows = [], isLoading } = useQuery<AvailabilityRow[]>({
    queryKey: ["/api/availability", selectedDay, institutionFilter, showAll],
    queryFn: async () => {
      let url = `/api/availability?dayOfWeek=${selectedDay}&showAll=${showAll}`;
      if (institutionFilter !== "all") url += `&institution=${encodeURIComponent(institutionFilter)}`;
      const res = await apiRequest("GET", url);
      return res.json();
    },
    enabled: !!selectedDay,
  });

  const quickAddMutation = useMutation({
    mutationFn: async (payload: { instructorId: number; startTime: string; endTime: string; location: string }) => {
      return apiRequest("POST", "/api/planned-meetings", {
        ...payload,
        date: todayDateStr,
        status: "planned",
        purpose: "",
        notes: "",
      });
    },
    onSuccess: (_data, variables) => {
      const inst = rows.find(r => r.instructor.id === variables.instructorId)?.instructor;
      queryClient.invalidateQueries({ queryKey: ["/api/planned-meetings"] });
      toast({
        title: "Added to today's plan",
        description: `${inst?.name || "Instructor"} at ${formatTime(variables.startTime)} – ${formatTime(variables.endTime)}`,
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add meeting.", variant: "destructive" });
    },
  });

  const handleQuickAdd = (row: AvailabilityRow) => {
    const slot = findBestMeetingSlot(row.officeHours, row.lectures);
    if (!slot) {
      toast({ title: "No available slot", description: "Could not find an available time for this instructor.", variant: "destructive" });
      return;
    }
    quickAddMutation.mutate({
      instructorId: row.instructor.id,
      startTime: minutesToTimeStr(slot.start),
      endTime: minutesToTimeStr(slot.end),
      location: slot.location || row.instructor.officeLocation || "",
    });
  };

  const allInstitutionsQuery = useQuery<{ id: number; name: string; domain: string; state: string; classification: string }[]>({
    queryKey: ["/api/institutions"],
  });

  const allDepartmentsQuery = useQuery<{ id: number; name: string; institutionId: number; institution: any }[]>({
    queryKey: ["/api/departments"],
  });

  const departments = useMemo(() => {
    if (!allDepartmentsQuery.data) return [];
    let depts = allDepartmentsQuery.data;
    if (institutionFilter !== "all") {
      depts = depts.filter(d => d.institution?.name === institutionFilter);
    }
    return Array.from(new Set(depts.map(d => d.name))).sort();
  }, [allDepartmentsQuery.data, institutionFilter]);

  const institutions = useMemo(() => {
    if (!allInstitutionsQuery.data) return [];
    return allInstitutionsQuery.data.map(i => i.name).sort();
  }, [allInstitutionsQuery.data]);

  const filteredRows = useMemo(() => {
    let filtered = rows;
    if (departmentFilter !== "all") {
      filtered = filtered.filter(r => (r.instructor as any).department?.name === departmentFilter);
    }
    return filtered;
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
          <CardHeader className="flex flex-col gap-4 space-y-0 pb-4">
            <div className="flex flex-row items-center justify-between gap-4 flex-wrap">
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

                <Select value={institutionFilter} onValueChange={(val) => { setInstitutionFilter(val); setDepartmentFilter("all"); }}>
                  <SelectTrigger className="w-[200px]" data-testid="select-institution-filter">
                    <Building2 className="w-4 h-4 mr-1 text-muted-foreground" />
                    <SelectValue placeholder="All Institutions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Institutions</SelectItem>
                    {institutions.map(inst => (
                      <SelectItem key={inst} value={inst}>{inst}</SelectItem>
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

                <div className="flex items-center gap-2">
                  <Switch
                    id="show-all"
                    checked={showAll}
                    onCheckedChange={setShowAll}
                    data-testid="switch-show-all"
                  />
                  <Label htmlFor="show-all" className="text-sm text-muted-foreground cursor-pointer">
                    Show all instructors
                  </Label>
                </div>
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
                <p className="font-medium">No instructors found for {selectedDay}</p>
                <p className="text-sm">Try a different day, adjust filters, or enable "Show all instructors"</p>
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
                    const hasSchedule = row.officeHours.length > 0 || row.lectures.length > 0;

                    return (
                      <div
                        key={row.instructor.id}
                        className={`flex border-b last:border-b-0 hover-elevate ${!hasSchedule ? "opacity-60" : ""}`}
                        data-testid={`row-instructor-${row.instructor.id}`}
                      >
                        <div className="w-56 shrink-0 px-4 py-3 border-r flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate" data-testid={`text-instructor-name-${row.instructor.id}`}>
                              {row.instructor.name}
                            </p>
                            {(row.instructor as any).department?.institution?.name && (
                              <span className="text-[11px] text-muted-foreground truncate block">
                                {(row.instructor as any).department.institution.name}
                              </span>
                            )}
                            {(row.instructor as any).department?.name && (
                              <span className="text-[10px] text-muted-foreground truncate block">{(row.instructor as any).department.name}</span>
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
                          {hasSchedule && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => handleQuickAdd(row)}
                                  disabled={quickAddMutation.isPending}
                                  data-testid={`button-add-to-plan-${row.instructor.id}`}
                                >
                                  <CalendarPlus className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Add to today's plan</TooltipContent>
                            </Tooltip>
                          )}
                        </div>

                        <div className="flex-1 relative h-16">
                          {hours.map(h => (
                            <div
                              key={h}
                              className="absolute top-0 bottom-0 border-r border-dashed border-muted-foreground/10"
                              style={{ left: `${((h - HOUR_START) / TOTAL_HOURS) * 100}%` }}
                            />
                          ))}

                          {!hasSchedule && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="text-xs text-muted-foreground">No schedule data</span>
                            </div>
                          )}

                          {availWindows.map((w, i) => (
                            <TimeBlock
                              key={`avail-${i}`}
                              startMin={w.start}
                              endMin={w.end}
                              label="Likely available"
                              variant="available"
                              lane="full"
                            />
                          ))}

                          {row.officeHours.map(oh => (
                            <TimeBlock
                              key={`oh-${oh.id}`}
                              startMin={timeToMinutes(oh.startTime)}
                              endMin={timeToMinutes(oh.endTime)}
                              label={`Office Hrs${oh.location ? ` - ${oh.location}` : ""}`}
                              sublabel={`${formatTime(oh.startTime)} - ${formatTime(oh.endTime)}${oh.location ? ` · ${oh.location}` : ""}`}
                              variant="office"
                              lane="top"
                            />
                          ))}

                          {row.lectures.map(lec => (
                            <TimeBlock
                              key={`lec-${lec.id}`}
                              startMin={timeToMinutes(lec.startTime)}
                              endMin={timeToMinutes(lec.endTime)}
                              label={`${lec.code}${lec.building ? ` - ${lec.building}` : ""}${lec.room ? ` ${lec.room}` : ""}`}
                              sublabel={`${lec.name} · ${formatTime(lec.startTime)} - ${formatTime(lec.endTime)}${lec.building ? ` · ${lec.building}` : ""}${lec.room ? ` ${lec.room}` : ""}`}
                              variant="lecture"
                              lane="bottom"
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
    </Layout>
  );
}
