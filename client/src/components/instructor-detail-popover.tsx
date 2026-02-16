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
          className="absolute left-0 top-full z-30 bg-popover border rounded-md shadow-lg p-3 space-y-2 min-w-[280px] max-w-[380px]"
          onClick={(e) => e.stopPropagation()}
          data-testid={`detail-panel-${instructor.id}`}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium text-sm">{instructor.name}</p>
            {instructor.targetPriority && (
              <Badge variant="outline" className="text-[10px]">
                {instructor.targetPriority.toUpperCase()}
              </Badge>
            )}
          </div>

          {instructor.institution && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Building2 className="w-3 h-3 shrink-0" />
              {instructor.institution}
            </div>
          )}

          {instructor.email && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Mail className="w-3 h-3 shrink-0" />
              {instructor.email}
            </div>
          )}

          {instructor.officeLocation && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="w-3 h-3 shrink-0" />
              {instructor.officeLocation}
            </div>
          )}

          {hasNotes && (
            <p className="text-xs text-muted-foreground border-t pt-2">
              {instructor.bio || instructor.notes}
            </p>
          )}

          {hasOfficeHours && (
            <div className="border-t pt-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
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
            <div className="border-t pt-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
                <BookOpen className="w-2.5 h-2.5" /> Courses ({courses.length})
              </p>
              <div className="space-y-1">
                {courses.map((course) => (
                  <div key={course.id} className="text-xs flex items-start gap-1">
                    <span className="font-mono font-bold shrink-0">{course.code}</span>
                    <span className="text-muted-foreground">
                      {course.name}
                      {course.daysOfWeek && (
                        <span className="ml-1">
                          {course.daysOfWeek.split(",").map(d => d.trim().slice(0,3)).join("/")}
                          {course.lectureStartTime && course.lectureEndTime && (
                            <span> {course.lectureStartTime.slice(0,5)}-{course.lectureEndTime.slice(0,5)}</span>
                          )}
                        </span>
                      )}
                      {course.building && <span className="ml-1">{course.building}{course.room ? ` ${course.room}` : ""}</span>}
                      {course.enrollment ? <span className="ml-1">({course.enrollment} students)</span> : null}
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
