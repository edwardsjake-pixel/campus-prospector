import { Layout } from "@/components/layout";
import { useInstructors, useCreateInstructor, useUpdateInstructor, useDeleteInstructor } from "@/hooks/use-instructors";
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
import { Plus, Search, MapPin, Mail, Building2, Pencil, Trash2, Filter } from "lucide-react";
import { CsvImport } from "@/components/csv-import";
import { useState, useMemo, useEffect } from "react";
import { useForm } from "react-hook-form";
import { InsertInstructor } from "@shared/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertInstructorSchema } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

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

export default function Instructors() {
  const { data: instructors, isLoading } = useInstructors();
  const [search, setSearch] = useState("");
  const [institutionFilter, setInstitutionFilter] = useState<string>("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingInstructor, setEditingInstructor] = useState<any | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const { toast } = useToast();

  const createInstructor = useCreateInstructor();
  const updateInstructor = useUpdateInstructor();
  const deleteInstructor = useDeleteInstructor();

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
        i.institution?.toLowerCase().includes(s)
      );
    }
    if (institutionFilter !== "all") {
      filtered = filtered.filter(i => i.institution === institutionFilter);
    }
    return filtered;
  }, [instructors, search, institutionFilter]);

  const handleCreate = (data: InsertInstructor) => {
    createInstructor.mutate(data, {
      onSuccess: () => {
        setIsCreateOpen(false);
        toast({ title: "Instructor added" });
      },
    });
  };

  const handleUpdate = (data: InsertInstructor) => {
    if (!editingInstructor) return;
    updateInstructor.mutate({ id: editingInstructor.id, ...data }, {
      onSuccess: () => {
        setEditingInstructor(null);
        toast({ title: "Instructor updated" });
      },
    });
  };

  const handleDelete = () => {
    if (deletingId === null) return;
    deleteInstructor.mutate(deletingId, {
      onSuccess: () => {
        setDeletingId(null);
        toast({ title: "Instructor deleted" });
      },
    });
  };

  const priorityColor = (priority: string | null) => {
    switch(priority) {
      case 'high': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
      case 'medium': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300';
      case 'low': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
      default: return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
    }
  };

  const emptyDefaults: InsertInstructor = {
    name: "",
    email: "",
    department: "",
    institution: "",
    officeLocation: "",
    bio: "",
    targetPriority: "medium",
  };

  return (
    <Layout>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900" data-testid="text-instructors-title">Instructors</h1>
          <p className="text-slate-500">Manage your contacts and target list.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <CsvImport type="instructors" />
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
                defaultValues={emptyDefaults}
                onSubmit={handleCreate}
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
            placeholder="Search by name, department, or institution..." 
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
                <TableHead>Name</TableHead>
                <TableHead>Institution</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading instructors...</TableCell>
                </TableRow>
              ) : filteredInstructors.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground" data-testid="text-no-instructors">No instructors found.</TableCell>
                </TableRow>
              ) : (
                filteredInstructors.map((instructor) => (
                  <TableRow key={instructor.id} className="hover:bg-slate-50/50 transition-colors" data-testid={`row-instructor-${instructor.id}`}>
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
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setEditingInstructor(instructor)}
                          data-testid={`button-edit-instructor-${instructor.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setDeletingId(instructor.id)}
                          data-testid={`button-delete-instructor-${instructor.id}`}
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
              onSubmit={handleUpdate}
              isPending={updateInstructor.isPending}
              submitLabel="Save Changes"
              onCancel={() => setEditingInstructor(null)}
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
            <AlertDialogAction onClick={handleDelete} data-testid="button-confirm-delete">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
