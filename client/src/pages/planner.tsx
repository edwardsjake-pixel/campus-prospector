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
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Plus, Clock, MapPin, User, Trash2, CalendarDays } from "lucide-react";
import type { PlannedMeeting, Instructor, OfficeHour } from "@shared/schema";

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

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const STATUS_COLORS: Record<string, string> = {
  planned: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  completed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

export default function Planner() {
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
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

  const { data: officeHours = [] } = useQuery<OfficeHour[]>({
    queryKey: ["/api/office-hours"],
  });

  const matchingOfficeHours = officeHours.filter(oh => oh.dayOfWeek === selectedDayName);

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
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/planned-meetings/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planned-meetings", selectedDateStr] });
      toast({ title: "Removed", description: "Meeting removed from plan." });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      return apiRequest("PUT", `/api/planned-meetings/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/planned-meetings", selectedDateStr] });
    },
  });

  const sortedMeetings = [...meetings].sort((a, b) => a.startTime.localeCompare(b.startTime));

  const prefillFromOfficeHour = (oh: OfficeHour) => {
    const instructor = getInstructor(oh.instructorId);
    form.reset({
      instructorId: oh.instructorId,
      startTime: oh.startTime.slice(0, 5),
      endTime: oh.endTime.slice(0, 5),
      location: oh.location || instructor?.officeLocation || "",
      purpose: "",
      notes: "",
    });
    setDialogOpen(true);
  };

  return (
    <Layout>
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-display font-bold" data-testid="text-planner-title">Visit Planner</h1>
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
                      <Select
                        onValueChange={field.onChange}
                        value={field.value ? String(field.value) : ""}
                      >
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
                        <FormControl>
                          <Input type="time" {...field} data-testid="input-meeting-start" />
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
                          <Input type="time" {...field} data-testid="input-meeting-end" />
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
                        <Input placeholder="Building, room, or virtual link" {...field} data-testid="input-meeting-location" />
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
                        <Input placeholder="e.g. Discuss textbook adoption" {...field} data-testid="input-meeting-purpose" />
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
                        <Textarea placeholder="Any prep notes..." {...field} data-testid="input-meeting-notes" />
                      </FormControl>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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

          {matchingOfficeHours.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <CalendarDays className="w-4 h-4" />
                  Office Hours on {selectedDayName}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {matchingOfficeHours.map((oh) => {
                  const inst = getInstructor(oh.instructorId);
                  return (
                    <div
                      key={oh.id}
                      className="flex items-center justify-between gap-2 p-2 rounded-md hover-elevate cursor-pointer"
                      onClick={() => prefillFromOfficeHour(oh)}
                      data-testid={`office-hour-${oh.id}`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{inst?.name || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground">
                          {oh.startTime.slice(0, 5)} – {oh.endTime.slice(0, 5)}
                          {oh.location ? ` · ${oh.location}` : ""}
                        </p>
                      </div>
                      <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); prefillFromOfficeHour(oh); }}>
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="lg:col-span-2 space-y-4">
          <h3 className="font-semibold text-lg">
            Day Plan — {date ? format(date, "EEEE, MMMM d, yyyy") : "Select a date"}
          </h3>

          {meetingsLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : sortedMeetings.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CalendarDays className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="font-medium text-muted-foreground" data-testid="text-no-meetings">No meetings planned</p>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  Click "Add Meeting" or pick from office hours on the left.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {sortedMeetings.map((meeting) => {
                const inst = getInstructor(meeting.instructorId);
                return (
                  <Card key={meeting.id} data-testid={`meeting-card-${meeting.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold" data-testid={`text-meeting-instructor-${meeting.id}`}>
                              {inst?.name || "Unknown Instructor"}
                            </span>
                            <Badge
                              variant="secondary"
                              className={STATUS_COLORS[meeting.status || "planned"] || ""}
                              data-testid={`badge-meeting-status-${meeting.id}`}
                            >
                              {meeting.status || "planned"}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              {meeting.startTime.slice(0, 5)} – {meeting.endTime.slice(0, 5)}
                            </span>
                            {meeting.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5" />
                                {meeting.location}
                              </span>
                            )}
                            {inst?.department && (
                              <span className="flex items-center gap-1">
                                <User className="w-3.5 h-3.5" />
                                {inst.department}
                              </span>
                            )}
                          </div>
                          {meeting.purpose && (
                            <p className="text-sm mt-1">{meeting.purpose}</p>
                          )}
                          {meeting.notes && (
                            <p className="text-sm text-muted-foreground mt-1">{meeting.notes}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {meeting.status !== "completed" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => updateStatusMutation.mutate({ id: meeting.id, status: "completed" })}
                              data-testid={`button-complete-meeting-${meeting.id}`}
                            >
                              Done
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => deleteMutation.mutate(meeting.id)}
                            data-testid={`button-delete-meeting-${meeting.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
