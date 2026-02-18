import { useMemo } from "react";
import { Layout } from "@/components/layout";
import { StatCard } from "@/components/stat-card";
import { Users, BookOpen, Calendar, ArrowRight, Clock, Anchor, Zap, FileText, Plus, ClipboardList, DollarSign, Building2 } from "lucide-react";
import { useInstructors } from "@/hooks/use-instructors";
import { useCourses } from "@/hooks/use-courses";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { format, startOfWeek, addDays, isToday } from "date-fns";
import type { PlannedMeeting, Instructor, Deal } from "@shared/schema";

function getWeekDays(reference: Date): Date[] {
  const monday = startOfWeek(reference, { weekStartsOn: 1 });
  return Array.from({ length: 5 }, (_, i) => addDays(monday, i));
}

function formatTime(t: string) {
  const [h, m] = t.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${m} ${ampm}`;
}

function WeeklyCalendar({
  meetings,
  instructors,
  weekDays,
}: {
  meetings: PlannedMeeting[];
  instructors: Instructor[];
  weekDays: Date[];
}) {
  const [, setLocation] = useLocation();
  const getInstructor = (id: number) => instructors.find(i => i.id === id);

  return (
    <Card data-testid="card-weekly-calendar">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-lg">This Week</CardTitle>
        <Link href="/planner">
          <Button variant="ghost" size="sm">
            Campus Plan <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-5 gap-2">
          {weekDays.map((day) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const dayMeetings = meetings
              .filter(m => m.date === dateStr)
              .sort((a, b) => a.startTime.localeCompare(b.startTime));
            const today = isToday(day);

            return (
              <div
                key={dateStr}
                className={`rounded-md border p-2 min-h-[140px] cursor-pointer hover-elevate ${today ? "border-primary/50 bg-primary/5" : ""}`}
                onClick={() => setLocation(`/planner?date=${dateStr}`)}
                data-testid={`week-day-${dateStr}`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-xs font-semibold ${today ? "text-primary" : "text-muted-foreground"}`}>
                    {format(day, "EEE")}
                  </span>
                  <span className={`text-xs font-medium ${today ? "bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center" : "text-muted-foreground"}`}>
                    {format(day, "d")}
                  </span>
                </div>
                {dayMeetings.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] py-0 mb-1.5 no-default-hover-elevate no-default-active-elevate">
                    {dayMeetings.length} meeting{dayMeetings.length > 1 ? "s" : ""}
                  </Badge>
                )}
                <div className="space-y-1">
                  {dayMeetings.slice(0, 3).map(m => {
                    const isDropIn = m.meetingType === "drop_in";
                    const inst = getInstructor(m.instructorId);
                    return (
                      <Tooltip key={m.id}>
                        <TooltipTrigger asChild>
                          <div
                            className={`rounded px-1.5 py-0.5 text-[10px] truncate ${
                              m.status === "completed"
                                ? "bg-green-500/20 text-green-800 dark:text-green-200"
                                : isDropIn
                                ? "bg-amber-400/20 text-amber-800 dark:text-amber-200 border border-dashed border-amber-400/40"
                                : "bg-purple-500/20 text-purple-800 dark:text-purple-200"
                            }`}
                            data-testid={`week-meeting-${m.id}`}
                          >
                            {m.startTime.slice(0, 5)} {inst?.name?.split(" ")[0] || ""}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p className="font-semibold text-sm">{inst?.name || "Unknown"}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatTime(m.startTime)} – {formatTime(m.endTime)}
                            {m.location ? ` · ${m.location}` : ""}
                          </p>
                          {m.purpose && <p className="text-xs">{m.purpose}</p>}
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {isDropIn ? "Drop-in" : "Scheduled"} · {m.status || "planned"}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                  {dayMeetings.length > 3 && (
                    <p className="text-[10px] text-muted-foreground pl-1">+{dayMeetings.length - 3} more</p>
                  )}
                </div>
                {dayMeetings.length === 0 && (
                  <p className="text-[10px] text-muted-foreground italic mt-2">No meetings</p>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 mt-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-purple-500/20 border border-purple-400/50" /> Scheduled
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-400/20 border border-dashed border-amber-400/50" /> Drop-in
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-green-500/20 border border-green-400/50" /> Completed
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function TodaysAgenda({
  meetings,
  instructors,
}: {
  meetings: PlannedMeeting[];
  instructors: Instructor[];
}) {
  const getInstructor = (id: number) => instructors.find(i => i.id === id);
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const todayMeetings = meetings
    .filter(m => m.date === todayStr)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  return (
    <Card data-testid="card-todays-agenda">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Today's Agenda
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {todayMeetings.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground">No meetings today.</p>
            <Link href="/planner">
              <Button variant="outline" size="sm" className="mt-2">
                Plan Your Day
              </Button>
            </Link>
          </div>
        ) : (
          todayMeetings.map((m) => {
            const inst = getInstructor(m.instructorId);
            const isDropIn = m.meetingType === "drop_in";
            const TypeIcon = isDropIn ? Zap : Anchor;

            return (
              <div
                key={m.id}
                className={`flex items-start gap-2 p-2 rounded-md border ${m.status === "completed" ? "opacity-60" : ""}`}
                data-testid={`agenda-meeting-${m.id}`}
              >
                <div className={`mt-0.5 p-1 rounded ${isDropIn ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"}`}>
                  <TypeIcon className="w-3 h-3" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-sm truncate">{inst?.name || "Unknown"}</span>
                    {m.status === "completed" && (
                      <Badge variant="secondary" className="text-[10px] py-0 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 no-default-hover-elevate no-default-active-elevate">
                        Done
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatTime(m.startTime)} – {formatTime(m.endTime)}
                    {m.location ? ` · ${m.location}` : ""}
                  </p>
                  {m.purpose && (
                    <p className="text-xs text-muted-foreground mt-0.5">{m.purpose}</p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function RecentNotes({
  meetings,
  instructors,
}: {
  meetings: PlannedMeeting[];
  instructors: Instructor[];
}) {
  const getInstructor = (id: number) => instructors.find(i => i.id === id);
  const meetingsWithNotes = meetings
    .filter(m => m.notes && m.notes.trim().length > 0)
    .sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime))
    .slice(0, 5);

  return (
    <Card data-testid="card-recent-notes">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Recent Notes
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {meetingsWithNotes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No meeting notes yet. Expand a meeting on the Campus Plan page to add notes.
          </p>
        ) : (
          meetingsWithNotes.map((m) => {
            const inst = getInstructor(m.instructorId);
            return (
              <div key={m.id} className="p-2 rounded-md border" data-testid={`recent-note-${m.id}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm truncate">{inst?.name || "Unknown"}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {format(new Date(m.date + "T00:00:00"), "MMM d")}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{m.notes}</p>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function DealPipeline({
  deals,
  stageLabels,
  instructors,
}: {
  deals: Deal[];
  stageLabels: Record<string, string>;
  instructors: Instructor[];
}) {
  const getInstructor = (id: number | null) => id ? instructors.find(i => i.id === id) : null;

  const stageGroups = useMemo(() => {
    const groups = new Map<string, { label: string; deals: Deal[]; total: number }>();
    for (const deal of deals) {
      const stageKey = deal.stage || "unknown";
      const label = stageLabels[stageKey] || stageKey;
      if (!groups.has(stageKey)) {
        groups.set(stageKey, { label, deals: [], total: 0 });
      }
      const group = groups.get(stageKey)!;
      group.deals.push(deal);
      group.total += Number(deal.amount) || 0;
    }
    return Array.from(groups.values()).sort((a, b) => b.total - a.total);
  }, [deals, stageLabels]);

  const totalValue = deals.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

  if (deals.length === 0) return null;

  return (
    <Card data-testid="card-deal-pipeline">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <DollarSign className="w-4 h-4" />
          Deal Pipeline
        </CardTitle>
        <Badge variant="secondary" className="no-default-hover-elevate no-default-active-elevate" data-testid="text-deal-pipeline-total">
          ${totalValue.toLocaleString()}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        {stageGroups.map((group) => (
          <div key={group.label} className="p-2 rounded-md border" data-testid={`pipeline-stage-${group.label}`}>
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-sm font-medium truncate">{group.label}</span>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="secondary" className="text-[10px] py-0 no-default-hover-elevate no-default-active-elevate" data-testid={`text-stage-deal-count-${group.label}`}>
                  {group.deals.length} deal{group.deals.length > 1 ? "s" : ""}
                </Badge>
                {group.total > 0 && (
                  <span className="text-xs font-semibold text-muted-foreground">
                    ${group.total.toLocaleString()}
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {group.deals.slice(0, 4).map((deal) => {
                const inst = getInstructor(deal.instructorId);
                return (
                  <Tooltip key={deal.id}>
                    <TooltipTrigger asChild>
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800 no-default-hover-elevate no-default-active-elevate"
                        data-testid={`deal-badge-${deal.id}`}
                      >
                        {deal.dealName}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <p className="font-semibold text-sm">{deal.dealName}</p>
                      {inst && <p className="text-xs text-muted-foreground">{inst.name}</p>}
                      {deal.amount && <p className="text-xs">${Number(deal.amount).toLocaleString()}</p>}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
              {group.deals.length > 4 && (
                <span className="text-[10px] text-muted-foreground self-center">+{group.deals.length - 4} more</span>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function InstitutionBreakdown({ instructors }: { instructors: Instructor[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, number>();
    for (const inst of instructors) {
      const key = inst.institution || "Unknown";
      map.set(key, (map.get(key) || 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [instructors]);

  if (groups.length <= 1) return null;

  return (
    <Card data-testid="card-institution-breakdown">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Building2 className="w-4 h-4" />
          By Institution
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {groups.map(([name, count]) => {
          const pct = Math.round((count / instructors.length) * 100);
          return (
            <div key={name} data-testid={`institution-row-${name}`}>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{name}</span>
                <span className="text-xs text-muted-foreground shrink-0" data-testid={`text-institution-count-${name}`}>{count} ({pct}%)</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted mt-0.5">
                <div
                  className="h-full rounded-full bg-primary/60"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function QuickActions() {
  const [, setLocation] = useLocation();
  const tomorrow = format(addDays(new Date(), 1), "yyyy-MM-dd");

  return (
    <Card data-testid="card-quick-actions">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Button
            variant="outline"
            className="justify-start gap-2"
            onClick={() => setLocation(`/planner?date=${tomorrow}`)}
            data-testid="button-plan-tomorrow"
          >
            <Calendar className="w-4 h-4" />
            Plan Tomorrow
          </Button>
          <Link href="/visits">
            <Button variant="outline" className="w-full justify-start gap-2" data-testid="button-log-visit">
              <ClipboardList className="w-4 h-4" />
              Log a Visit
            </Button>
          </Link>
          <Link href="/planner">
            <Button variant="outline" className="w-full justify-start gap-2" data-testid="button-add-meeting">
              <Plus className="w-4 h-4" />
              Add Meeting
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: instructors } = useInstructors();
  const { data: courses } = useCourses();
  const { data: allMeetings, isLoading: meetingsLoading } = useQuery<PlannedMeeting[]>({
    queryKey: ["/api/planned-meetings"],
  });
  const { data: allDeals } = useQuery<Deal[]>({ queryKey: ["/api/deals"] });
  const { data: dealStageLabels } = useQuery<Record<string, string>>({ queryKey: ["/api/hubspot/deal-stages"] });

  const weekDays = useMemo(() => getWeekDays(new Date()), []);
  const meetings = allMeetings || [];
  const deals = allDeals || [];

  const totalStudents = courses?.reduce((acc, curr) => acc + (curr.enrollment || 0), 0) || 0;

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const todayMeetingCount = meetings.filter(m => m.date === todayStr).length;

  const weekStart = format(weekDays[0], "yyyy-MM-dd");
  const weekEnd = format(weekDays[4], "yyyy-MM-dd");
  const weekMeetingCount = meetings.filter(m => m.date >= weekStart && m.date <= weekEnd).length;

  return (
    <Layout>
      <div className="space-y-2">
        <h1 className="text-3xl font-display font-bold" data-testid="text-dashboard-title">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back! Here's what's happening on campus.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Active Instructors"
          value={instructors?.length || 0}
          icon={Users}
          color="primary"
        />
        <StatCard
          title="Student Reach"
          value={totalStudents.toLocaleString()}
          icon={BookOpen}
          color="blue"
        />
        <StatCard
          title="Today's Meetings"
          value={todayMeetingCount}
          icon={Clock}
          color="orange"
        />
        <StatCard
          title="This Week"
          value={`${weekMeetingCount} planned`}
          icon={Calendar}
          color="green"
        />
      </div>

      <QuickActions />

      {meetingsLoading ? (
        <Skeleton className="h-[200px] w-full rounded-md" />
      ) : (
        <WeeklyCalendar
          meetings={meetings}
          instructors={instructors || []}
          weekDays={weekDays}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {meetingsLoading ? (
          <>
            <Skeleton className="h-[200px] w-full rounded-md" />
            <Skeleton className="h-[200px] w-full rounded-md" />
          </>
        ) : (
          <>
            <TodaysAgenda meetings={meetings} instructors={instructors || []} />
            <RecentNotes meetings={meetings} instructors={instructors || []} />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {deals.length > 0 && (
          <DealPipeline
            deals={deals}
            stageLabels={dealStageLabels || {}}
            instructors={instructors || []}
          />
        )}
        {instructors && instructors.length > 0 && (
          <InstitutionBreakdown instructors={instructors} />
        )}
      </div>
    </Layout>
  );
}
