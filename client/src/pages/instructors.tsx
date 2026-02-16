import { Layout } from "@/components/layout";
import { useInstructors, useCreateInstructor } from "@/hooks/use-instructors";
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
import { Plus, Search, MapPin, Mail, Building } from "lucide-react";
import { CsvImport } from "@/components/csv-import";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { InsertInstructor } from "@shared/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertInstructorSchema } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";

export default function Instructors() {
  const { data: instructors, isLoading } = useInstructors();
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const filteredInstructors = instructors?.filter(instructor => 
    instructor.name.toLowerCase().includes(search.toLowerCase()) ||
    instructor.department?.toLowerCase().includes(search.toLowerCase())
  );

  const createInstructor = useCreateInstructor();
  
  const form = useForm<InsertInstructor>({
    resolver: zodResolver(insertInstructorSchema),
    defaultValues: {
      name: "",
      email: "",
      department: "",
      officeLocation: "",
      bio: "",
      targetPriority: "medium",
    },
  });

  const onSubmit = (data: InsertInstructor) => {
    createInstructor.mutate(data, {
      onSuccess: () => {
        setIsDialogOpen(false);
        form.reset();
      },
    });
  };

  const priorityColor = (priority: string | null) => {
    switch(priority) {
      case 'high': return 'bg-red-100 text-red-700 hover:bg-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200';
      case 'low': return 'bg-green-100 text-green-700 hover:bg-green-200';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  return (
    <Layout>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">Instructors</h1>
          <p className="text-slate-500">Manage your contacts and target list.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <CsvImport type="instructors" />
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" /> Add Instructor
              </Button>
            </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Add New Instructor</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <Label>Name</Label>
                      <FormControl><Input placeholder="Dr. Jane Smith" {...field} /></FormControl>
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
                        <FormControl><Input placeholder="jane@university.edu" {...field} value={field.value || ''} /></FormControl>
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
                        <Select onValueChange={field.onChange} defaultValue={field.value || "medium"}>
                          <FormControl>
                            <SelectTrigger>
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

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="department"
                    render={({ field }) => (
                      <FormItem>
                        <Label>Department</Label>
                        <FormControl><Input placeholder="Computer Science" {...field} value={field.value || ''} /></FormControl>
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
                        <FormControl><Input placeholder="Bldg 3, Rm 101" {...field} value={field.value || ''} /></FormControl>
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
                      <FormControl><Textarea placeholder="Research interests, teaching style..." {...field} value={field.value || ''} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={createInstructor.isPending}>
                    {createInstructor.isPending ? "Adding..." : "Add Instructor"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
        <Input 
          placeholder="Search instructors by name or department..." 
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
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead className="text-right">Courses</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading instructors...</TableCell>
                </TableRow>
              ) : filteredInstructors?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No instructors found.</TableCell>
                </TableRow>
              ) : (
                filteredInstructors?.map((instructor) => (
                  <TableRow key={instructor.id} className="hover:bg-slate-50/50 transition-colors cursor-pointer">
                    <TableCell>
                      <div className="font-medium text-slate-900">{instructor.name}</div>
                      <div className="text-xs text-slate-500">{instructor.department}</div>
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
                      {instructor.officeLocation && (
                        <div className="flex items-center text-sm text-slate-600">
                          <MapPin className="w-3 h-3 mr-2 text-slate-400" />
                          {instructor.officeLocation}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={priorityColor(instructor.targetPriority)} variant="outline">
                        {(instructor.targetPriority || 'medium').toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary" className="bg-slate-100">
                        {(instructor as any).courses?.length || 0} Courses
                      </Badge>
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
