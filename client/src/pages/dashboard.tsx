import { Layout } from "@/components/layout";
import { StatCard } from "@/components/stat-card";
import { Users, BookOpen, MapPin, Calendar, ArrowRight } from "lucide-react";
import { useInstructors } from "@/hooks/use-instructors";
import { useCourses } from "@/hooks/use-courses";
import { useVisits } from "@/hooks/use-visits";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { format } from "date-fns";

export default function Dashboard() {
  const { data: instructors } = useInstructors();
  const { data: courses } = useCourses();
  const { data: visits } = useVisits();

  // Simple analytics
  const totalStudents = courses?.reduce((acc, curr) => acc + (curr.enrollment || 0), 0) || 0;
  const highPriorityTargets = instructors?.filter(i => i.targetPriority === 'high').length || 0;
  
  const upcomingVisits = visits
    ?.filter(v => new Date(v.date) >= new Date())
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 3);

  return (
    <Layout>
      <div className="space-y-2">
        <h1 className="text-3xl font-display font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500">Welcome back! Here's what's happening on campus today.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Active Instructors" 
          value={instructors?.length || 0} 
          icon={Users} 
          color="primary"
          trend="+12%"
          trendUp={true}
        />
        <StatCard 
          title="Student Reach" 
          value={totalStudents.toLocaleString()} 
          icon={BookOpen} 
          color="blue"
          trend="+5%"
          trendUp={true}
        />
        <StatCard 
          title="Campus Visits" 
          value={visits?.length || 0} 
          icon={MapPin} 
          color="orange"
        />
        <StatCard 
          title="High Priority" 
          value={highPriorityTargets} 
          icon={Calendar} 
          color="green"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Chart Area - Simplified placeholder for visual effect */}
        <Card className="lg:col-span-2 border-none shadow-md">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full bg-slate-50 rounded-xl flex items-center justify-center border border-dashed border-slate-200">
              <p className="text-slate-400 text-sm">Activity analytics chart would go here</p>
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Visits */}
        <Card className="border-none shadow-md h-full">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg">Upcoming Visits</CardTitle>
            <Link href="/visits">
              <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80">
                View All <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-4">
            {upcomingVisits?.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No upcoming visits scheduled.</p>
            ) : (
              upcomingVisits?.map((visit) => (
                <div key={visit.id} className="group flex items-start space-x-4 p-3 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                  <div className="bg-primary/10 text-primary p-2.5 rounded-lg group-hover:bg-primary group-hover:text-white transition-colors">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium text-sm leading-none">{visit.location}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(visit.date), "MMMM d, yyyy")}</p>
                    {visit.notes && (
                      <p className="text-xs text-slate-500 line-clamp-1">{visit.notes}</p>
                    )}
                  </div>
                </div>
              ))
            )}
            
            <Link href="/planner">
              <Button className="w-full mt-2" variant="outline">
                Schedule New Visit
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
