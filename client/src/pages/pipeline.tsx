import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Loader2,
  Database,
  CheckCircle2,
  XCircle,
  Clock,
  Play,
  RefreshCw,
  Wifi,
  Search,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Institution, ScrapeJob } from "@shared/schema";

// ─── Constants ────────────────────────────────────────────────────────────────

const JOB_TYPE_LABELS: Record<string, string> = {
  faculty_directory: "Faculty Directory",
  course_schedule: "Course Schedule",
  rmp: "Rate My Professors",
  linkedin: "LinkedIn",
  syllabus: "Syllabus Hunter",
  institution_it: "IT Contacts",
};

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "pending":
      return (
        <Badge variant="secondary" className="gap-1 bg-slate-100 text-slate-600 hover:bg-slate-100">
          <Clock className="w-3 h-3" /> Pending
        </Badge>
      );
    case "running":
      return (
        <Badge className="gap-1 bg-blue-500 hover:bg-blue-500 text-white">
          <Loader2 className="w-3 h-3 animate-spin" /> Running
        </Badge>
      );
    case "complete":
      return (
        <Badge className="gap-1 bg-green-500 hover:bg-green-500 text-white">
          <CheckCircle2 className="w-3 h-3" /> Complete
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="w-3 h-3" /> Failed
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

// ─── Health summary ───────────────────────────────────────────────────────────

function HealthSummary({
  status,
  isLoading,
}: {
  status: { total: number; pending: number; running: number; complete: number; failed: number; healthy: boolean; timestamp: string } | undefined;
  isLoading: boolean;
}) {
  if (isLoading) return <Skeleton className="h-28 w-full rounded-xl" />;

  const stats = [
    { label: "Total", value: status?.total ?? 0, className: "text-slate-700" },
    { label: "Pending", value: status?.pending ?? 0, className: "text-slate-500" },
    { label: "Running", value: status?.running ?? 0, className: "text-blue-600" },
    { label: "Complete", value: status?.complete ?? 0, className: "text-green-600" },
    { label: "Failed", value: status?.failed ?? 0, className: "text-red-600" },
  ];

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Wifi className="w-4 h-4" />
          Pipeline Health
        </CardTitle>
        <Badge
          className={
            status?.healthy
              ? "bg-green-500 hover:bg-green-500 text-white"
              : "bg-red-500 hover:bg-red-500 text-white"
          }
        >
          {status?.healthy ? "Healthy" : "Degraded"}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-5 gap-2 text-center">
          {stats.map((s) => (
            <div key={s.label}>
              <p className={`text-2xl font-bold ${s.className}`}>{s.value}</p>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
        {status?.timestamp && (
          <p className="text-[10px] text-muted-foreground mt-3 text-right">
            Updated {formatDistanceToNow(new Date(status.timestamp), { addSuffix: true })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Institutions panel ───────────────────────────────────────────────────────

function InstitutionsPanel({
  institutions,
  isLoading,
  scrapingIds,
  onScrape,
}: {
  institutions: Institution[] | undefined;
  isLoading: boolean;
  scrapingIds: Set<number>;
  onScrape: (id: number) => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = (institutions ?? []).filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Database className="w-4 h-4" />
          Institutions
        </CardTitle>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Filter…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {search ? "No institutions match your filter." : "No institutions found."}
          </p>
        ) : (
          <div className="divide-y max-h-[400px] overflow-y-auto">
            {filtered.map((inst) => (
              <div
                key={inst.id}
                className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/40 transition-colors"
              >
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{inst.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {[inst.city, inst.state].filter(Boolean).join(", ") || inst.domain || "—"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 shrink-0 ml-3 h-8"
                  onClick={() => onScrape(inst.id)}
                  disabled={scrapingIds.has(inst.id)}
                  data-testid={`button-scrape-${inst.id}`}
                >
                  {scrapingIds.has(inst.id) ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5" />
                  )}
                  Scrape
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Jobs table ───────────────────────────────────────────────────────────────

function fmtTs(ts: string | Date | null | undefined): string {
  if (!ts) return "—";
  try {
    return formatDistanceToNow(new Date(ts as string), { addSuffix: true });
  } catch {
    return "—";
  }
}

function JobsTable({
  jobs,
  institutions,
  isLoading,
  onRetry,
  retryingIds,
}: {
  jobs: ScrapeJob[] | undefined;
  institutions: Institution[] | undefined;
  isLoading: boolean;
  onRetry: (institutionId: number) => void;
  retryingIds: Set<number>;
}) {
  const instMap = new Map((institutions ?? []).map((i) => [i.id, i]));
  const sorted = [...(jobs ?? [])].sort((a, b) => b.id - a.id);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Scrape Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base">Scrape Jobs</CardTitle>
        {jobs && jobs.length > 0 && (
          <span className="text-xs text-muted-foreground">{jobs.length} total</span>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">
            No scrape jobs yet. Click <strong>Scrape</strong> on an institution above to get started.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[220px]">Institution</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Started</TableHead>
                  <TableHead className="hidden md:table-cell">Completed</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">Records</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((job) => {
                  const inst = instMap.get(job.institutionId);
                  const isFailed = job.status === "failed";
                  const isRetrying = retryingIds.has(job.institutionId);

                  return (
                    <TableRow
                      key={job.id}
                      className={isFailed ? "bg-red-50/50 dark:bg-red-950/10" : undefined}
                      data-testid={`job-row-${job.id}`}
                    >
                      <TableCell className="font-medium text-sm">
                        <span className="truncate block max-w-[200px]">
                          {inst?.name ?? `Institution #${job.institutionId}`}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {JOB_TYPE_LABELS[job.jobType] ?? job.jobType}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={job.status} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground hidden md:table-cell">
                        {fmtTs(job.startedAt)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground hidden md:table-cell">
                        {fmtTs(job.completedAt)}
                      </TableCell>
                      <TableCell className="text-right text-sm hidden sm:table-cell">
                        {job.recordsAdded != null ? job.recordsAdded : "—"}
                      </TableCell>
                      <TableCell className="text-right pr-4">
                        {isFailed ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                                onClick={() => onRetry(job.institutionId)}
                                disabled={isRetrying}
                                data-testid={`button-retry-job-${job.id}`}
                              >
                                {isRetrying ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="w-3 h-3" />
                                )}
                                Retry
                              </Button>
                            </TooltipTrigger>
                            {job.errorMessage && (
                              <TooltipContent side="left" className="max-w-xs">
                                <p className="text-xs font-mono">{job.errorMessage}</p>
                              </TooltipContent>
                            )}
                          </Tooltip>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Scraped Data tab ─────────────────────────────────────────────────────────

type InstructorRow = {
  id: number;
  name: string;
  email: string | null;
  tenureStatus: string | null;
  avgRating: number | null;
  avgDifficulty: number | null;
  numRatings: number | null;
  wouldTakeAgainPercent: number | null;
  department: { name: string; institution: { name: string } } | null;
};

type CourseRow = {
  id: number;
  code: string;
  name: string;
  daysOfWeek: string | null;
  lectureStartTime: string | null;
  lectureEndTime: string | null;
  building: string | null;
  room: string | null;
};

function EmptyState({ text }: { text: string }) {
  return (
    <p className="text-sm text-muted-foreground text-center py-10">{text}</p>
  );
}

function ScrapedDataTab({
  institutions,
  instsLoading,
  jobs,
}: {
  institutions: Institution[] | undefined;
  instsLoading: boolean;
  jobs: ScrapeJob[] | undefined;
}) {
  const [selectedInstId, setSelectedInstId] = useState<string>("");
  const instId = selectedInstId ? Number(selectedInstId) : undefined;

  const hasActiveJobs = jobs?.some(
    (j) => j.institutionId === instId && (j.status === "pending" || j.status === "running")
  );

  const { data: instructors, isLoading: instructorsLoading } = useQuery<InstructorRow[]>({
    queryKey: ["/api/instructors", { institutionId: instId }],
    queryFn: () =>
      fetch(`/api/instructors?institutionId=${instId}`).then((r) => r.json()),
    enabled: !!instId,
    refetchInterval: hasActiveJobs ? 10000 : false,
  });

  const { data: courses, isLoading: coursesLoading } = useQuery<CourseRow[]>({
    queryKey: ["/api/courses", { institutionId: instId }],
    queryFn: () =>
      fetch(`/api/courses?institutionId=${instId}`).then((r) => r.json()),
    enabled: !!instId,
    refetchInterval: hasActiveJobs ? 10000 : false,
  });

  const rmpRows = (instructors ?? []).filter((i) => i.avgRating != null);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={selectedInstId} onValueChange={setSelectedInstId}>
          <SelectTrigger className="w-72">
            <SelectValue placeholder={instsLoading ? "Loading…" : "Select an institution"} />
          </SelectTrigger>
          <SelectContent>
            {(institutions ?? []).map((i) => (
              <SelectItem key={i.id} value={String(i.id)}>
                {i.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasActiveJobs && (
          <Badge className="gap-1 bg-blue-500 hover:bg-blue-500 text-white text-xs">
            <Loader2 className="w-3 h-3 animate-spin" /> Scraping…
          </Badge>
        )}
      </div>

      {!instId ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Select an institution to view scraped data.
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="faculty">
          <TabsList>
            <TabsTrigger value="faculty">Faculty</TabsTrigger>
            <TabsTrigger value="courses">Courses</TabsTrigger>
            <TabsTrigger value="rmp">RMP Ratings</TabsTrigger>
          </TabsList>

          {/* ── Faculty tab ── */}
          <TabsContent value="faculty">
            <Card>
              <CardContent className="p-0">
                {instructorsLoading ? (
                  <div className="p-4 space-y-2">
                    {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                  </div>
                ) : !instructors || instructors.length === 0 ? (
                  <EmptyState text="No data yet — run a scrape first." />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead className="hidden md:table-cell">Department</TableHead>
                          <TableHead className="hidden lg:table-cell">Email</TableHead>
                          <TableHead>Tenure</TableHead>
                          <TableHead className="hidden sm:table-cell">Source</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {instructors.map((inst) => (
                          <TableRow key={inst.id}>
                            <TableCell className="font-medium text-sm">{inst.name}</TableCell>
                            <TableCell className="text-sm text-muted-foreground hidden md:table-cell">
                              {inst.department?.name ?? "—"}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground hidden lg:table-cell">
                              {inst.email ?? "—"}
                            </TableCell>
                            <TableCell>
                              {inst.tenureStatus ? (
                                <Badge variant="outline" className="text-xs capitalize">
                                  {inst.tenureStatus.replace("_", " ")}
                                </Badge>
                              ) : "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">
                              Scraped
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Courses tab ── */}
          <TabsContent value="courses">
            <Card>
              <CardContent className="p-0">
                {coursesLoading ? (
                  <div className="p-4 space-y-2">
                    {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                  </div>
                ) : !courses || courses.length === 0 ? (
                  <EmptyState text="No data yet — run a scrape first." />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Code</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead className="hidden sm:table-cell">Days</TableHead>
                          <TableHead className="hidden sm:table-cell">Time</TableHead>
                          <TableHead className="hidden md:table-cell">Building / Room</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {courses.map((c) => (
                          <TableRow key={c.id}>
                            <TableCell className="font-mono text-sm font-medium">{c.code}</TableCell>
                            <TableCell className="text-sm">{c.name}</TableCell>
                            <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">
                              {c.daysOfWeek ?? "—"}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">
                              {c.lectureStartTime && c.lectureEndTime
                                ? `${c.lectureStartTime} – ${c.lectureEndTime}`
                                : c.lectureStartTime ?? "—"}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground hidden md:table-cell">
                              {[c.building, c.room].filter(Boolean).join(" ") || "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── RMP tab ── */}
          <TabsContent value="rmp">
            <Card>
              <CardContent className="p-0">
                {instructorsLoading ? (
                  <div className="p-4 space-y-2">
                    {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                  </div>
                ) : rmpRows.length === 0 ? (
                  <EmptyState text="No RMP data yet — run a scrape first." />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Avg Rating</TableHead>
                          <TableHead>Difficulty</TableHead>
                          <TableHead className="hidden sm:table-cell">Ratings</TableHead>
                          <TableHead className="hidden md:table-cell">Would Take Again</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rmpRows.map((inst) => (
                          <TableRow key={inst.id}>
                            <TableCell className="font-medium text-sm">{inst.name}</TableCell>
                            <TableCell>
                              <span className={`font-semibold ${inst.avgRating! >= 4 ? "text-green-600" : inst.avgRating! >= 3 ? "text-yellow-600" : "text-red-600"}`}>
                                {inst.avgRating?.toFixed(1)}
                              </span>
                              <span className="text-muted-foreground text-xs"> / 5</span>
                            </TableCell>
                            <TableCell className="text-sm">
                              {inst.avgDifficulty != null ? inst.avgDifficulty.toFixed(1) : "—"}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">
                              {inst.numRatings ?? "—"}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground hidden md:table-cell">
                              {inst.wouldTakeAgainPercent != null
                                ? `${Math.round(inst.wouldTakeAgainPercent)}%`
                                : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Pipeline() {
  const { toast } = useToast();
  const [scrapingIds, setScrapingIds] = useState<Set<number>>(new Set());
  const [retryingIds, setRetryingIds] = useState<Set<number>>(new Set());

  // Health — poll every 15s while jobs are active
  const { data: pipelineStatus, isLoading: statusLoading } = useQuery<{
    total: number; pending: number; running: number; complete: number; failed: number; healthy: boolean; timestamp: string;
  }>({
    queryKey: ["/api/scrape/status"],
    refetchInterval: (query) => {
      const s = query.state.data;
      return s && (s.pending > 0 || s.running > 0) ? 15000 : 60000;
    },
  });

  // Institutions list
  const { data: institutions, isLoading: instsLoading } = useQuery<Institution[]>({
    queryKey: ["/api/institutions"],
  });

  // Jobs list — poll every 30s while active jobs exist
  const { data: jobs, isLoading: jobsLoading } = useQuery<ScrapeJob[]>({
    queryKey: ["/api/scrape/jobs"],
    refetchInterval: (query) => {
      const data = query.state.data as ScrapeJob[] | undefined;
      const hasActive = data?.some((j) => j.status === "pending" || j.status === "running");
      return hasActive ? 30000 : false;
    },
  });

  const scrapeInstitution = useMutation({
    mutationFn: (institutionId: number) =>
      apiRequest("POST", `/api/scrape/institution/${institutionId}`),
    onMutate: (id) => setScrapingIds((prev) => new Set(prev).add(id)),
    onSuccess: (_data, id) => {
      setScrapingIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
      queryClient.invalidateQueries({ queryKey: ["/api/scrape/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scrape/status"] });
      toast({ title: "Scrape queued", description: "Jobs are running in the background." });
    },
    onError: (err: Error, id) => {
      setScrapingIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
      toast({ title: "Failed to queue scrape", description: err.message, variant: "destructive" });
    },
  });

  const retryInstitution = useMutation({
    mutationFn: (institutionId: number) =>
      apiRequest("POST", `/api/scrape/institution/${institutionId}`),
    onMutate: (id) => setRetryingIds((prev) => new Set(prev).add(id)),
    onSuccess: (_data, id) => {
      setRetryingIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
      queryClient.invalidateQueries({ queryKey: ["/api/scrape/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scrape/status"] });
      toast({ title: "Retry queued", description: "New jobs have been added to the pipeline." });
    },
    onError: (err: Error, id) => {
      setRetryingIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
      toast({ title: "Retry failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Layout>
      <div className="space-y-1">
        <h1 className="text-2xl md:text-3xl font-display font-bold">Data Pipeline</h1>
        <p className="text-muted-foreground">
          Scrape faculty directories, course schedules, RMP ratings, and syllabi by institution.
        </p>
      </div>

      <Tabs defaultValue="pipeline">
        <TabsList>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="scraped">Scraped Data</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline" className="space-y-6 mt-4">
          <HealthSummary status={pipelineStatus} isLoading={statusLoading} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <InstitutionsPanel
              institutions={institutions}
              isLoading={instsLoading}
              scrapingIds={scrapingIds}
              onScrape={(id) => scrapeInstitution.mutate(id)}
            />

            <Card className="lg:col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-muted-foreground text-xs font-semibold uppercase tracking-wider">
                  Job types queued per institution
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {Object.entries(JOB_TYPE_LABELS).map(([key, label]) => (
                  <div key={key} className="flex items-center gap-2 text-sm">
                    <span className="w-2 h-2 rounded-full bg-primary/60 shrink-0" />
                    <span>{label}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <JobsTable
            jobs={jobs}
            institutions={institutions}
            isLoading={jobsLoading}
            onRetry={(instId) => retryInstitution.mutate(instId)}
            retryingIds={retryingIds}
          />
        </TabsContent>

        <TabsContent value="scraped" className="mt-4">
          <ScrapedDataTab
            institutions={institutions}
            instsLoading={instsLoading}
            jobs={jobs}
          />
        </TabsContent>
      </Tabs>
    </Layout>
  );
}
