import { Layout } from "@/components/layout";
import { useVisits, useCreateVisit } from "@/hooks/use-visits";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon, MapPin, Plus } from "lucide-react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { InsertVisit } from "@shared/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertVisitSchema } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { useAuth } from "@/hooks/use-auth";

export default function Visits() {
  const { data: visits, isLoading } = useVisits();
  const { user } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const createVisit = useCreateVisit();

  const form = useForm<InsertVisit>({
    resolver: zodResolver(insertVisitSchema),
    defaultValues: {
      location: "",
      notes: "",
      date: new Date().toISOString().split('T')[0], // Today as YYYY-MM-DD
      userId: user?.id || "",
    },
  });

  const onSubmit = (data: InsertVisit) => {
    // Ensure userId is set
    if (!data.userId && user?.id) {
      data.userId = user.id;
    }
    
    createVisit.mutate(data, {
      onSuccess: () => {
        setIsDialogOpen(false);
        form.reset();
      },
    });
  };

  return (
    <Layout>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900">Campus Visits</h1>
          <p className="text-slate-500">Log your on-campus activity and outcomes.</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20">
              <Plus className="w-4 h-4 mr-2" /> Log Visit
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Log New Visit</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <Label>Date</Label>
                      <FormControl><Input type="date" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <Label>Location / Building</Label>
                      <FormControl><Input placeholder="Science Building, 3rd Floor" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <Label>Notes</Label>
                      <FormControl><Textarea placeholder="General observations..." {...field} value={field.value || ''} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={createVisit.isPending}>
                    {createVisit.isPending ? "Saving..." : "Save Visit"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6">
        {isLoading ? (
          <p className="text-center text-muted-foreground py-10">Loading visits...</p>
        ) : visits?.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-dashed">
            <MapPin className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-slate-900">No visits logged yet</h3>
            <p className="text-slate-500 mb-4">Start tracking your campus outreach.</p>
            <Button onClick={() => setIsDialogOpen(true)}>Log First Visit</Button>
          </div>
        ) : (
          visits?.map((visit) => (
            <Card key={visit.id} className="border-none shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/10 p-2.5 rounded-lg text-primary">
                      <MapPin className="w-5 h-5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{visit.location}</CardTitle>
                      <div className="flex items-center text-sm text-slate-500 mt-1">
                        <CalendarIcon className="w-3 h-3 mr-1" />
                        {format(new Date(visit.date), "EEEE, MMMM d, yyyy")}
                      </div>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm">Edit</Button>
                </div>
              </CardHeader>
              <CardContent>
                {visit.notes && (
                  <p className="text-slate-600 bg-slate-50 p-3 rounded-lg text-sm mb-4">
                    {visit.notes}
                  </p>
                )}
                
                <div className="border-t pt-4 mt-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Interactions</h4>
                  {visit.interactions.length === 0 ? (
                    <p className="text-sm text-slate-400 italic">No specific interactions recorded.</p>
                  ) : (
                    <div className="space-y-3">
                      {visit.interactions.map((interaction) => (
                        <div key={interaction.id} className="flex items-center justify-between text-sm">
                          <span className="font-medium text-slate-700">{interaction.instructor.name}</span>
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs capitalize">
                            {interaction.outcome?.replace('_', ' ')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </Layout>
  );
}
