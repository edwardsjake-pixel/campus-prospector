import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Upload, FileSpreadsheet, ArrowRight, Check } from "lucide-react";

interface CsvImportProps {
  type: "instructors" | "courses";
  onComplete?: () => void;
}

const INSTRUCTOR_FIELDS = [
  { key: "name", label: "Name", required: true },
  { key: "email", label: "Email" },
  { key: "department", label: "Department" },
  { key: "officeLocation", label: "Office Location" },
  { key: "largestCourse", label: "Largest Course" },
  { key: "bio", label: "Bio" },
  { key: "notes", label: "Notes" },
  { key: "targetPriority", label: "Priority (low/medium/high)" },
];

const COURSE_FIELDS = [
  { key: "code", label: "Course Code", required: true },
  { key: "name", label: "Course Name", required: true },
  { key: "term", label: "Term", required: true },
  { key: "format", label: "Format (online/in-person/hybrid)" },
  { key: "enrollment", label: "Enrollment" },
  { key: "instructorId", label: "Instructor ID" },
];

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

export function CsvImport({ type, onComplete }: CsvImportProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"upload" | "map" | "preview">("upload");
  const [csvData, setCsvData] = useState<{ headers: string[]; rows: string[][] }>({ headers: [], rows: [] });
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const fields = type === "instructors" ? INSTRUCTOR_FIELDS : COURSE_FIELDS;

  const importMutation = useMutation({
    mutationFn: async (rows: Record<string, any>[]) => {
      const endpoint = type === "instructors" ? "/api/import/instructors" : "/api/import/courses";
      return apiRequest("POST", endpoint, { rows });
    },
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/instructors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/courses"] });
      let desc = `${data.imported} ${type} imported successfully.`;
      if (data.skipped) desc += ` ${data.skipped} duplicates skipped.`;
      if (data.coursesCreated) desc += ` ${data.coursesCreated} courses created.`;
      toast({ title: "Import complete", description: desc });
      resetAndClose();
      onComplete?.();
    },
    onError: () => {
      toast({ title: "Import failed", description: "Check your data and try again.", variant: "destructive" });
    },
  });

  const resetAndClose = () => {
    setStep("upload");
    setCsvData({ headers: [], rows: [] });
    setMapping({});
    setOpen(false);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.headers.length === 0) {
        toast({ title: "Empty file", description: "No data found in CSV.", variant: "destructive" });
        return;
      }
      setCsvData(parsed);
      const autoMap: Record<string, string> = {};
      fields.forEach(f => {
        const normalizedKey = f.key.toLowerCase().replace(/[_\s]/g, "");
        const normalizedLabel = f.label.toLowerCase().replace(/[_\s]/g, "");
        const match = parsed.headers.find(h => {
          const nh = h.toLowerCase().replace(/[_\s]/g, "");
          return nh === normalizedKey
            || nh === normalizedLabel
            || h.toLowerCase().includes(f.key.toLowerCase())
            || h.toLowerCase().includes(f.label.toLowerCase())
            || f.label.toLowerCase().includes(h.toLowerCase());
        });
        if (match) autoMap[f.key] = match;
      });
      setMapping(autoMap);
      setStep("map");
    };
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  const getMappedRows = (): Record<string, any>[] => {
    return csvData.rows.map(row => {
      const obj: Record<string, any> = {};
      fields.forEach(field => {
        const csvHeader = mapping[field.key];
        if (csvHeader) {
          const idx = csvData.headers.indexOf(csvHeader);
          if (idx >= 0) obj[field.key] = row[idx];
        }
      });
      return obj;
    });
  };

  const requiredMapped = fields.filter(f => f.required).every(f => mapping[f.key]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetAndClose(); else setOpen(true); }}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid={`button-import-${type}`}>
          <Upload className="w-4 h-4 mr-2" />
          Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            Import {type === "instructors" ? "Instructors" : "Courses"} from CSV
          </DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload a CSV file exported from Google Sheets or Excel. The first row should be column headers.
            </p>
            <div className="border-2 border-dashed rounded-md p-8 text-center">
              <Upload className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground mb-3">Drag & drop or click to browse</p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.txt"
                onChange={handleFile}
                className="hidden"
                data-testid="input-csv-file"
              />
              <Button variant="outline" onClick={() => fileRef.current?.click()} data-testid="button-browse-csv">
                Choose File
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              <p className="font-medium mb-1">Expected columns for {type}:</p>
              <p>{fields.map(f => f.label + (f.required ? " *" : "")).join(", ")}</p>
            </div>
          </div>
        )}

        {step === "map" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Map your CSV columns to the right fields. We auto-matched what we could.
            </p>
            <div className="space-y-3">
              {fields.map(field => (
                <div key={field.key} className="flex items-center gap-3">
                  <span className="text-sm font-medium w-40 flex-shrink-0">
                    {field.label}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                  </span>
                  <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <Select
                    value={mapping[field.key] || ""}
                    onValueChange={(v) => setMapping(prev => ({ ...prev, [field.key]: v }))}
                  >
                    <SelectTrigger className="flex-1" data-testid={`select-map-${field.key}`}>
                      <SelectValue placeholder="Select CSV column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__skip__">-- Skip --</SelectItem>
                      {csvData.headers.map(h => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {mapping[field.key] && mapping[field.key] !== "__skip__" && (
                    <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between gap-2 pt-2">
              <Button variant="ghost" onClick={() => setStep("upload")}>Back</Button>
              <Button onClick={() => setStep("preview")} disabled={!requiredMapped} data-testid="button-preview-import">
                Preview ({csvData.rows.length} rows)
              </Button>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                Review the data below. {csvData.rows.length} rows will be imported.
              </p>
              <Badge variant="secondary">{csvData.rows.length} rows</Badge>
            </div>
            <div className="border rounded-md overflow-auto max-h-60">
              <Table>
                <TableHeader>
                  <TableRow>
                    {fields.filter(f => mapping[f.key] && mapping[f.key] !== "__skip__").map(f => (
                      <TableHead key={f.key}>{f.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {getMappedRows().slice(0, 5).map((row, i) => (
                    <TableRow key={i}>
                      {fields.filter(f => mapping[f.key] && mapping[f.key] !== "__skip__").map(f => (
                        <TableCell key={f.key} className="text-sm">{row[f.key] || ""}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                  {csvData.rows.length > 5 && (
                    <TableRow>
                      <TableCell colSpan={fields.length} className="text-center text-sm text-muted-foreground">
                        ...and {csvData.rows.length - 5} more rows
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-between gap-2 pt-2">
              <Button variant="ghost" onClick={() => setStep("map")}>Back</Button>
              <Button
                onClick={() => importMutation.mutate(getMappedRows())}
                disabled={importMutation.isPending}
                data-testid="button-confirm-import"
              >
                {importMutation.isPending ? "Importing..." : `Import ${csvData.rows.length} ${type}`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
