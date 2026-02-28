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
import { formatTime } from "@/lib/utils";
import { format } from "date-fns";
import { Plus, Clock, MapPin, Trash2, CalendarDays, Check, GripVertical, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Mic, Anchor, Zap, FileText, Save, DollarSign } from "lucide-react";
import type { PlannedMeeting, Instructor, OfficeHour, Course, Deal } from "@shared/schema";
import { InstructorDetailToggle } from "@/components/instructor-detail-popover";
import { VoiceDictation } from "@/components/voice-dictation";
import { AudioRecorder } from "@/components/audio-recorder";

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
  borderOverride,
}: {
  startMin: number;
  endMin: number;
  color: string;
  label: string;
  sublabel?: string;
  variant: "office" | "lecture" | "available" | "meeting";
  borderOverride?: string;
}) {
  const left = minutesToPosition(startMin);
  const width = minutesToWidth(startMin, endMin);
  if (width <= 0) return null;

  const borderClass = borderOverride || (variant === "office"
    ? "border-emerald-400/50"
    : variant === "lecture"
    ? "border-blue-400/50"
    : variant === "meeting"
    ? "border-purple-400/60"
    : "border-amber-300/40");

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
  meetingType: z.string().default("scheduled"),
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

const MEETING_TYPE_CONFIG: Record<string, { label: string; icon: typeof Anchor; className: string }> = {
  scheduled: { label: "Scheduled", icon: Anchor, className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  drop_in: { label: "Drop-in", icon: Zap, className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
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

  const { data: allDeals = [] } = useQuery<Deal[]>({ queryKey: ["/api/deals"] });
  const dealsByInstructor = useMemo(() => {
    const map = new Map<number, Deal[]>();
    for (const deal of allDeals) {
      if (deal.instructorId) {
        const list = map.get(deal.instructorId) || [];
        list.push(deal);
        map.set(deal.instructorId, list);
      }
    }
    return map;
  }, [allDeals]);

  const { data: availabilityRows = [] } = useQuery<AvailabilityRow[]>({
    queryKey: ["/api/availability", selectedDayName],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/availability?dayOfWeek=${selectedDayName}`);
      return res.json();
    },
    enabled: !!selectedDayName,
  });

  const getInstructor = (id: number) => instructors.find(i => i.id === id);

  const [expandedMeetingId, setExpandedMeetingId] = useState<number | null>(null);
  const [meetingNotes, setMeetingNotes] = useState<Record<number, string>>({});

  const form = useForm<MeetingFormValues>({
    resolver: zodResolver(meetingFormSchema),
    defaultValues: {
      instructorId: 0,
      startTime: "09:00",
      endTime: "10:00",
      location: "",
      purpose: "",
      notes: "",
      meetingType: "scheduled",
    },
  });

  const updateNotesMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: number; notes: string }) =>
      apiRequest("PUT", `/api/planned-meetings/${id}`, { notes }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/planned-meetings", selectedDateStr] });
      setMeetingNotes(prev => {
        const next = { ...prev };
        delete next[variables.id];
        return next;
      });
      toast({ title: "Notes saved", description: "Meeting notes updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save notes.", variant: "destructive" });
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

  const handleMoveRow = useCallback((fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= orderedPlannerRows.length) return;
    const currentIds = orderedPlannerRows.map(r => r.instructor.id);
    const [moved] = currentIds.splice(fromIdx, 1);
    currentIds.splice(toIdx, 0, moved);
    saveOrder(currentIds);
  }, [orderedPlannerRows, saveOrder]);

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
          <h1 className="text-2xl md:text-3xl font-display font-bold" data-testid="text-planner-title">Campus Plan</h1>
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
                              {inst.name} {(inst as any).department?.name ? `— ${(inst as any).department.name}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  name="meetingType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Meeting Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || "scheduled"}>
                        <FormControl>
                          <SelectTrigger data-testid="select-meeting-type">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="scheduled">
                            <span className="flex items-center gap-1.5">
                              <Anchor className="w-3.5 h-3.5" />
                              Scheduled — confirmed appointment
                            </span>
                          </SelectItem>
                          <SelectItem value="drop_in">
                            <span className="flex items-center gap-1.5">
                              <Zap className="w-3.5 h-3.5" />
                              Drop-in — flexible, no appointment
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
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

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
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
                  const instDeals = dealsByInstructor.get(meeting.instructorId) || [];
                  const typeConfig = MEETING_TYPE_CONFIG[meeting.meetingType || "scheduled"] || MEETING_TYPE_CONFIG.scheduled;
                  const TypeIcon = typeConfig.icon;
                  const isExpanded = expandedMeetingId === meeting.id;
                  const currentNotes = meetingNotes[meeting.id] ?? meeting.notes ?? "";

                  return (
                    <div key={meeting.id} className="rounded-md border" data-testid={`meeting-card-${meeting.id}`}>
                      <div className="p-2">
                        <div className="flex items-start justify-between gap-1">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-medium text-sm truncate" data-testid={`text-meeting-instructor-${meeting.id}`}>
                                {inst?.name || "Unknown"}
                              </span>
                              {instDeals.length > 0 && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] py-0 bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800 no-default-hover-elevate no-default-active-elevate"
                                      data-testid={`badge-deals-meeting-${meeting.id}`}
                                    >
                                      <DollarSign className="w-2.5 h-2.5 mr-0.5" />
                                      {instDeals.length}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-xs">
                                    <p className="font-semibold text-xs mb-1">Active Deals</p>
                                    {instDeals.map(d => (
                                      <p key={d.id} className="text-xs text-muted-foreground">
                                        {d.dealName}{d.amount ? ` - $${Number(d.amount).toLocaleString()}` : ""}
                                      </p>
                                    ))}
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              <Badge variant="secondary" className={`text-[10px] py-0 no-default-hover-elevate no-default-active-elevate ${typeConfig.className}`}>
                                <TypeIcon className="w-2.5 h-2.5 mr-0.5" />
                                {typeConfig.label}
                              </Badge>
                              <Badge variant="secondary" className={`text-[10px] py-0 no-default-hover-elevate no-default-active-elevate ${STATUS_COLORS[meeting.status || "planned"] || ""}`}>
                                {meeting.status || "planned"}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                              <span className="flex items-center gap-0.5">
                                <Clock className="w-3 h-3" />
                                {formatTime(meeting.startTime)} – {formatTime(meeting.endTime)}
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
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                if (isExpanded) {
                                  setExpandedMeetingId(null);
                                } else {
                                  setExpandedMeetingId(meeting.id);
                                  if (meetingNotes[meeting.id] === undefined) {
                                    setMeetingNotes(prev => ({ ...prev, [meeting.id]: meeting.notes || "" }));
                                  }
                                }
                              }}
                              data-testid={`button-expand-meeting-${meeting.id}`}
                            >
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                            </Button>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => updateStatusMutation.mutate({
                                    id: meeting.id,
                                    status: meeting.status === "completed" ? "planned" : "completed",
                                  })}
                                  className={meeting.status === "completed" ? "text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20" : ""}
                                  data-testid={`button-complete-meeting-${meeting.id}`}
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                {meeting.status === "completed" ? "Mark as planned" : "Mark as completed"}
                              </TooltipContent>
                            </Tooltip>
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

                      {isExpanded && (
                        <div className="border-t p-2 space-y-3" data-testid={`meeting-detail-${meeting.id}`}>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-xs font-medium">Meeting Notes</label>
                              <VoiceDictation
                                currentText={currentNotes}
                                onTranscript={(text) => setMeetingNotes(prev => ({ ...prev, [meeting.id]: text }))}
                              />
                            </div>
                            <Textarea
                              placeholder="Record what was discussed, action items, follow-ups..."
                              className="min-h-[80px] resize-none text-sm"
                              value={currentNotes}
                              onChange={(e) => setMeetingNotes(prev => ({ ...prev, [meeting.id]: e.target.value }))}
                              data-testid={`textarea-meeting-notes-${meeting.id}`}
                            />
                            <div className="flex items-center justify-between mt-1.5">
                              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <Mic className="h-2.5 w-2.5" /> Tap mic to dictate
                              </p>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={updateNotesMutation.isPending || currentNotes === (meeting.notes || "")}
                                onClick={() => updateNotesMutation.mutate({ id: meeting.id, notes: currentNotes })}
                                data-testid={`button-save-notes-${meeting.id}`}
                              >
                                <Save className="w-3 h-3 mr-1" />
                                {updateNotesMutation.isPending ? "Saving..." : "Save Notes"}
                              </Button>
                            </div>
                          </div>

                          <div className="border-t pt-2">
                            <label className="text-xs font-medium mb-1.5 block">Record Audio</label>
                            <AudioRecorder />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="lg:col-span-3 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="font-semibold text-base sm:text-lg">
              Day Plan — {date ? format(date, "EEEE, MMMM d, yyyy") : "Select a date"}
            </h3>
            <div className="flex items-center gap-3 text-xs flex-wrap">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-purple-500/25 border border-purple-400/60" />
                <span className="text-muted-foreground">Scheduled</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-amber-400/25 border border-dashed border-amber-400/60" />
                <span className="text-muted-foreground">Drop-in</span>
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
                      <div className="w-40 md:w-52 shrink-0 px-2 md:px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-r sticky left-0 z-10 bg-muted/30">
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
                          <div className="w-40 md:w-52 shrink-0 px-2 py-3 border-r flex items-center gap-1 sticky left-0 z-10 bg-background">
                            <div
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.effectAllowed = "move";
                                handleDragStart(rowIndex);
                              }}
                              className="hidden sm:block cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground shrink-0"
                              data-testid={`drag-handle-${row.instructor.id}`}
                            >
                              <GripVertical className="w-4 h-4" />
                            </div>
                            <div className="flex sm:hidden flex-col gap-0.5 shrink-0">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-5 w-5 text-muted-foreground/50"
                                disabled={rowIndex === 0}
                                onClick={() => handleMoveRow(rowIndex, rowIndex - 1)}
                                data-testid={`button-move-up-${row.instructor.id}`}
                              >
                                <ChevronUp className="w-3 h-3" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-5 w-5 text-muted-foreground/50"
                                disabled={rowIndex === orderedPlannerRows.length - 1}
                                onClick={() => handleMoveRow(rowIndex, rowIndex + 1)}
                                data-testid={`button-move-down-${row.instructor.id}`}
                              >
                                <ChevronDown className="w-3 h-3" />
                              </Button>
                            </div>
                            <div className="min-w-0 flex-1 flex flex-col justify-center">
                              <p className="font-medium text-sm truncate">{row.instructor.name}</p>
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
                              hubspotUrl={(() => {
                                const instDeals = dealsByInstructor.get(row.instructor.id) || [];
                                return instDeals.length > 0 && instDeals[0].hubspotContactId && row.instructor.email
                                  ? `https://app.hubspot.com/contacts/search?query=${encodeURIComponent(row.instructor.email)}`
                                  : null;
                              })()}
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

                            {row.meetings.map(m => {
                              const isDropIn = m.meetingType === "drop_in";
                              const meetingColor = m.status === "completed"
                                ? "bg-green-500/25 text-green-800"
                                : isDropIn
                                ? "bg-amber-400/25 text-amber-800 dark:text-amber-200"
                                : "bg-purple-500/25 text-purple-800";
                              const typeLabel = isDropIn ? "Drop-in" : "";
                              return (
                                <TimeBlock
                                  key={`meeting-${m.id}`}
                                  startMin={timeToMinutes(m.startTime)}
                                  endMin={timeToMinutes(m.endTime)}
                                  color={meetingColor}
                                  label={`${typeLabel ? typeLabel + ": " : ""}${m.purpose || "Meeting"}`}
                                  sublabel={`${isDropIn ? "Drop-in · " : "Scheduled · "}${formatTime(m.startTime)} - ${formatTime(m.endTime)}${m.location ? ` · ${m.location}` : ""}${m.status === "completed" ? " (Done)" : ""}`}
                                  variant="meeting"
                                  borderOverride={isDropIn ? "border-dashed border-amber-400/60" : undefined}
                                />
                              );
                            })}

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
