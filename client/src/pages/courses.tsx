import { Layout } from "@/components/layout";
import { useCourses, useCreateCourse } from "@/hooks/use-courses";
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
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Search, Monitor, Users } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { InsertCourse } from "@shared/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertCourseSchema } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { z } from "zod";

export default function Courses() {
  const { data: courses, isLoading } = useCourses();
  const { data: instructors } = useInstructors();
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const filteredCourses = courses?.filter(course => 
    course.name.toLowerCase().includes(search.toLowerCase()) ||
    course.code.toLowerCase().includes(search.toLowerCase())
  );

  const createCourse = useCreateCourse();
  
  // Need to handle numeric enrollment from string input
  const formSchema = insertCourseSchema.extend({
    enrollment: z.coerce.number().default(0),
    instructorId: z.coerce.number().optional().nullable(),
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      code: "",
      term: "Fall 2024",
      format: "in-person",
      enrollment: 0,
    },
  });

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    createCourse.mutate(data, {
      onSuccess: () => {
        setIsDialogOpen(false);
        form.reset();
      },
    });
  };

  const getInstructorName = (id: number | null) => {
    if (!id) return "Unassigned";
    return instructors?.find(i => i.id === id)?.name || "Unknown";
  };

  return (
    <Layout>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">Courses</h1>
          <p className="text-slate-500">Track large lecture sections and online courses.</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20">
              <Plus className="w-4 h-4 mr-2" /> Add Course
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Add New Course</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="code"
                    render={({ field }) => (
                      <FormItem>
                        <Label>Code</Label>
                        <FormControl><Input placeholder="CS101" {...field} /></FormControl>
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
                        <FormControl><Input placeholder="Fall 2024" {...field} /></FormControl>
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
                      <FormControl><Input placeholder="Intro to Programming" {...field} /></FormControl>
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
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
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
                        <FormControl><Input type="number" placeholder="150" {...field} /></FormControl>
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
                      <Select onValueChange={field.onChange} defaultValue={field.value?.toString()}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select instructor" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {instructors?.map((instructor) => (
                            <SelectItem key={instructor.id} value={instructor.id.toString()}>
                              {instructor.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={createCourse.isPending}>
                    {createCourse.isPending ? "Adding..." : "Add Course"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
        <Input 
          placeholder="Search courses..." 
          className="pl-10 max-w-md bg-white shadow-sm border-slate-200"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card className="border-none shadow-md overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Format</TableHead>
                <TableHead>Enrollment</TableHead>
                <TableHead>Instructor</TableHead>
                <TableHead className="text-right">Term</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading courses...</TableCell>
                </TableRow>
              ) : filteredCourses?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No courses found.</TableCell>
                </TableRow>
              ) : (
                filteredCourses?.map((course) => (
                  <TableRow key={course.id} className="hover:bg-slate-50/50 transition-colors">
                    <TableCell className="font-mono text-xs font-bold text-slate-600">
                      {course.code}
                    </TableCell>
                    <TableCell className="font-medium text-slate-900">
                      {course.name}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {course.format === 'online' ? (
                          <Monitor className="w-3 h-3 text-blue-500" />
                        ) : (
                          <Users className="w-3 h-3 text-slate-500" />
                        )}
                        <span className="capitalize text-sm">{course.format}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={course.enrollment && course.enrollment > 100 ? "default" : "secondary"}>
                        {course.enrollment || 0} Students
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {getInstructorName(course.instructorId)}
                    </TableCell>
                    <TableCell className="text-right text-slate-500 text-sm">
                      {course.term}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Layout>
  );
}
