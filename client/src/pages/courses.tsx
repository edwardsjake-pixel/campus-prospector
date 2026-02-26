import { Layout } from "@/components/layout";
import { useCourses, useCreateCourse, useUpdateCourse, useDeleteCourse } from "@/hooks/use-courses";
import { useInstructors } from "@/hooks/use-instructors";
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
import { Plus, Search, Monitor, Users, Building2, Pencil, Trash2 } from "lucide-react";
import { CsvImport } from "@/components/csv-import";
import { useState, useMemo, useEffect } from "react";
import { useForm } from "react-hook-form";
import { InsertCourse } from "@shared/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertCourseSchema } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";

const formSchema = insertCourseSchema.extend({
  enrollment: z.coerce.number().default(0),
  instructorId: z.coerce.number().optional().nullable(),
  daysOfWeek: z.string().optional().nullable(),
  lectureStartTime: z.string().optional().nullable(),
  lectureEndTime: z.string().optional().nullable(),
  building: z.string().optional().nullable(),
  room: z.string().optional().nullable(),
});

type CourseFormData = z.infer<typeof formSchema>;

function CourseForm({
  defaultValues,
  selectedDaysDefault,
  instructors,
  onSubmit,
  isPending,
  submitLabel,
  onCancel,
}: {
  defaultValues: CourseFormData;
  selectedDaysDefault: string[];
  instructors: any[];
  onSubmit: (data: CourseFormData, selectedDays: string[]) => void;
  isPending: boolean;
  submitLabel: string;
  onCancel: () => void;
}) {
  const [selectedDays, setSelectedDays] = useState<string[]>(selectedDaysDefault);
  const form = useForm<CourseFormData>({
    resolver: zodResolver(formSchema),
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

        <FormField
          control={form.control}
          name="instructorId"
          render={({ field }) => (
            <FormItem>
              <Label>Instructor</Label>
              <Select onValueChange={field.onChange} value={field.value?.toString() || ""}>
                <FormControl>
                  <SelectTrigger data-testid="select-course-instructor">
                    <SelectValue placeholder="Select instructor" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {instructors.map((instructor) => (
                    <SelectItem key={instructor.id} value={instructor.id.toString()}>
                      {instructor.name}{(instructor as any).department?.institution?.name ? ` (${(instructor as any).department.institution.name})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

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

export default function Courses() {
  const { data: courses, isLoading } = useCourses();
  const { data: instructors } = useInstructors();
  const [search, setSearch] = useState("");
  const [institutionFilter, setInstitutionFilter] = useState<string>("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<any | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const { toast } = useToast();

  const createCourse = useCreateCourse();
  const updateCourse = useUpdateCourse();
  const deleteCourse = useDeleteCourse();

  const courseToInstructors = useMemo(() => {
    const map = new Map<number, { id: number; name: string; institutionName: string | null }[]>();
    instructors?.forEach(inst => {
      const instName = (inst as any).department?.institution?.name || null;
      inst.courses?.forEach((c: any) => {
        const existing = map.get(c.id) || [];
        if (!existing.some(e => e.id === inst.id)) {
          existing.push({ id: inst.id, name: inst.name, institutionName: instName });
        }
        map.set(c.id, existing);
      });
    });
    return map;
  }, [instructors]);

  const allInstitutions = useQuery<{ id: number; name: string; domain: string; state: string; classification: string }[]>({
    queryKey: ["/api/institutions"],
  });

  const institutions = useMemo(() => {
    if (!allInstitutions.data) return [];
    return allInstitutions.data.map(i => i.name).sort();
  }, [allInstitutions.data]);

  const getCourseInstructorNames = (courseId: number) => {
    const insts = courseToInstructors.get(courseId);
    if (!insts || insts.length === 0) return "Unassigned";
    return insts.map(i => i.name).join(", ");
  };

  const getCourseInstitution = (courseId: number) => {
    const insts = courseToInstructors.get(courseId);
    if (!insts || insts.length === 0) return null;
    return insts[0]?.institutionName || null;
  };

  const filteredCourses = useMemo(() => {
    let filtered = courses || [];
    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter(c => 
        c.name.toLowerCase().includes(s) ||
        c.code.toLowerCase().includes(s)
      );
    }
    if (institutionFilter !== "all") {
      filtered = filtered.filter(c => getCourseInstitution(c.id) === institutionFilter);
    }
    return filtered;
  }, [courses, search, institutionFilter, courseToInstructors]);

  const handleCreate = (data: CourseFormData, selectedDays: string[]) => {
    const submitData = {
      ...data,
      daysOfWeek: selectedDays.length > 0 ? selectedDays.join(",") : null,
      lectureStartTime: data.lectureStartTime || null,
      lectureEndTime: data.lectureEndTime || null,
      building: data.building || null,
      room: data.room || null,
    };
    createCourse.mutate(submitData, {
      onSuccess: () => {
        setIsCreateOpen(false);
        toast({ title: "Course added" });
      },
    });
  };

  const handleUpdate = (data: CourseFormData, selectedDays: string[]) => {
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

  const handleDelete = () => {
    if (deletingId === null) return;
    deleteCourse.mutate(deletingId, {
      onSuccess: () => {
        setDeletingId(null);
        toast({ title: "Course deleted" });
      },
    });
  };

  const emptyDefaults: CourseFormData = {
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
          <h1 className="text-2xl md:text-3xl font-display font-bold text-slate-900" data-testid="text-courses-title">Courses</h1>
          <p className="text-slate-500">Track large lecture sections and online courses.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <CsvImport type="courses" />
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-course">
                <Plus className="w-4 h-4 mr-2" /> Add Course
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Add New Course</DialogTitle>
                <DialogDescription>Enter the course details below.</DialogDescription>
              </DialogHeader>
              <CourseForm
                defaultValues={emptyDefaults}
                selectedDaysDefault={[]}
                instructors={instructors || []}
                onSubmit={handleCreate}
                isPending={createCourse.isPending}
                submitLabel="Add Course"
                onCancel={() => setIsCreateOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-0 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <Input 
            placeholder="Search courses..." 
            className="pl-10 bg-white shadow-sm border-slate-200"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-courses"
          />
        </div>
        <Select value={institutionFilter} onValueChange={setInstitutionFilter}>
          <SelectTrigger className="w-full sm:w-[200px]" data-testid="select-institution-filter">
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
          <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Instructor</TableHead>
                <TableHead className="hidden md:table-cell">Format</TableHead>
                <TableHead className="hidden md:table-cell">Schedule</TableHead>
                <TableHead className="hidden md:table-cell">Enrollment</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading courses...</TableCell>
                </TableRow>
              ) : filteredCourses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground" data-testid="text-no-courses">No courses found.</TableCell>
                </TableRow>
              ) : (
                filteredCourses.map((course) => (
                  <TableRow key={course.id} className="hover:bg-slate-50/50 transition-colors" data-testid={`row-course-${course.id}`}>
                    <TableCell className="font-mono text-xs font-bold text-slate-600" data-testid={`text-code-${course.id}`}>
                      {course.code}
                    </TableCell>
                    <TableCell className="font-medium text-slate-900" data-testid={`text-course-name-${course.id}`}>
                      {course.name}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-slate-600">{getCourseInstructorNames(course.id)}</div>
                      {getCourseInstitution(course.id) && (
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Building2 className="w-2.5 h-2.5" />
                          {getCourseInstitution(course.id)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex items-center gap-2">
                        {course.format === 'online' ? (
                          <Monitor className="w-3 h-3 text-blue-500" />
                        ) : (
                          <Users className="w-3 h-3 text-slate-500" />
                        )}
                        <span className="capitalize text-sm">{course.format}</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
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
                    <TableCell className="hidden md:table-cell">
                      <Badge variant={course.enrollment && course.enrollment > 100 ? "default" : "secondary"}>
                        {course.enrollment || 0} Students
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
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setDeletingId(course.id)}
                          data-testid={`button-delete-course-${course.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

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
                instructorId: courseToInstructors.get(editingCourse.id)?.[0]?.id || null,
                daysOfWeek: editingCourse.daysOfWeek || "",
                lectureStartTime: editingCourse.lectureStartTime || "",
                lectureEndTime: editingCourse.lectureEndTime || "",
                building: editingCourse.building || "",
                room: editingCourse.room || "",
              }}
              selectedDaysDefault={editingCourse.daysOfWeek ? editingCourse.daysOfWeek.split(",").map((d: string) => d.trim()) : []}
              instructors={instructors || []}
              onSubmit={handleUpdate}
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
            <AlertDialogTitle>Delete Course</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this course. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-course">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} data-testid="button-confirm-delete-course">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
