import { useState, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Camera, Loader2, Trash2, Check, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { InstructorWithDetails } from "@shared/schema";

interface ScheduleEntry {
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  location: string;
  type: "office_hours" | "lecture";
}

interface ExtractedSchedule {
  instructorName?: string;
  entries: ScheduleEntry[];
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function SchedulePhotoCapture({ preselectedInstructorId }: { preselectedInstructorId?: number }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedSchedule | null>(null);
  const [editableEntries, setEditableEntries] = useState<ScheduleEntry[]>([]);
  const [selectedInstructorId, setSelectedInstructorId] = useState<string>(
    preselectedInstructorId ? String(preselectedInstructorId) : ""
  );
  const [extractedName, setExtractedName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const { data: instructors = [] } = useQuery<InstructorWithDetails[]>({
    queryKey: ["/api/instructors"],
  });

  const extractMutation = useMutation({
    mutationFn: async (base64Image: string) => {
      const res = await apiRequest("POST", "/api/schedule/extract-from-photo", {
        image: base64Image,
        instructorId: preselectedInstructorId,
      });
      return res.json() as Promise<ExtractedSchedule>;
    },
    onSuccess: (data) => {
      setExtractedData(data);
      setExtractedName(data.instructorName || "");
      setEditableEntries(
        data.entries.map((e) => ({
          ...e,
          location: e.location || "",
        }))
      );
      if (data.instructorName && !selectedInstructorId) {
        const match = instructors.find(
          (i) => i.name.toLowerCase().includes(data.instructorName!.toLowerCase())
        );
        if (match) {
          setSelectedInstructorId(String(match.id));
        }
      }
      setDialogOpen(true);
    },
    onError: (error: Error) => {
      toast({
        title: "Extraction failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/schedule/save-extracted", {
        instructorId: Number(selectedInstructorId),
        entries: editableEntries,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Schedule saved",
        description: `${data.created} schedule entries saved successfully.`,
      });
      setDialogOpen(false);
      setExtractedData(null);
      setEditableEntries([]);
      queryClient.invalidateQueries({ queryKey: ["/api/availability"] });
      queryClient.invalidateQueries({ queryKey: ["/api/office-hours"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Save failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      extractMutation.mutate(base64);
    };
    reader.readAsDataURL(file);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const updateEntry = (index: number, field: keyof ScheduleEntry, value: string) => {
    setEditableEntries((prev) =>
      prev.map((entry, i) =>
        i === index ? { ...entry, [field]: value } : entry
      )
    );
  };

  const removeEntry = (index: number) => {
    setEditableEntries((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileSelect}
        data-testid="input-schedule-photo"
      />
      <Button
        variant="outline"
        onClick={() => fileInputRef.current?.click()}
        disabled={extractMutation.isPending}
        data-testid="button-capture-schedule"
      >
        {extractMutation.isPending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Camera className="w-4 h-4" />
        )}
        <span className="ml-1.5">
          {extractMutation.isPending ? "Analyzing..." : "Scan Schedule"}
        </span>
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle data-testid="text-extracted-schedule-title">Extracted Schedule</DialogTitle>
          </DialogHeader>

          {extractedName && (
            <p className="text-sm text-muted-foreground" data-testid="text-extracted-instructor-name">
              Detected instructor: <span className="font-medium text-foreground">{extractedName}</span>
            </p>
          )}

          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Save to Instructor</label>
              <Select value={selectedInstructorId} onValueChange={setSelectedInstructorId}>
                <SelectTrigger data-testid="select-instructor-for-schedule">
                  <SelectValue placeholder="Select an instructor..." />
                </SelectTrigger>
                <SelectContent>
                  {instructors.map((inst) => (
                    <SelectItem key={inst.id} value={String(inst.id)}>
                      {inst.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {editableEntries.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground" data-testid="text-no-entries">
                No schedule entries were detected in the image.
              </div>
            ) : (
              <div className="space-y-3">
                {editableEntries.map((entry, index) => (
                  <Card key={index}>
                    <CardContent className="p-3">
                      <div className="flex items-start gap-2 flex-wrap">
                        <Badge
                          variant={entry.type === "office_hours" ? "default" : "secondary"}
                          data-testid={`badge-entry-type-${index}`}
                        >
                          {entry.type === "office_hours" ? "Office Hours" : "Lecture"}
                        </Badge>

                        <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2 min-w-0">
                          <Select
                            value={entry.dayOfWeek}
                            onValueChange={(val) => updateEntry(index, "dayOfWeek", val)}
                          >
                            <SelectTrigger data-testid={`select-day-${index}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {DAYS.map((d) => (
                                <SelectItem key={d} value={d}>{d}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <Input
                            type="time"
                            value={entry.startTime}
                            onChange={(e) => updateEntry(index, "startTime", e.target.value)}
                            data-testid={`input-start-time-${index}`}
                          />

                          <Input
                            type="time"
                            value={entry.endTime}
                            onChange={(e) => updateEntry(index, "endTime", e.target.value)}
                            data-testid={`input-end-time-${index}`}
                          />

                          <Input
                            placeholder="Location"
                            value={entry.location}
                            onChange={(e) => updateEntry(index, "location", e.target.value)}
                            data-testid={`input-location-${index}`}
                          />
                        </div>

                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removeEntry(index)}
                          data-testid={`button-remove-entry-${index}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              data-testid="button-cancel-schedule"
            >
              <X className="w-4 h-4 mr-1.5" />
              Cancel
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!selectedInstructorId || editableEntries.length === 0 || saveMutation.isPending}
              data-testid="button-save-schedule"
            >
              {saveMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
              ) : (
                <Check className="w-4 h-4 mr-1.5" />
              )}
              Save {editableEntries.length} {editableEntries.length === 1 ? "Entry" : "Entries"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
