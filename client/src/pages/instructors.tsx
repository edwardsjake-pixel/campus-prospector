import { Layout } from "@/components/layout";
import { useInstructors, useCreateInstructor, useUpdateInstructor, useDeleteInstructor } from "@/hooks/use-instructors";
import { useCourses, useCreateCourse, useUpdateCourse, useDeleteCourse } from "@/hooks/use-courses";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Plus, Search, MapPin, Mail, Building2, Pencil, Trash2, Filter, 
  ChevronDown, ChevronRight, BookOpen, Clock, Monitor, Users, RefreshCw, DollarSign, Loader2
} from "lucide-react";
import { CsvImport } from "@/components/csv-import";
import { useState, useMemo, useEffect, Fragment } from "react";
import { useForm } from "react-hook-form";
import { InsertInstructor, InsertCourse } from "@shared/schema";
import type { Deal } from "@shared/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertInstructorSchema, insertCourseSchema } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

function InstructorForm({ 
  defaultValues, 
  onSubmit, 
  isPending, 
  submitLabel,
  onCancel 
}: { 
  defaultValues: InsertInstructor;
  onSubmit: (data: InsertInstructor) => void;
  isPending: boolean;
  submitLabel: string;
  onCancel: () => void;
}) {
  const form = useForm<InsertInstructor>({
    resolver: zodResolver(insertInstructorSchema),
    defaultValues,
  });

  useEffect(() => {
    form.reset(defaultValues);
  }, [defaultValues]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <Label>Name</Label>
              <FormControl><Input placeholder="Dr. Jane Smith" {...field} data-testid="input-instructor-name" /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <Label>Email</Label>
                <FormControl><Input placeholder="jane@university.edu" {...field} value={field.value || ''} data-testid="input-instructor-email" /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="targetPriority"
            render={({ field }) => (
              <FormItem>
                <Label>Priority</Label>
                <Select onValueChange={field.onChange} value={field.value || "medium"}>
                  <FormControl>
                    <SelectTrigger data-testid="select-instructor-priority">
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="institution"
          render={({ field }) => (
            <FormItem>
              <Label>Institution</Label>
              <FormControl><Input placeholder="State University" {...field} value={field.value || ''} data-testid="input-instructor-institution" /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="department"
            render={({ field }) => (
              <FormItem>
                <Label>Department</Label>
                <FormControl><Input placeholder="Computer Science" {...field} value={field.value || ''} data-testid="input-instructor-department" /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="officeLocation"
            render={({ field }) => (
              <FormItem>
                <Label>Office</Label>
                <FormControl><Input placeholder="Bldg 3, Rm 101" {...field} value={field.value || ''} data-testid="input-instructor-office" /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="bio"
          render={({ field }) => (
            <FormItem>
              <Label>Notes/Bio</Label>
              <FormControl><Textarea placeholder="Research interests, teaching style..." {...field} value={field.value || ''} data-testid="input-instructor-bio" /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onCancel} data-testid="button-cancel-instructor">Cancel</Button>
          <Button type="submit" disabled={isPending} data-testid="button-submit-instructor">
            {isPending ? "Saving..." : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}

const courseFormSchema = insertCourseSchema.extend({
  enrollment: z.coerce.number().default(0),
  instructorId: z.coerce.number().optional().nullable(),
  daysOfWeek: z.string().optional().nullable(),
  lectureStartTime: z.string().optional().nullable(),
  lectureEndTime: z.string().optional().nullable(),
  building: z.string().optional().nullable(),
  room: z.string().optional().nullable(),
});

type CourseFormData = z.infer<typeof courseFormSchema>;

function CourseForm({
  defaultValues,
  selectedDaysDefault,
  onSubmit,
  isPending,
  submitLabel,
  onCancel,
}: {
  defaultValues: CourseFormData;
  selectedDaysDefault: string[];
  onSubmit: (data: CourseFormData, selectedDays: string[]) => void;
  isPending: boolean;
  submitLabel: string;
  onCancel: () => void;
}) {
  const [selectedDays, setSelectedDays] = useState<string[]>(selectedDaysDefault);
  const form = useForm<CourseFormData>({
    resolver: zodResolver(courseFormSchema),
    defaultValues,
  });

  useEffect(() => {
    form.reset(defaultValues);
    setSelectedDays(selectedDaysDefault);
  }, [defaultValues]);

  const handleSubmit = (data: CourseFormData) => {
    onSubmit(data, selectedDays);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 pt-4">
        <div className="grid grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <Label>Code</Label>
                <FormControl><Input placeholder="CS101" {...field} data-testid="input-course-code" /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="term"
            render={({ field }) => (
              <FormItem className="col-span-2">
                <Label>Term</Label>
                <FormControl><Input placeholder="Fall 2024" {...field} data-testid="input-course-term" /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <Label>Course Name</Label>
              <FormControl><Input placeholder="Intro to Programming" {...field} data-testid="input-course-name" /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="format"
            render={({ field }) => (
              <FormItem>
                <Label>Format</Label>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-course-format">
                      <SelectValue placeholder="Format" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="in-person">In Person</SelectItem>
                    <SelectItem value="online">Online</SelectItem>
                    <SelectItem value="hybrid">Hybrid</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="enrollment"
            render={({ field }) => (
              <FormItem>
                <Label>Enrollment</Label>
                <FormControl><Input type="number" placeholder="150" {...field} data-testid="input-course-enrollment" /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="border-t pt-4 mt-2">
          <Label className="text-sm font-semibold mb-3 block">Lecture Schedule (optional)</Label>
          <div className="flex flex-wrap gap-2 mb-3">
            {["Monday","Tuesday","Wednesday","Thursday","Friday"].map(day => {
              const abbr = day.slice(0, 3);
              const checked = selectedDays.includes(day);
              return (
                <Button
                  key={day}
                  type="button"
                  variant={checked ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setSelectedDays(prev =>
                      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
                    );
                  }}
                  data-testid={`button-day-${abbr.toLowerCase()}`}
                >
                  {abbr}
                </Button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="lectureStartTime"
              render={({ field }) => (
                <FormItem>
                  <Label>Start Time</Label>
                  <FormControl><Input type="time" {...field} value={field.value || ""} data-testid="input-lecture-start" /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="lectureEndTime"
              render={({ field }) => (
                <FormItem>
                  <Label>End Time</Label>
                  <FormControl><Input type="time" {...field} value={field.value || ""} data-testid="input-lecture-end" /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="grid grid-cols-2 gap-4 mt-3">
            <FormField
              control={form.control}
              name="building"
              render={({ field }) => (
                <FormItem>
                  <Label>Building</Label>
                  <FormControl><Input placeholder="Science Hall" {...field} value={field.value || ""} data-testid="input-building" /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="room"
              render={({ field }) => (
                <FormItem>
                  <Label>Room</Label>
                  <FormControl><Input placeholder="200" {...field} value={field.value || ""} data-testid="input-room" /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onCancel} data-testid="button-cancel-course">Cancel</Button>
          <Button type="submit" disabled={isPending} data-testid="button-submit-course">
            {isPending ? "Saving..." : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}

const priorityColor = (priority: string | null) => {
  switch(priority) {
    case 'high': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
    case 'medium': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300';
    case 'low': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
    default: return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
  }
};

export default function Instructors() {
  const { data: instructors, isLoading } = useInstructors();
  const { data: allCourses } = useCourses();
  const { data: allDeals } = useQuery<Deal[]>({ queryKey: ["/api/deals"] });
  const { data: dealStageLabels } = useQuery<Record<string, string>>({ queryKey: ["/api/hubspot/deal-stages"] });
  const [search, setSearch] = useState("");
  const [institutionFilter, setInstitutionFilter] = useState<string>("all");
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreateCourseOpen, setIsCreateCourseOpen] = useState(false);
  const [createCourseForInstructor, setCreateCourseForInstructor] = useState<number | null>(null);
  const [editingInstructor, setEditingInstructor] = useState<any | null>(null);
  const [editingCourse, setEditingCourse] = useState<any | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deletingCourseId, setDeletingCourseId] = useState<number | null>(null);
  const { toast } = useToast();

  const createInstructor = useCreateInstructor();
  const updateInstructor = useUpdateInstructor();
  const deleteInstructor = useDeleteInstructor();
  const createCourse = useCreateCourse();
  const updateCourse = useUpdateCourse();
  const deleteCourse = useDeleteCourse();

  const hubspotSync = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/hubspot/sync", {
        companyNames: ["Purdue", "Indiana University Bloomington"],
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/instructors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hubspot/deal-stages"] });
      toast({
        title: "HubSpot sync complete",
        description: `${data.contactsFound} contacts found, ${data.instructorsCreated} created, ${data.instructorsUpdated} updated, ${data.dealsImported} deals imported${data.errors?.length ? ` (${data.errors.length} errors)` : ''}`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "HubSpot sync failed",
        description: err.message || "Could not sync with HubSpot",
        variant: "destructive",
      });
    },
  });

  const dealsByInstructor = useMemo(() => {
    const map = new Map<number, Deal[]>();
    if (allDeals) {
      for (const deal of allDeals) {
        if (deal.instructorId) {
          const list = map.get(deal.instructorId) || [];
          list.push(deal);
          map.set(deal.instructorId, list);
        }
      }
    }
    return map;
  }, [allDeals]);

  const institutions = useMemo(() => {
    const insts = new Set<string>();
    instructors?.forEach(i => {
      if (i.institution) insts.add(i.institution);
    });
    return Array.from(insts).sort();
  }, [instructors]);

  const filteredInstructors = useMemo(() => {
    let filtered = instructors || [];
    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter(i => 
        i.name.toLowerCase().includes(s) ||
        i.department?.toLowerCase().includes(s) ||
        i.institution?.toLowerCase().includes(s) ||
        i.courses?.some(c => c.name.toLowerCase().includes(s) || c.code.toLowerCase().includes(s))
      );
    }
    if (institutionFilter !== "all") {
      filtered = filtered.filter(i => i.institution === institutionFilter);
    }
    return filtered;
  }, [instructors, search, institutionFilter]);

  const toggleExpanded = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreateInstructor = (data: InsertInstructor) => {
    createInstructor.mutate(data, {
      onSuccess: () => {
        setIsCreateOpen(false);
        toast({ title: "Instructor added" });
      },
    });
  };

  const handleUpdateInstructor = (data: InsertInstructor) => {
    if (!editingInstructor) return;
    updateInstructor.mutate({ id: editingInstructor.id, ...data }, {
      onSuccess: () => {
        setEditingInstructor(null);
        toast({ title: "Instructor updated" });
      },
    });
  };

  const handleDeleteInstructor = () => {
    if (deletingId === null) return;
    deleteInstructor.mutate(deletingId, {
      onSuccess: () => {
        setDeletingId(null);
        toast({ title: "Instructor deleted" });
      },
    });
  };

  const handleCreateCourse = (data: CourseFormData, selectedDays: string[]) => {
    const submitData = {
      ...data,
      instructorId: createCourseForInstructor,
      daysOfWeek: selectedDays.length > 0 ? selectedDays.join(",") : null,
      lectureStartTime: data.lectureStartTime || null,
      lectureEndTime: data.lectureEndTime || null,
      building: data.building || null,
      room: data.room || null,
    };
    createCourse.mutate(submitData, {
      onSuccess: () => {
        setIsCreateCourseOpen(false);
        setCreateCourseForInstructor(null);
        toast({ title: "Course added" });
      },
    });
  };

  const handleUpdateCourse = (data: CourseFormData, selectedDays: string[]) => {
    if (!editingCourse) return;
    const submitData = {
      ...data,
      id: editingCourse.id,
      daysOfWeek: selectedDays.length > 0 ? selectedDays.join(",") : null,
      lectureStartTime: data.lectureStartTime || null,
      lectureEndTime: data.lectureEndTime || null,
      building: data.building || null,
      room: data.room || null,
    };
    updateCourse.mutate(submitData, {
      onSuccess: () => {
        setEditingCourse(null);
        toast({ title: "Course updated" });
      },
    });
  };

  const handleDeleteCourse = () => {
    if (deletingCourseId === null) return;
    deleteCourse.mutate(deletingCourseId, {
      onSuccess: () => {
        setDeletingCourseId(null);
        toast({ title: "Course deleted" });
      },
    });
  };

  const emptyInstructorDefaults: InsertInstructor = {
    name: "",
    email: "",
    department: "",
    institution: "",
    officeLocation: "",
    bio: "",
    targetPriority: "medium",
  };

  const emptyCourseDefaults: CourseFormData = {
    name: "",
    code: "",
    term: "Fall 2024",
    format: "in-person",
    enrollment: 0,
    daysOfWeek: "",
    lectureStartTime: "",
    lectureEndTime: "",
    building: "",
    room: "",
  };

  return (
    <Layout>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900" data-testid="text-faculty-title">Faculty & Courses</h1>
          <p className="text-slate-500">Manage your instructor contacts and their course sections.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => hubspotSync.mutate()}
            disabled={hubspotSync.isPending}
            data-testid="button-hubspot-sync"
          >
            {hubspotSync.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            {hubspotSync.isPending ? "Syncing..." : "Sync HubSpot"}
          </Button>
          <CsvImport type="instructors" />
          <CsvImport type="courses" />
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-instructor">
                <Plus className="w-4 h-4 mr-2" /> Add Instructor
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Add New Instructor</DialogTitle>
                <DialogDescription>Enter the instructor's details below.</DialogDescription>
              </DialogHeader>
              <InstructorForm
                defaultValues={emptyInstructorDefaults}
                onSubmit={handleCreateInstructor}
                isPending={createInstructor.isPending}
                submitLabel="Add Instructor"
                onCancel={() => setIsCreateOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <Input 
            placeholder="Search by name, department, institution, or course..." 
            className="pl-10 bg-white shadow-sm border-slate-200"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-instructors"
          />
        </div>
        <Select value={institutionFilter} onValueChange={setInstitutionFilter}>
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
      </div>

      <Card className="border-none shadow-md overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Institution</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Courses</TableHead>
                <TableHead>Deals</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Loading faculty...</TableCell>
                </TableRow>
              ) : filteredInstructors.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground" data-testid="text-no-instructors">No instructors found.</TableCell>
                </TableRow>
              ) : (
                filteredInstructors.map((instructor) => {
                  const isExpanded = expandedIds.has(instructor.id);
                  const courses = instructor.courses || [];
                  const officeHours = instructor.officeHours || [];
                  const instructorDeals = dealsByInstructor.get(instructor.id) || [];
                  const primaryBuilding = courses.find(c => c.building)?.building || null;
                  const locationParts = [primaryBuilding, instructor.officeLocation].filter(Boolean);
                  const fullLocation = locationParts.length > 0 ? locationParts.join(", ") : null;

                  return (
                    <Fragment key={instructor.id}>
                      <TableRow 
                        className="hover:bg-slate-50/50 transition-colors cursor-pointer" 
                        data-testid={`row-instructor-${instructor.id}`}
                        onClick={() => toggleExpanded(instructor.id)}
                      >
                        <TableCell className="w-8 px-2">
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-6 w-6"
                            onClick={(e) => { e.stopPropagation(); toggleExpanded(instructor.id); }}
                            data-testid={`button-expand-${instructor.id}`}
                          >
                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </Button>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-slate-900" data-testid={`text-name-${instructor.id}`}>{instructor.name}</div>
                          {instructor.department && (
                            <div className="text-xs text-slate-500">{instructor.department}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          {instructor.institution ? (
                            <div className="flex items-center text-sm text-slate-600">
                              <Building2 className="w-3 h-3 mr-2 text-slate-400" />
                              {instructor.institution}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">--</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {instructor.email && (
                            <div className="flex items-center text-sm text-slate-600">
                              <Mail className="w-3 h-3 mr-2 text-slate-400" />
                              {instructor.email}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {fullLocation && (
                            <div className="flex items-center text-sm text-slate-600">
                              <MapPin className="w-3 h-3 mr-2 text-slate-400" />
                              {fullLocation}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            <BookOpen className="w-3 h-3 mr-1" />
                            {courses.length}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {instructorDeals.length > 0 ? (
                            <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800">
                              <DollarSign className="w-3 h-3 mr-1" />
                              {instructorDeals.length}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">--</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={priorityColor(instructor.targetPriority)} variant="outline">
                            {(instructor.targetPriority || 'medium').toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={(e) => { e.stopPropagation(); setEditingInstructor(instructor); }}
                              data-testid={`button-edit-instructor-${instructor.id}`}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={(e) => { e.stopPropagation(); setDeletingId(instructor.id); }}
                              data-testid={`button-delete-instructor-${instructor.id}`}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>

                      {isExpanded && (
                        <TableRow key={`expanded-${instructor.id}`} className="bg-slate-50/70" data-testid={`expanded-row-${instructor.id}`}>
                          <TableCell colSpan={9} className="p-0">
                            <div className="px-6 py-4 space-y-4">
                              {(instructor.bio || instructor.notes) && (
                                <div className="text-sm text-slate-600">
                                  <span className="font-medium text-slate-700">Notes: </span>
                                  {instructor.bio || instructor.notes}
                                </div>
                              )}

                              {officeHours.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                                    <Clock className="w-3 h-3" /> Office Hours
                                  </h4>
                                  <div className="flex flex-wrap gap-2">
                                    {officeHours.map((oh: any) => (
                                      <Badge key={oh.id} variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800">
                                        {oh.dayOfWeek} {oh.startTime?.slice(0,5)}-{oh.endTime?.slice(0,5)}
                                        {oh.location ? ` @ ${oh.location}` : ""}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {instructorDeals.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                                    <DollarSign className="w-3 h-3" /> HubSpot Deals ({instructorDeals.length})
                                  </h4>
                                  <div className="flex flex-wrap gap-2">
                                    {instructorDeals.map((deal) => (
                                      <Badge
                                        key={deal.id}
                                        variant="outline"
                                        className="bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800"
                                        data-testid={`badge-deal-${deal.id}`}
                                      >
                                        <DollarSign className="w-3 h-3 mr-1" />
                                        {deal.dealName}
                                        {deal.stage && (
                                          <span className="ml-1.5 text-muted-foreground">
                                            {dealStageLabels?.[deal.stage] || deal.stage}
                                          </span>
                                        )}
                                        {deal.amount && (
                                          <span className="ml-1.5 font-semibold">
                                            ${Number(deal.amount).toLocaleString()}
                                          </span>
                                        )}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}

                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                                    <BookOpen className="w-3 h-3" /> Courses ({courses.length})
                                  </h4>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setCreateCourseForInstructor(instructor.id);
                                      setIsCreateCourseOpen(true);
                                    }}
                                    data-testid={`button-add-course-${instructor.id}`}
                                  >
                                    <Plus className="w-3 h-3 mr-1" /> Add Course
                                  </Button>
                                </div>

                                {courses.length === 0 ? (
                                  <p className="text-sm text-muted-foreground">No courses yet.</p>
                                ) : (
                                  <div className="border rounded-md overflow-hidden">
                                    <Table>
                                      <TableHeader className="bg-muted/50">
                                        <TableRow>
                                          <TableHead className="text-xs">Code</TableHead>
                                          <TableHead className="text-xs">Name</TableHead>
                                          <TableHead className="text-xs">Format</TableHead>
                                          <TableHead className="text-xs">Schedule</TableHead>
                                          <TableHead className="text-xs">Enrollment</TableHead>
                                          <TableHead className="text-xs text-right">Actions</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {courses.map((course: any) => (
                                          <TableRow key={course.id} data-testid={`row-course-${course.id}`}>
                                            <TableCell className="font-mono text-xs font-bold text-slate-600">
                                              {course.code}
                                            </TableCell>
                                            <TableCell className="text-sm">{course.name}</TableCell>
                                            <TableCell>
                                              <div className="flex items-center gap-1 text-xs">
                                                {course.format === 'online' ? (
                                                  <Monitor className="w-3 h-3 text-blue-500" />
                                                ) : (
                                                  <Users className="w-3 h-3 text-slate-500" />
                                                )}
                                                <span className="capitalize">{course.format}</span>
                                              </div>
                                            </TableCell>
                                            <TableCell>
                                              {course.daysOfWeek ? (
                                                <div className="text-xs text-slate-600">
                                                  <span className="font-medium">{course.daysOfWeek.split(",").map((d: string) => d.trim().slice(0, 3)).join("/")}</span>
                                                  {course.lectureStartTime && course.lectureEndTime && (
                                                    <span className="text-muted-foreground ml-1">
                                                      {course.lectureStartTime.slice(0, 5)}-{course.lectureEndTime.slice(0, 5)}
                                                    </span>
                                                  )}
                                                  {course.building && (
                                                    <span className="text-muted-foreground ml-1">
                                                      {course.building}{course.room ? ` ${course.room}` : ""}
                                                    </span>
                                                  )}
                                                </div>
                                              ) : (
                                                <span className="text-xs text-muted-foreground">--</span>
                                              )}
                                            </TableCell>
                                            <TableCell>
                                              <Badge variant={course.enrollment && course.enrollment > 100 ? "default" : "secondary"}>
                                                {course.enrollment || 0}
                                              </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                              <div className="flex items-center justify-end gap-1">
                                                <Button
                                                  size="icon"
                                                  variant="ghost"
                                                  onClick={() => setEditingCourse(course)}
                                                  data-testid={`button-edit-course-${course.id}`}
                                                >
                                                  <Pencil className="w-3.5 h-3.5" />
                                                </Button>
                                                <Button
                                                  size="icon"
                                                  variant="ghost"
                                                  onClick={() => setDeletingCourseId(course.id)}
                                                  data-testid={`button-delete-course-${course.id}`}
                                                >
                                                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                                                </Button>
                                              </div>
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editingInstructor} onOpenChange={(open) => { if (!open) setEditingInstructor(null); }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Instructor</DialogTitle>
            <DialogDescription>Update the instructor's details.</DialogDescription>
          </DialogHeader>
          {editingInstructor && (
            <InstructorForm
              defaultValues={{
                name: editingInstructor.name,
                email: editingInstructor.email || "",
                department: editingInstructor.department || "",
                institution: editingInstructor.institution || "",
                officeLocation: editingInstructor.officeLocation || "",
                bio: editingInstructor.bio || "",
                notes: editingInstructor.notes || "",
                targetPriority: editingInstructor.targetPriority || "medium",
              }}
              onSubmit={handleUpdateInstructor}
              isPending={updateInstructor.isPending}
              submitLabel="Save Changes"
              onCancel={() => setEditingInstructor(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateCourseOpen} onOpenChange={(open) => { if (!open) { setIsCreateCourseOpen(false); setCreateCourseForInstructor(null); } }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add Course</DialogTitle>
            <DialogDescription>
              Add a new course for {instructors?.find(i => i.id === createCourseForInstructor)?.name || "instructor"}.
            </DialogDescription>
          </DialogHeader>
          <CourseForm
            defaultValues={emptyCourseDefaults}
            selectedDaysDefault={[]}
            onSubmit={handleCreateCourse}
            isPending={createCourse.isPending}
            submitLabel="Add Course"
            onCancel={() => { setIsCreateCourseOpen(false); setCreateCourseForInstructor(null); }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingCourse} onOpenChange={(open) => { if (!open) setEditingCourse(null); }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Course</DialogTitle>
            <DialogDescription>Update the course details.</DialogDescription>
          </DialogHeader>
          {editingCourse && (
            <CourseForm
              defaultValues={{
                code: editingCourse.code,
                name: editingCourse.name,
                term: editingCourse.term,
                format: editingCourse.format,
                enrollment: editingCourse.enrollment || 0,
                instructorId: editingCourse.instructorId,
                daysOfWeek: editingCourse.daysOfWeek || "",
                lectureStartTime: editingCourse.lectureStartTime || "",
                lectureEndTime: editingCourse.lectureEndTime || "",
                building: editingCourse.building || "",
                room: editingCourse.room || "",
              }}
              selectedDaysDefault={editingCourse.daysOfWeek ? editingCourse.daysOfWeek.split(",").map((d: string) => d.trim()) : []}
              onSubmit={handleUpdateCourse}
              isPending={updateCourse.isPending}
              submitLabel="Save Changes"
              onCancel={() => setEditingCourse(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deletingId !== null} onOpenChange={(open) => { if (!open) setDeletingId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Instructor</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this instructor and all their associated courses, office hours, and planned meetings. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteInstructor} data-testid="button-confirm-delete">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deletingCourseId !== null} onOpenChange={(open) => { if (!open) setDeletingCourseId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Course</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this course. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-course">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCourse} data-testid="button-confirm-delete-course">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
