import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, BookOpen, Clock, Mail, MapPin, Building2 } from "lucide-react";
import type { Instructor, Course, OfficeHour } from "@shared/schema";

interface InstructorDetailProps {
  instructor: Instructor;
  courses?: Course[];
  officeHours?: OfficeHour[];
}

export function InstructorDetailToggle({ instructor, courses = [], officeHours = [] }: InstructorDetailProps) {
  const [expanded, setExpanded] = useState(false);

  const hasCourses = courses.length > 0;
  const hasOfficeHours = officeHours.length > 0;
  const hasNotes = !!(instructor.bio || instructor.notes);
  const hasDetail = hasCourses || hasOfficeHours || hasNotes || !!instructor.email;

  if (!hasDetail) return null;

  return (
    <div className="w-full">
      <Button
        size="sm"
        variant="ghost"
        className="text-[10px] text-muted-foreground"
        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
        data-testid={`button-detail-toggle-${instructor.id}`}
      >
        {expanded ? <ChevronUp className="w-3 h-3 mr-0.5" /> : <ChevronDown className="w-3 h-3 mr-0.5" />}
        {expanded ? "Less" : "Details"}
      </Button>

      {expanded && (
        <div
          className="mt-1 bg-muted/50 border rounded-md p-2 space-y-1.5 text-xs"
          onClick={(e) => e.stopPropagation()}
          data-testid={`detail-panel-${instructor.id}`}
        >
          {instructor.email && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Mail className="w-3 h-3 shrink-0" />
              <span className="truncate">{instructor.email}</span>
            </div>
          )}

          {instructor.officeLocation && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="truncate">{instructor.officeLocation}</span>
            </div>
          )}

          {hasNotes && (
            <p className="text-muted-foreground text-[11px] leading-snug">
              {instructor.bio || instructor.notes}
            </p>
          )}

          {hasOfficeHours && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5 flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" /> Office Hours
              </p>
              <div className="flex flex-wrap gap-1">
                {officeHours.map((oh) => (
                  <Badge key={oh.id} variant="secondary" className="text-[10px]">
                    {oh.dayOfWeek} {oh.startTime?.slice(0,5)}-{oh.endTime?.slice(0,5)}
                    {oh.location ? ` @ ${oh.location}` : ""}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {hasCourses && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5 flex items-center gap-1">
                <BookOpen className="w-2.5 h-2.5" /> Courses ({courses.length})
              </p>
              <div className="space-y-0.5">
                {courses.map((course) => (
                  <div key={course.id} className="text-[11px] flex items-start gap-1">
                    <span className="font-mono font-bold shrink-0">{course.code}</span>
                    <span className="text-muted-foreground">
                      {course.name}
                      {course.daysOfWeek && course.lectureStartTime && course.lectureEndTime && (
                        <span className="ml-1">
                          {course.daysOfWeek.split(",").map(d => d.trim().slice(0,3)).join("/")}
                          {" "}{course.lectureStartTime.slice(0,5)}-{course.lectureEndTime.slice(0,5)}
                        </span>
                      )}
                      {course.building && <span className="ml-1">{course.building}{course.room ? ` ${course.room}` : ""}</span>}
                      {course.enrollment ? <span className="ml-1">({course.enrollment})</span> : null}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
