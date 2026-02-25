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
  ChevronDown, ChevronRight, BookOpen, Clock, Monitor, Users, RefreshCw, DollarSign, Loader2, Download, Check, X, Globe
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { CsvImport } from "@/components/csv-import";
import { useState, useMemo, useEffect, useCallback, Fragment } from "react";
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
          name="departmentId"
          render={({ field }) => (
            <FormItem>
              <Label>Department</Label>
              <FormControl><Input type="hidden" {...field} value={field.value || ''} /></FormControl>
              <p className="text-xs text-muted-foreground">Department is set via the institution hierarchy.</p>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
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

interface HubSpotPreviewContact {
  hubspotContactId: string;
  name: string;
  email: string;
  company: string;
  deals: { id: string; dealName: string; stage: string | null; amount: string | null; closeDate: string | null; pipeline: string | null }[];
  totalDealValue: number;
  alreadyImported: boolean;
}

function HubSpotImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const { data: dealStageLabels } = useQuery<Record<string, string>>({ queryKey: ["/api/hubspot/deal-stages"] });
  const [school, setSchool] = useState<string>("both");
  const [contacts, setContacts] = useState<HubSpotPreviewContact[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hasLoaded, setHasLoaded] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [recentOnly, setRecentOnly] = useState(true);

  const fetchContacts = useMutation({
    mutationFn: async ({ selectedSchool, query, recent }: { selectedSchool: string; query: string; recent: boolean }) => {
      if (query.trim()) {
        const res = await apiRequest("POST", "/api/hubspot/search-contacts", {
          school: selectedSchool,
          query: query.trim(),
          recentOnly: recent,
        });
        return res.json() as Promise<HubSpotPreviewContact[]>;
      } else {
        const res = await apiRequest("POST", "/api/hubspot/import-preview", {
          school: selectedSchool,
          recentOnly: recent,
        });
        return res.json() as Promise<HubSpotPreviewContact[]>;
      }
    },
    onSuccess: (data) => {
      setContacts(data);
      setSelected(new Set(data.filter(c => !c.alreadyImported).map(c => c.hubspotContactId)));
      setHasLoaded(true);
    },
    onError: (err: any) => {
      toast({ title: "Failed to load contacts", description: err.message, variant: "destructive" });
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      const contactsToImport = contacts.filter(c => selected.has(c.hubspotContactId));
      const res = await apiRequest("POST", "/api/hubspot/import", { contacts: contactsToImport });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/instructors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/courses"] });
      toast({
        title: "Import complete",
        description: `${data.instructorsCreated} contacts imported, ${data.dealsImported} deals added${data.coursesCreated ? `, ${data.coursesCreated} courses created` : ""}${data.skipped ? `, ${data.skipped} skipped` : ""}`,
      });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (open) {
      setContacts([]);
      setSelected(new Set());
      setHasLoaded(false);
      setSearchInput("");
      setRecentOnly(true);
      fetchContacts.mutate({ selectedSchool: school, query: "", recent: true });
    }
  }, [open]);

  const handleSchoolChange = useCallback((value: string) => {
    setSchool(value);
    setContacts([]);
    setSelected(new Set());
    setHasLoaded(false);
    fetchContacts.mutate({ selectedSchool: value, query: searchInput, recent: recentOnly });
  }, [searchInput, recentOnly]);

  const handleSearch = useCallback(() => {
    setContacts([]);
    setSelected(new Set());
    setHasLoaded(false);
    fetchContacts.mutate({ selectedSchool: school, query: searchInput, recent: recentOnly });
  }, [school, searchInput, recentOnly]);

  const handleRecentOnlyChange = useCallback((checked: boolean) => {
    setRecentOnly(checked);
    setContacts([]);
    setSelected(new Set());
    setHasLoaded(false);
    fetchContacts.mutate({ selectedSchool: school, query: searchInput, recent: checked });
  }, [school, searchInput]);

  const handleClearSearch = useCallback(() => {
    setSearchInput("");
    setContacts([]);
    setSelected(new Set());
    setHasLoaded(false);
    fetchContacts.mutate({ selectedSchool: school, query: "", recent: recentOnly });
  }, [school, recentOnly]);

  const selectableContacts = useMemo(() => contacts.filter(c => !c.alreadyImported), [contacts]);

  const toggleAll = useCallback(() => {
    if (selected.size === selectableContacts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectableContacts.map(c => c.hubspotContactId)));
    }
  }, [selected, selectableContacts]);

  const toggleOne = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const isLoading = fetchContacts.isPending;

  const getStageName = (stageId: string | null) => {
    if (!stageId) return null;
    return dealStageLabels?.[stageId] || stageId;
  };

  const isSearching = searchInput.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle data-testid="text-import-dialog-title">Import from HubSpot</DialogTitle>
          <DialogDescription>
            Search by name or email, or filter by school to see contacts with deals.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 flex-1 min-w-[200px]">
            <Input
              placeholder="Search by name or email..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              data-testid="input-hubspot-search"
            />
            <Button
              size="icon"
              variant="outline"
              onClick={handleSearch}
              disabled={isLoading}
              data-testid="button-hubspot-search"
            >
              <Search className="w-4 h-4" />
            </Button>
            {isSearching && (
              <Button
                size="icon"
                variant="ghost"
                onClick={handleClearSearch}
                disabled={isLoading}
                data-testid="button-clear-search"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
          <Select value={school} onValueChange={handleSchoolChange} data-testid="select-school">
            <SelectTrigger className="w-[200px]" data-testid="select-school-trigger">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="both" data-testid="select-school-both">Both Schools</SelectItem>
              <SelectItem value="purdue" data-testid="select-school-purdue">Purdue University</SelectItem>
              <SelectItem value="iu" data-testid="select-school-iu">IU Bloomington</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="recent-only"
            checked={recentOnly}
            onCheckedChange={(checked) => handleRecentOnlyChange(checked === true)}
            data-testid="checkbox-recent-only"
          />
          <label htmlFor="recent-only" className="text-sm text-muted-foreground cursor-pointer">
            Recent deals only (open + most recent closed-won)
          </label>
        </div>

        <div className="flex-1 overflow-auto min-h-0 border rounded-md">
          {isLoading ? (
            <div className="flex items-center justify-center py-12" data-testid="loading-hubspot-preview">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              <span className="text-sm text-muted-foreground">
                {isSearching ? "Searching HubSpot..." : "Loading contacts with deals..."}
              </span>
            </div>
          ) : contacts.length === 0 && hasLoaded ? (
            <div className="text-center py-12 text-muted-foreground" data-testid="text-no-contacts">
              <p className="text-sm">
                {isSearching
                  ? `No contacts found matching "${searchInput.trim()}".`
                  : "No contacts with open or won deals found at this school."}
              </p>
              <p className="text-xs mt-1">
                {isSearching
                  ? "Try a different name or email address."
                  : "Try searching for a specific contact by name or email."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selectableContacts.length > 0 && selected.size === selectableContacts.length}
                      onCheckedChange={toggleAll}
                      disabled={selectableContacts.length === 0}
                      data-testid="checkbox-select-all"
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Deals</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((contact) => (
                  <TableRow
                    key={contact.hubspotContactId}
                    className={contact.alreadyImported ? "opacity-50" : ""}
                    data-testid={`row-import-contact-${contact.hubspotContactId}`}
                  >
                    <TableCell>
                      {contact.alreadyImported ? (
                        <Check className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <Checkbox
                          checked={selected.has(contact.hubspotContactId)}
                          onCheckedChange={() => toggleOne(contact.hubspotContactId)}
                          data-testid={`checkbox-contact-${contact.hubspotContactId}`}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm" data-testid={`text-contact-name-${contact.hubspotContactId}`}>
                          {contact.name}
                          {contact.alreadyImported && (
                            <span className="text-xs text-muted-foreground ml-1">(imported)</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">{contact.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm" data-testid={`text-contact-company-${contact.hubspotContactId}`}>{contact.company}</span>
                    </TableCell>
                    <TableCell>
                      {contact.deals.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {contact.deals.map(d => (
                            <Badge
                              key={d.id}
                              variant="outline"
                              className="text-[10px] bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800 no-default-hover-elevate no-default-active-elevate"
                              data-testid={`badge-preview-deal-${d.id}`}
                            >
                              {d.dealName}
                              {getStageName(d.stage) && (
                                <span className="ml-1 opacity-70">({getStageName(d.stage)})</span>
                              )}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">No deals</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium" data-testid={`text-contact-value-${contact.hubspotContactId}`}>
                      {contact.totalDealValue > 0 ? `$${contact.totalDealValue.toLocaleString()}` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 pt-2 border-t">
          <p className="text-sm text-muted-foreground" data-testid="text-selected-count">
            {selected.size > 0
              ? `${selected.size} of ${selectableContacts.length} selected`
              : `${contacts.length} contact${contacts.length !== 1 ? "s" : ""} found`}
          </p>
          <Button
            onClick={() => importMutation.mutate()}
            disabled={selected.size === 0 || importMutation.isPending}
            data-testid="button-import-selected"
          >
            {importMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            {importMutation.isPending ? "Importing..." : `Import ${selected.size} Contact${selected.size !== 1 ? "s" : ""}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

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
  const [isImportOpen, setIsImportOpen] = useState(false);
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
        companyNames: ["Purdue University", "Indiana University Bloomington", "Indiana University"],
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

  const deleteDealMutation = useMutation({
    mutationFn: async (dealId: number) => {
      await apiRequest("DELETE", `/api/deals/${dealId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deals"] });
      toast({ title: "Deal deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to delete deal", description: err.message, variant: "destructive" });
    },
  });

  const [dealToDelete, setDealToDelete] = useState<{ id: number; name: string } | null>(null);

  const [isScrapeOpen, setIsScrapeOpen] = useState(false);
  const [scrapeUrls, setScrapeUrls] = useState("");
  const [scrapeSelectedDomain, setScrapeSelectedDomain] = useState("");
  const [scrapeSelectedName, setScrapeSelectedName] = useState("");
  const [scrapeInstitutionSearch, setScrapeInstitutionSearch] = useState("");

  const allInstitutions = useQuery<{ id: number; name: string; domain: string; state: string; classification: string }[]>({
    queryKey: ["/api/institutions"],
    enabled: isScrapeOpen,
  });

  const filteredScrapeInstitutions = useMemo(() => {
    if (!allInstitutions.data) return [];
    if (!scrapeInstitutionSearch) return allInstitutions.data;
    const q = scrapeInstitutionSearch.toLowerCase();
    return allInstitutions.data.filter(i =>
      i.name.toLowerCase().includes(q) || (i.domain || "").toLowerCase().includes(q) || (i.state || "").toLowerCase().includes(q)
    );
  }, [allInstitutions.data, scrapeInstitutionSearch]);

  const packbackScrape = useMutation({
    mutationFn: async () => {
      const urls = scrapeUrls
        .split("\n")
        .map((u) => u.trim())
        .filter((u) => u.length > 0);
      const res = await apiRequest("POST", "/api/scrape/packback", {
        urls: urls.length > 0 ? urls : undefined,
        domain: scrapeSelectedDomain || undefined,
        institutionName: scrapeSelectedName || undefined,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/instructors"] });
      toast({
        title: "Packback scrape complete",
        description: `Found ${data.total_found} contacts: ${data.created} created, ${data.updated} updated, ${data.existing} already existed`,
      });
      setIsScrapeOpen(false);
      setScrapeUrls("");
      setScrapeSelectedDomain("");
      setScrapeSelectedName("");
    },
    onError: (err: any) => {
      toast({
        title: "Packback scrape failed",
        description: err.message || "Could not scrape Packback contacts",
        variant: "destructive",
      });
    },
  });

  const institutions = useMemo(() => {
    const insts = new Set<string>();
    instructors?.forEach(i => {
      const instName = (i as any).department?.institution?.name;
      if (instName) insts.add(instName);
    });
    return Array.from(insts).sort();
  }, [instructors]);

  const filteredInstructors = useMemo(() => {
    let filtered = instructors || [];
    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter(i => {
        const dept = (i as any).department;
        const instName = dept?.institution?.name || "";
        const deptName = dept?.name || "";
        return i.name.toLowerCase().includes(s) ||
          deptName.toLowerCase().includes(s) ||
          instName.toLowerCase().includes(s) ||
          i.courses?.some(c => c.name.toLowerCase().includes(s) || c.code.toLowerCase().includes(s));
      });
    }
    if (institutionFilter !== "all") {
      filtered = filtered.filter(i => (i as any).department?.institution?.name === institutionFilter);
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
    departmentId: null,
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
          <Button
            variant="outline"
            onClick={() => setIsImportOpen(true)}
            data-testid="button-hubspot-import"
          >
            <Download className="w-4 h-4 mr-2" />
            Import from HubSpot
          </Button>
          <Button
            variant="outline"
            onClick={() => setIsScrapeOpen(true)}
            disabled={packbackScrape.isPending}
            data-testid="button-scrape-packback"
          >
            {packbackScrape.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Globe className="w-4 h-4 mr-2" />
            )}
            {packbackScrape.isPending ? "Scraping..." : "Find Packback Users"}
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
                          {(instructor as any).department?.name && (
                            <div className="text-xs text-slate-500">{(instructor as any).department.name}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          {(instructor as any).department?.institution?.name ? (
                            <div className="flex items-center text-sm text-slate-600">
                              <Building2 className="w-3 h-3 mr-2 text-slate-400" />
                              {(instructor as any).department.institution.name}
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
                              {(() => {
                                const total = instructorDeals.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
                                return `$${total.toLocaleString()}`;
                              })()}
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
                                      <div key={deal.id} className="flex items-center gap-0.5">
                                        <Badge
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
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          onClick={() => setDealToDelete({ id: deal.id, name: deal.dealName })}
                                          data-testid={`button-delete-deal-${deal.id}`}
                                        >
                                          <X className="w-3 h-3" />
                                        </Button>
                                      </div>
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
                departmentId: editingInstructor.departmentId,
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
                instructorId: null,
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
      <AlertDialog open={dealToDelete !== null} onOpenChange={(open) => { if (!open) setDealToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Deal</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{dealToDelete?.name}"? This will remove the deal from your local records. It will not affect HubSpot.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-deal">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (dealToDelete) {
                  deleteDealMutation.mutate(dealToDelete.id);
                  setDealToDelete(null);
                }
              }}
              data-testid="button-confirm-delete-deal"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <HubSpotImportDialog open={isImportOpen} onOpenChange={setIsImportOpen} />

      <Dialog open={isScrapeOpen} onOpenChange={setIsScrapeOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Find Packback Users</DialogTitle>
            <DialogDescription>
              Search university websites via Google to find syllabi and course pages that mention Packback. Matched faculty will be imported as instructors.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Target Institution</Label>
              <div className="mt-1 space-y-2">
                {scrapeSelectedDomain ? (
                  <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/50">
                    <Building2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{scrapeSelectedName}</p>
                      <p className="text-xs text-muted-foreground">{scrapeSelectedDomain}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => { setScrapeSelectedDomain(""); setScrapeSelectedName(""); setScrapeInstitutionSearch(""); }}
                      data-testid="button-clear-scrape-institution"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search 326 R1/R2 universities..."
                        value={scrapeInstitutionSearch}
                        onChange={(e) => setScrapeInstitutionSearch(e.target.value)}
                        className="pl-9"
                        data-testid="input-scrape-institution-search"
                      />
                    </div>
                    {scrapeInstitutionSearch && (
                      <div className="max-h-[200px] overflow-y-auto border rounded-md">
                        {allInstitutions.isLoading ? (
                          <div className="p-3 text-sm text-muted-foreground text-center">Loading institutions...</div>
                        ) : filteredScrapeInstitutions.length === 0 ? (
                          <div className="p-3 text-sm text-muted-foreground text-center">No matching institutions</div>
                        ) : (
                          filteredScrapeInstitutions.slice(0, 50).map((inst) => (
                            <button
                              key={inst.id}
                              className="w-full text-left px-3 py-2 hover:bg-accent text-sm border-b last:border-b-0 transition-colors"
                              onClick={() => {
                                setScrapeSelectedDomain(inst.domain);
                                setScrapeSelectedName(inst.name);
                                setScrapeInstitutionSearch("");
                              }}
                              data-testid={`option-institution-${inst.id}`}
                            >
                              <span className="font-medium">{inst.name}</span>
                              <span className="text-muted-foreground ml-2 text-xs">{inst.domain} · {inst.state} · {inst.classification}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Leave empty to search Purdue + Indiana (default)
                    </p>
                  </>
                )}
              </div>
            </div>
            <div>
              <Label>Custom URLs (optional)</Label>
              <Textarea
                placeholder={"Add university URLs to scrape, one per line.\nLeave empty to use Google site-search."}
                value={scrapeUrls}
                onChange={(e) => setScrapeUrls(e.target.value)}
                className="mt-1 min-h-[80px] font-mono text-sm"
                data-testid="input-scrape-urls"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsScrapeOpen(false)} data-testid="button-cancel-scrape">
                Cancel
              </Button>
              <Button
                onClick={() => packbackScrape.mutate()}
                disabled={packbackScrape.isPending}
                data-testid="button-start-scrape"
              >
                {packbackScrape.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Scraping...
                  </>
                ) : (
                  <>
                    <Globe className="w-4 h-4 mr-2" />
                    Start Scrape
                  </>
                )}
              </Button>
            </div>
            {packbackScrape.isPending && (
              <p className="text-sm text-muted-foreground text-center">
                This may take up to 2 minutes while we crawl the pages...
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
